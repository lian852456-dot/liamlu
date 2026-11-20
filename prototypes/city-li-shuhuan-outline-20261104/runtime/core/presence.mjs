import {randomUUID,timingSafeEqual} from 'node:crypto';
import {createRequire} from 'node:module';
import WebSocket from './vendor/ws/index.js';
import {GameError} from './game-store.mjs';
import {STORES} from './game-config.mjs';
import {SocialInteractions} from './social-interactions.mjs';
import {ForestPlaygroundServer} from './forest-playground-server.mjs';
const require=createRequire(import.meta.url),R=require('./scene-rules.js'),N=require('./nav.js');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const shape=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
const normalized=value=>Math.atan2(Math.sin(value),Math.cos(value));

export class Presence {
 constructor(store,{now=()=>Date.now()}={}){
  this.store=store;this.now=now;this.clients=new Map();this.pending=new Set();
  this.social=new SocialInteractions({clients:this.clients,position:uid=>this.position(uid),send:(c,m)=>this.send(c,m),name:uid=>this.store.user(uid).nickname,now});
  this.playground=new ForestPlaygroundServer({clock:now,getPresence:uid=>{const c=this.clients.get(uid);return{connected:!!c&&c.ws.readyState===WebSocket.OPEN,position:this.position(uid)};}});
  this.counters={inputMessages:0,outputMessages:0,inBytes:0,outBytes:0,persistedWrites:0,rejections:0};
  store.db.exec(`CREATE TABLE IF NOT EXISTS v42_positions(user_id TEXT PRIMARY KEY REFERENCES users(id),scene TEXT NOT NULL,zone TEXT NOT NULL,x REAL NOT NULL,z REAL NOT NULL,heading REAL NOT NULL,moving INTEGER NOT NULL,action TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);`);
  const mapVersion=R.mapVersion||'cozy-pocket-taipei-v1';
  if(store.get("SELECT value FROM v4_metadata WHERE key='city_map_version'")?.value!==mapVersion){
   store.tx(()=>{for(const p of store.all("SELECT * FROM v42_positions WHERE scene='outdoor'")){const door=R.storeDoors[p.zone]||R.storeDoors[store.user(p.user_id).store_id]||R.storeDoors.jiuquan;store.run("UPDATE v42_positions SET x=?,z=?,moving=0,action='',revision=revision+1,updated_at=? WHERE user_id=?",door.x,door.z,this.now(),p.user_id);}store.run("INSERT OR REPLACE INTO v4_metadata VALUES('city_map_version',?)",mapVersion);});
  }
  this.wss=new WebSocket.WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
  this.tickTimer=setInterval(()=>this.tick(),200);this.tickTimer.unref();
  this.pingTimer=setInterval(()=>{for(const c of this.pending)if(!c.ws.alive)c.ws.terminate();else{c.ws.alive=false;c.ws.ping()}},5000);this.pingTimer.unref();
 }
 metrics(){const memory=process.memoryUsage(),cpu=process.cpuUsage();return{...this.counters,connections:this.clients.size,pendingConnections:this.pending.size,snapshotHz:5,clientPoseHz:10,nearRadius:R.nearRadius,serverMemoryBytes:memory.rss,serverHeapBytes:memory.heapUsed,serverCpuMicros:cpu.user+cpu.system,serverUptimeMs:Math.round(process.uptime()*1000)};}
 obstacles(scene,zone='jiuquan',uid=null){if(scene==='home'){if(!uid)throw new GameError('HOME_PRIVATE',403);return[...R.obstacles.indoor,...R.placementObstacles(this.store.ownHome(uid).space)];}return[...R.obstacles[scene],...(scene==='indoor'?R.placementObstacles(this.store.space('demo-'+zone+'-1','store:'+zone)):[])];}
 position(uid){
  const user=this.store.user(uid),entry=user.account_kind==='guest'?(R.storeSpawns[user.store_id]||R.spawn):R.door;
  const p=this.store.get('SELECT * FROM v42_positions WHERE user_id=?',uid);
  return p?{scene:p.scene,zone:p.zone,x:p.x,z:p.z,heading:p.heading,moving:!!p.moving,action:p.action,revision:p.revision,updatedAt:p.updated_at}:{scene:user.account_kind==='guest'?'outdoor':'indoor',zone:user.store_id,x:entry.x,z:entry.z,heading:0,moving:false,action:'',revision:0,updatedAt:this.now()};
 }
 persist(uid,pose){
  const previous=this.position(uid);
  if(previous.revision>0&&['scene','zone','x','z','heading','moving'].every(key=>previous[key]===pose[key])&&(previous.action||'')===(pose.action||''))return previous;
  const result={...pose,revision:previous.revision+1,updatedAt:this.now()};
  this.store.run('INSERT INTO v42_positions VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET scene=excluded.scene,zone=excluded.zone,x=excluded.x,z=excluded.z,heading=excluded.heading,moving=excluded.moving,action=excluded.action,revision=excluded.revision,updated_at=excluded.updated_at',uid,result.scene,result.zone,result.x,result.z,result.heading,result.moving?1:0,result.action||'',result.revision,result.updatedAt);
  this.counters.persistedWrites++;return result;
 }
 forestPortal(id='legacy'){const portal=R.forest.portals.find(p=>p.id===id);if(!portal)throw new GameError('INVALID_FOREST_PORTAL',400);return portal;}
 enterForest(uid,portalId='legacy'){const portal=this.forestPortal(portalId),old=this.position(uid);if(old.scene==='forest')return{pose:old};if(old.scene!=='outdoor'||distance(old,portal.city)>1.5)throw new GameError('FOREST_GATE_TOO_FAR',409);this.store.run('INSERT OR REPLACE INTO v4_metadata VALUES(?,?)','forest-return:'+uid,JSON.stringify({...old,forestPortalId:portal.id}));const pose=this.persist(uid,{scene:'forest',zone:old.zone,...portal.forest,heading:portal.auto?-Math.PI/2:0,moving:false,action:''});const c=this.clients.get(uid);if(c){c.budget=.5;c.lastMove=this.now();c.lastPayload='';}return{pose,portalId:portal.id};}
 leaveForest(uid,portalId='legacy'){const portal=this.forestPortal(portalId),old=this.position(uid);if(old.scene!=='forest')return{pose:old};if(distance(old,portal.forestExit)>1.5)throw new GameError('FOREST_EXIT_TOO_FAR',409);let target;try{target=JSON.parse(this.store.get('SELECT value FROM v4_metadata WHERE key=?','forest-return:'+uid)?.value||'null');}catch{}if(!target||target.scene!=='outdoor'||!STORES.some(row=>row.id===target.zone))target={scene:'outdoor',zone:old.zone,heading:0};const pose=this.persist(uid,{...target,...portal.cityReturn,heading:portal.auto?Math.PI/2:target.heading,moving:false,action:''});const c=this.clients.get(uid);if(c){c.budget=.5;c.lastMove=this.now();c.lastPayload='';}return{pose,portalId:portal.id};}
 enterHome(uid){if(this.position(uid).scene==='forest')throw new GameError('RETURN_TO_CITY_REQUIRED',409);const owned=this.store.ownHome(uid),old=this.position(uid);if(old.scene!=='home'){this.store.run('INSERT OR REPLACE INTO v4_metadata VALUES(?,?)','home-return:'+uid,JSON.stringify(old));this.persist(uid,{scene:'home',zone:old.zone,...R.door,heading:0,moving:false,action:''});}const c=this.clients.get(uid);if(c){c.budget=.5;c.lastMove=this.now();c.lastPayload='';}return{...owned,pose:this.position(uid)};}
 leaveHome(uid){const old=this.position(uid);if(old.scene!=='home')return{pose:old};let target;try{target=JSON.parse(this.store.get('SELECT value FROM v4_metadata WHERE key=?','home-return:'+uid)?.value||'null');}catch{}if(!target||!['outdoor','indoor'].includes(target.scene)||!STORES.some(row=>row.id===target.zone)||![target.x,target.z].every(Number.isFinite)||N.blocked(target,this.obstacles(target.scene,target.zone,uid),R.bounds[target.scene]))target={...R.spawn,zone:this.store.user(uid).store_id,...(R.storeSpawns[this.store.user(uid).store_id]||R.spawn)};const pose=this.persist(uid,{...target,moving:false,action:''});const c=this.clients.get(uid);if(c){c.budget=.5;c.lastMove=this.now();c.lastPayload='';}return{pose};}
 safePosition(uid){
  const p=this.position(uid);
  if(p.action==='sit'||!N.blocked(p,this.obstacles(p.scene,p.zone,uid),R.bounds[p.scene]))return p;
  // Shared decoration can change while an employee is offline. Rejoin at a
  // safe scene entry rather than inside a newly placed object.
  const candidates=p.scene==='forest'?[R.forest.entry]:['indoor','home'].includes(p.scene)?[R.door,{x:0,z:2.4},{x:2.8,z:2.5},{x:3,z:-1.8},{x:0,z:-1.5}]:[R.storeSpawns[p.zone]||R.spawn];const safe=candidates.find(point=>!N.blocked(point,this.obstacles(p.scene,p.zone,uid),R.bounds[p.scene]));if(!safe)throw new GameError('NO_SAFE_SCENE_ENTRY',409);return this.persist(uid,{...p,...safe,moving:false,action:''});
 }
 attach(server,validateUpgrade){
  server.on('upgrade',(req,socket,head)=>{
   try{
    if(req.url!=='/api/live'||this.pending.size>=40)throw Error('UPGRADE_DENIED');
    const {auth,token}=validateUpgrade(req);
    this.wss.handleUpgrade(req,socket,head,ws=>this.connect(ws,auth,token));
   }catch{socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');socket.destroy();}
  });
 }
 send(c,message){if(c.ws.readyState!==WebSocket.OPEN||c.ws.bufferedAmount>65536){c.ws.terminate();return;}const bytes=JSON.stringify(message);this.counters.outputMessages++;this.counters.outBytes+=Buffer.byteLength(bytes);c.ws.send(bytes);}
 connect(ws,auth,token){
  const c={ws,auth,token,uid:auth.userId,lease:randomUUID(),joined:false,seq:0,lastSent:0,lastPayload:'',budget:.5,lastMove:this.now(),rateAt:this.now(),rateCount:0,speed:this.store.movementSpeed(auth.userId)};
  ws.alive=true;ws.on('pong',()=>{ws.alive=true});this.pending.add(c);
  const timeout=setTimeout(()=>{if(!c.joined)ws.close(1008,'HELLO_REQUIRED')},5000);timeout.unref();
  ws.on('message',(raw,binary)=>{
   this.counters.inputMessages++;this.counters.inBytes+=raw.length;
   try{
    if(binary)throw new GameError('JSON_REQUIRED');
    this.store.authenticate(token);
    const now=this.now();if(now-c.rateAt>=1000){c.rateAt=now;c.rateCount=0;}if(++c.rateCount>20)throw new GameError('POSE_RATE_LIMIT',429);
    const body=JSON.parse(raw.toString());
    if(!c.joined){
     if(!shape(body,['type','csrf'])||body.type!=='hello'||!same(body.csrf,auth.csrf))throw new GameError('CSRF_DENIED',403);
     const old=this.clients.get(c.uid);if(old&&old!==c){try{this.playground.leave({uid:c.uid});}catch{}}this.clients.set(c.uid,c);c.joined=true;clearTimeout(timeout);
     if(old&&old!==c)old.ws.close(4001,'REPLACED');
     const pose=this.safePosition(c.uid);if(pose.moving)this.persist(c.uid,{...pose,moving:false});
     this.send(c,{type:'welcome',lease:c.lease,pose:this.position(c.uid),serverTime:now});this.tick();return;
    }
    if(this.clients.get(c.uid)!==c)throw new GameError('LEASE_REPLACED',403);
    if(this.social.handle(c,body)){this.tick();return;}
    if(body.type==='playgroundJoin'||body.type==='playgroundLeave'||body.type==='playgroundInput'){
     const action=body.type==='playgroundJoin'?'join':body.type==='playgroundInput'?'input':'leave';
     try{
      if(!shape(body,action==='join'?['type','station']:action==='input'?['type','station','action','seq']:['type']))throw new GameError('INVALID_FIELDS');
      const result=action==='join'?this.playground.join({uid:c.uid,station:body.station}):action==='input'?this.playground.input({uid:c.uid,station:body.station,action:body.action,seq:body.seq}):this.playground.leave({uid:c.uid});
      this.send(c,{type:'playgroundStatus',ok:true,action,station:result.station,seat:result.seat});
     }catch(error){
      if(action==='leave'&&error.code==='NOT_JOINED')this.send(c,{type:'playgroundStatus',ok:true,action});
      else this.send(c,{type:'playgroundStatus',ok:false,action,error:'PLAYGROUND_'+(error.code||'UNAVAILABLE')});
     }
     this.tick();return;
    }
    if(body.type!=='pose')throw new GameError('INVALID_MESSAGE');
    const pose=this.move(c,body);this.playground.prune();this.send(c,{type:'poseAck',seq:body.seq,pose});
   }catch(error){
    this.counters.rejections++;
    if(error.status===401||!c.joined||error.code==='LEASE_REPLACED'){ws.close(1008,error.code||'INVALID_MESSAGE');return;}
    if(String(error.code).startsWith('INTERACTION_')){this.send(c,{type:'interactionStatus',error:error.code});return;}
    this.send(c,{type:'correction',error:error.code||'INVALID_MESSAGE',pose:this.position(c.uid)});
   }
  });
  ws.on('error',()=>{});
  ws.on('close',()=>{clearTimeout(timeout);this.pending.delete(c);if(this.clients.get(c.uid)===c){try{this.playground.leave({uid:c.uid});}catch{}this.clients.delete(c.uid);try{const p=this.position(c.uid);if(p.moving)this.persist(c.uid,{...p,moving:false});}catch{}this.tick();}});
 }
 move(c,b){
  const fail=code=>{throw new GameError(code)};
  if(!shape(b,['type','seq','scene','zone','x','z','heading','moving','transition','action'])||!Number.isSafeInteger(b.seq)||b.seq<=c.seq)fail('POSE_SEQUENCE');
  c.seq=b.seq;
  if(!['outdoor','indoor','home','forest'].includes(b.scene)||!STORES.some(store=>store.id===b.zone)||![b.x,b.z,b.heading].every(Number.isFinite)||Math.abs(b.heading)>1000||typeof b.moving!=='boolean'||!['',undefined,'sit'].includes(b.action))fail('INVALID_POSE');
  const old=this.position(c.uid),next={scene:b.scene,zone:b.zone,x:b.x,z:b.z,heading:normalized(b.heading),moving:b.moving,action:b.action||''},now=this.now();
  c.speed=old.scene==='outdoor'?this.store.movementSpeed(c.uid):R.walkSpeed;c.budget=Math.min(c.speed,c.budget+Math.max(0,now-c.lastMove)/1000*c.speed);c.lastMove=now;
  if(old.zone!==next.zone){
   if(old.scene!=='outdoor')fail('TRAVEL_TRANSITION_REQUIRED');
   const targetDoor=R.storeDoors[next.zone]||R.storeSpawns[next.zone];
   const nearDoor=targetDoor&&distance(old,targetDoor)<=R.storeDoorRadius;
   // A player who physically walks to another shop door may enter that shop
   // directly. The server accepts the zone change only from the last trusted
   // global pose near that exact door; the client cannot teleport by naming a
   // different zone.
   if(nearDoor&&next.scene==='indoor'&&b.transition==='door'){
    Object.assign(next,{scene:'indoor',...R.door,zone:next.zone,moving:false,action:''});c.budget=.5;
   }else if(nearDoor&&next.scene==='outdoor'&&['door','walk'].includes(b.transition)){
    Object.assign(next,{scene:'outdoor',...targetDoor,zone:next.zone,moving:false,action:''});c.budget=.5;
   }else{
    if(next.scene!=='outdoor'||b.transition!=='travel')fail('TRAVEL_TRANSITION_REQUIRED');
    this.store.completeTravel(c.uid,next.zone);Object.assign(next,{scene:'outdoor',...(R.storeSpawns[next.zone]||R.spawn),zone:next.zone,moving:false,action:''});c.budget=.5;
   }
  }
  else if(old.scene!==next.scene){
   if(old.scene==='home'||next.scene==='home')fail('HOME_TRANSITION_REQUIRED');if(old.scene==='forest'||next.scene==='forest')fail('FOREST_TRANSITION_REQUIRED');const entering=next.scene==='indoor';
   if(entering&&!['quick','door'].includes(b.transition)||!entering&&b.transition!=='exit')fail('SCENE_TRANSITION_REQUIRED');
   if(entering&&b.transition==='door'&&distance(old,R.storeDoors[old.zone]||R.storeSpawns[old.zone]||R.spawn)>1.2)fail('DOOR_TOO_FAR');
   const target=entering?R.door:(R.storeDoors[old.zone]||R.storeSpawns[old.zone]||R.exit);if(distance(next,target)>.25)fail('INVALID_SCENE_ENTRY');
   Object.assign(next,target,{moving:false,action:''});c.budget=.5;
  }else if(next.action==='sit'){
   if(next.scene!=='indoor'||distance(next,R.seat)>.1||old.action!=='sit'&&distance(old,R.seatStand)>.8)fail('INVALID_SEAT');
   Object.assign(next,R.seat,{moving:false});
  }else{
   const start=old.action==='sit'?{...old,...R.seatStand}:old;
   const distanceMoved=distance(start,next);
   if(distanceMoved>c.budget+.015)fail('MOVE_TOO_FAST');
   if(N.blocked(next,this.obstacles(next.scene,next.zone,c.uid),R.bounds[next.scene])||!N.clear(start,next,this.obstacles(next.scene,next.zone,c.uid),R.bounds[next.scene]))fail('POSITION_BLOCKED');
   c.budget=Math.max(0,c.budget-distanceMoved);
  }
  if(next.moving||distance(old,next)>.05){try{this.playground.leave({uid:c.uid});}catch{}}
  return this.persist(c.uid,next);
 }
 tick(){
  const playground=this.playground.snapshot().players;
  for(const c of this.clients.values()){
   try{this.store.authenticate(c.token)}catch{c.ws.close(1008,'SESSION_EXPIRED');continue;}
   const own=this.position(c.uid),nearby=[],coarse=[];
   for(const other of this.clients.values()){
    if(other===c||other.ws.readyState!==WebSocket.OPEN)continue;
    let u;try{this.store.authenticate(other.token);u=this.store.user(other.uid)}catch{continue;}
    const pose=this.position(other.uid);if(own.scene==='home'||pose.scene==='home')continue;const base={id:u.id,nickname:u.nickname,scene:pose.scene,zone:pose.zone};
    const near=own.scene===pose.scene&&(own.scene==='indoor'?own.zone===pose.zone:distance(own,pose)<=R.nearRadius);
    if(near)nearby.push({id:u.id,nickname:u.nickname,character:u.character,skin:u.skin,hair:u.hair,outfit:u.outfit,car:u.car,...(u.avatarPreset?{avatarPreset:u.avatarPreset}:{}),pose});else coarse.push(base);
   }
   const spaceVersion=own.scene==='forest'?0:(this.store.get('SELECT version FROM spaces WHERE id=?',own.scene==='home'?'home:'+c.uid:'store:'+own.zone)?.version||0);
   const payload={type:'snapshot',nearby,coarse,zone:own.zone,spaceVersion,...(own.scene==='forest'?{playground}:{}),...(this.supervisor?{supervisor:this.supervisor.snapshot()}:{})},key=JSON.stringify(payload);
   if(key===c.lastPayload&&this.now()-c.lastSent<5000)continue;
   c.lastPayload=key;c.lastSent=this.now();this.send(c,{...payload,serverTime:this.now()});
  }
 }
 revoke(tokenHash){for(const c of this.pending)if(c.auth.tokenHash===tokenHash)c.ws.close(1008,'LOGGED_OUT');}
 validateDecoration(body,uid){
  const storeId=typeof body.spaceId==='string'&&body.spaceId.startsWith('store:')?body.spaceId.slice(6):'';
  if(!STORES.some(store=>store.id===storeId)||!['place','move'].includes(body.operation))return;
  // Keep the original transactional idempotency/CAS decision ahead of geometry.
  if(uid&&typeof body.requestId==='string'&&this.store.get('SELECT 1 ok FROM transactions WHERE user_id=? AND request_id=?',uid,body.requestId))return;
  const space=this.store.space(uid||'demo-'+storeId+'-1',body.spaceId);
  if(!space.editable)throw new GameError('STORE_READ_ONLY',403);
  if(body.expectedVersion!==space.version)return;
  let itemId,exceptId;
  if(body.operation==='place'){
   const inventory=uid?this.store.get('SELECT item_id FROM inventory WHERE id=? AND user_id=?',body.inventoryId,uid):this.store.get('SELECT item_id FROM inventory WHERE id=?',body.inventoryId);
   if(!inventory||space.placements.some(p=>p.inventory_id===body.inventoryId))return;
   itemId=inventory.item_id;
  }else{const placement=space.placements.find(p=>p.id===body.placementId);if(!placement)return;itemId=placement.item_id;exceptId=placement.id;}
  const candidate={item_id:itemId,x:body.x,z:body.z,rotation:body.rotation??0},error=R.placementError(space,candidate,exceptId);
  if(error)throw new GameError(error,error==='INVALID_POSITION'?400:409);
  const box=R.placementBox(candidate);
  for(const c of this.clients.values()){const actor=this.position(c.uid);if((space.kind==='home'?actor.scene==='home'&&c.uid===space.owner:actor.scene==='indoor'&&actor.zone===storeId)&&R.bodyOccupies(box,actor))throw new GameError('SPACE_PLAYER_OCCUPIED',409);}
 }

 arriveTravel(uid,body){
  if(!shape(body,['destination','requestId']))throw new GameError('INVALID_TRAVEL_ARRIVAL');
  if(!STORES.some(store=>store.id===body.destination))throw new GameError('INVALID_DESTINATION');
  // The store idempotency record covers a response-loss retry. The callback
  // runs inside that transaction as travel completion and pose persistence.
  return this.store.idempotent(uid,body.requestId,'travel-arrive',{destination:body.destination},()=>{
   const travel=this.store.completeTravel(uid,body.destination);
   const entry=R.storeSpawns[body.destination]||R.storeDoors[body.destination]||R.spawn;
   const pose=this.persist(uid,{scene:'outdoor',zone:body.destination,x:entry.x,z:entry.z,heading:0,moving:false,action:''});
   return{pose,travel};
  });
 }

 close(){clearInterval(this.tickTimer);clearInterval(this.pingTimer);for(const c of this.pending)c.ws.terminate();this.clients.clear();this.pending.clear();this.wss.close();}
}
