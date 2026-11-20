import {createHash,randomBytes} from 'node:crypto';
import {STORES} from './game-config.mjs';
import {createStaffOwnerBinding,CITY_OWNER_DEADLINE} from './staff-owner-binding.mjs';
import {createStaffControl} from './staff-control.mjs';
import {createSqliteStaffAdapter} from './staff-storage.mjs';
import {createStaffCityCrowd} from './staff-city-crowd.mjs';
import {validateRouteSegments} from './staff-runtime.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const PILOTS={'5511180':{name:'嘉玲',store:'三創',preset:'portrait-jialing-v1'},'5513075':{name:'依芯',store:'通化',preset:'portrait-yixin-v1'},'5514420':{name:'李舒緩',store:'三創',preset:'portrait-li-shuhuan-v1'}};
const characters=['orange','sunny','forest','violet'],skins=['orange','teal','purple'];
const generic=characters.flatMap(c=>skins.map(s=>'generic|'+c+'|'+s));
const fail=(code,status=409)=>{const e=new Error(code);e.code=code;e.status=status;throw e;};
const shape=(b,keys)=>{if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k)))fail('INVALID_FIELDS',400);};
const parseCookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=')).filter(v=>v.length===2));
const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
export function attachEmployeeCity({app,cookieName,worldId='current-guests',remote,activeRoster,sceneRules:R,nav:N,now=Date.now,
  protectedUids=['guest-c9348620-9cee-414b-88e1-3f29b1948c82','guest-7eca047d-acfb-4d89-80f4-59d36855ff97'],graceMs=120000,protectedOwnerPairs=[],serviceExpiresAt=Infinity,stagePortraits=null}){
  if(!app?.server||!remote?.redeemHandoff||!Array.isArray(activeRoster))fail('EMPLOYEE_ADDON_CONFIG',500);
  const db=app.store.db,storage=createSqliteStaffAdapter(db),baseUser=app.store.user.bind(app.store),controls=new Map(),limits=new Map();
  db.exec('CREATE TABLE IF NOT EXISTS city_employee_config(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  if(!db.prepare("SELECT 1 FROM city_employee_config WHERE key='actor-salt'").get())db.prepare('INSERT INTO city_employee_config VALUES(?,?)').run('actor-salt',randomBytes(32).toString('hex'));
  const actorSalt=db.prepare("SELECT value FROM city_employee_config WHERE key='actor-salt'").get().value;
  const boundUid=uid=>db.prepare('SELECT * FROM city_employee_owners WHERE world_id=? AND city_uid=?').get(worldId,uid);
  const boundEmployee=id=>db.prepare('SELECT * FROM city_employee_owners WHERE world_id=? AND employee_id=?').get(worldId,id);
  const legal=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&(p.scene&&p.scene!=='outdoor'?Math.abs(p.x)<300&&Math.abs(p.z)<300:!N.blocked(p,R.obstacles.outdoor,R.bounds.outdoor));
  const nav={validate:legal,validateSegment:(a,b)=>N.clear(a,b,R.obstacles.outdoor,R.bounds.outdoor)};
  function auth(req){const a=app.store.authenticate(parseCookies(req)[cookieName]),u=baseUser(a.userId),epoch=db.prepare('SELECT epoch FROM users WHERE id=?').get(a.userId).epoch;
    return {...a,worldId,active:true,accountKind:u.account_kind,userEpoch:epoch,sessionId:a.tokenHash};}
  function control(row){let c=controls.get(row.employee_id);if(!c){c=createStaffControl({ownerId:worldId+':'+row.employee_id,storage,now,graceMs,activeIdleMs:30000,isLegalPose:legal,
      appearancePresets:[PILOTS[row.employee_id].preset,...generic]});controls.set(row.employee_id,c);}return c;}
  function ensureLease(a,row){const c=control(row);c.tick({now:now()});const lease=c.lease;
    if(lease?.sessionId===a.tokenHash&&lease.state==='grace')c.resume({sessionId:a.tokenHash});
    else if(!lease?.active||lease.sessionId!==a.tokenHash){const acquired=c.connect({sessionId:a.tokenHash});if(!acquired.ok)fail('ROLE_IN_USE');}
    c.heartbeat({sessionId:a.tokenHash});return c;}
  let crowd;
  const owner=createStaffOwnerBinding({db,worldId,now,protectedUids,protectedOwnerPairs,authenticateCity:auth,redeemHandoff:remote.redeemHandoff,validateLease:remote.validateLease,
    onBound({cityUID,preset}){
      const previous=db.prepare('SELECT value FROM v4_metadata WHERE key=?').get('avatar-preset:'+cityUID)?.value;
      if(previous&&previous!==preset)fail('EXISTING_PORTRAIT_REQUIRES_OWNER_REVIEW');
      db.prepare('INSERT OR REPLACE INTO v4_metadata VALUES(?,?)').run('avatar-preset:'+cityUID,preset);
      // Wallet, inventory, pet, nickname, equipment and saved position are untouched.
    }});
  app.store.user=uid=>{const u=baseUser(uid),b=boundUid(uid);if(!b)return u;
    const choice=storage.readAppearance(worldId+':'+b.employee_id)?.preset;
    if(choice?.startsWith('generic|')){const[,character,skin]=choice.split('|');delete u.avatarPreset;u.character=character;u.skin=skin;}
    else u.avatarPreset=PILOTS[b.employee_id].preset;return u;};
  const stores=new Map(STORES.map(s=>[s.name,s.id]));
  const displayBinding=id=>stagePortraits?.binding(id)||boundEmployee(id);
  const rows=activeRoster.filter(r=>r.active===true).map(r=>{const stage=stagePortraits?.get(r.employeeId),display=stage||PILOTS[r.employeeId];return {...r,photoPreset:display?.preset,displayName:display?.name,stageDisplay:!!stage,maskedName:r.authorityName||r.maskedName};});
  const virtual=new Map(rows.map(r=>['staff-'+sha(actorSalt+':'+worldId+':'+r.employeeId).slice(0,24),r]));
  function connected(uid){const c=app.presence.clients.get(uid);if(!c)return null;try{return app.store.authenticate(c.token).tokenHash;}catch{return null;}}
  function routeFor(store){const zone=stores.get(store),spawn=R.storeSpawns[zone]||R.spawn,paths=(R.cityLayout.pedestrianRoutes||[]).map(p=>p.map(q=>({...q,scene:'outdoor'}))).filter(p=>{try{validateRouteSegments(p,nav);return true;}catch{return false;}}).sort((a,b)=>Math.hypot(a[0].x-spawn.x,a[0].z-spawn.z)-Math.hypot(b[0].x-spawn.x,b[0].z-spawn.z));
    if(!paths.length)fail('STAFF_LEGAL_ROUTE_REQUIRED',500);return [...paths[0],...paths[0].slice(0,-1).reverse()];}
  crowd=createStaffCityCrowd({activeRoster:()=>rows.map(r=>({...r,personalized:!!displayBinding(r.employeeId),displayName:r.displayName+(r.stageDisplay&&!displayBinding(r.employeeId)?' · 展示待綁定':'')})),now,nav,sceneRules:R,routeFor,graceMs,
    getBinding:id=>({cityUID:displayBinding(id)?.city_uid||'staff-'+sha(actorSalt+':'+worldId+':'+id).slice(0,24)}),
    getProfile:uid=>virtual.has(uid)?{nickname:virtual.get(uid).displayName||virtual.get(uid).maskedName,avatarPreset:virtual.get(uid).photoPreset,portraitBinding:virtual.get(uid).stageDisplay?'display-unlinked':undefined}:app.store.user(uid),getConnectedSession:connected});
  const originals=app.server.listeners('request');for(const fn of originals)app.server.removeListener('request',fn);
  async function handler(req,res){
    let path;try{path=new URL(req.url,'http://127.0.0.1').pathname;}catch{reply(res,400,{error:'BAD_URL'});return;}
    if(!path.startsWith('/api/employee/')&&path!=='/api/profile'&&path!=='/api/logout'){for(const fn of originals)fn(req,res);return;}
    try{
      const address=(req.socket.localAddress||'').replace(/^::ffff:/,''),peer=(req.socket.remoteAddress||'').replace(/^::ffff:/,''),host=address+':'+req.socket.localPort;
      if(address!=='127.0.0.1'||!['127.0.0.1','::1'].includes(peer)||req.headers.host!==host)fail('PRIVATE_PREVIEW_ONLY',403);
      if(now()>=serviceExpiresAt)fail('PREVIEW_EXPIRED',410);
      const a=auth(req),b=boundUid(a.userId);
      if(!path.startsWith('/api/employee/')){
        if(!b){for(const fn of originals)fn(req,res);return;}
        if(req.method==='POST'&&path==='/api/logout'){res.once('finish',()=>{if(res.statusCode===200)try{control(b).logout({sessionId:a.tokenHash});}catch{}});for(const fn of originals)fn(req,res);return;}
        // Consume a profile body only for a bound role; reconstruct it for the
        // existing handler after the narrow once-only identity guard below.
      }
      if(!['GET','POST'].includes(req.method))fail('METHOD_NOT_ALLOWED',405);
      let body={};
      if(req.method==='POST'){
        if(req.headers.origin!=='http://'+host||req.headers['x-city-csrf']!==a.csrf)fail('CSRF_DENIED',403);
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail('JSON_REQUIRED',415);
        let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>4096)fail('BODY_TOO_LARGE',413);chunks.push(c);}
        try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_JSON',400);}shape(body,Object.keys(body||{}));
      }
      if(path==='/api/profile'){
        ensureLease(a,b);const current=app.store.user(a.userId);
        // The original wardrobe sends a full profile even for equipment/name
        // changes. Unchanged identity fields are echoes, not a new makeover.
        for(const field of ['character','skin'])if(field in body){if(body[field]!==current[field])fail('USE_ONCE_APPEARANCE_FLOW');delete body[field];}
        if('nickname'in body&&body.nickname!==current.nickname){const key=a.userId,entry=limits.get(key)||{count:0,until:now()+60000};if(entry.until<now()){entry.count=0;entry.until=now()+60000;}if(++entry.count>6)fail('NICKNAME_RATE_LIMIT',429);limits.set(key,entry);}
        reply(res,200,app.store.profile(a.userId,body));crowd.rebuild();return;
      }
      if(path==='/api/employee/link/status'&&req.method==='GET'){reply(res,200,owner.status(req));return;}
      if(path==='/api/employee/link/challenge'&&req.method==='POST'){reply(res,200,owner.issue(req,body));return;}
      if(path==='/api/employee/link/complete'&&req.method==='POST'){const result=await owner.complete(req,body);const row=boundUid(a.userId);ensureLease(a,row);crowd.rebuild();reply(res,200,result);return;}
      if(path==='/api/employee/crowd'&&req.method==='GET'){
        const url=new URL(req.url,'http://127.0.0.1'),scene=url.searchParams.get('scene')||'outdoor',center={x:Number(url.searchParams.get('x')),z:Number(url.searchParams.get('z')),scene};
        reply(res,200,scene==='outdoor'?crowd.snapshot({center,scene}):{poses:[],scene});return;
      }
      if(!b)fail('EMPLOYEE_ROLE_NOT_BOUND',403);
      if(path==='/api/employee/me'&&req.method==='GET'){reply(res,200,{...owner.status(req),profile:app.store.user(a.userId),remainingAppearance:!storage.readAppearance(worldId+':'+b.employee_id)?.consumed,photoPreset:PILOTS[b.employee_id].preset,wallet:app.store.wallet(a.userId),formalGoldEnabled:false});return;}
      if(path==='/api/employee/appearance/preview'||path==='/api/employee/appearance/confirm'){
        if(req.method!=='POST')fail('METHOD_NOT_ALLOWED',405);shape(body,path.endsWith('/confirm')?['preset','character','skin','requestId']:['preset','character','skin']);
        if(!['photo','generic'].includes(body.preset))fail('APPEARANCE_NOT_ALLOWED',400);let preset=PILOTS[b.employee_id].preset;
        if(body.preset==='generic'){if(!characters.includes(body.character)||!skins.includes(body.skin))fail('APPEARANCE_NOT_ALLOWED',400);preset='generic|'+body.character+'|'+body.skin;}
        else if(body.character!==undefined||body.skin!==undefined)fail('INVALID_FIELDS',400);
        const c=ensureLease(a,b);if(path.endsWith('/preview')){c.previewAppearance({sessionId:a.tokenHash,preset});const profile={...app.store.user(a.userId)};if(body.preset==='generic'){delete profile.avatarPreset;profile.character=body.character;profile.skin=body.skin;}else profile.avatarPreset=preset;reply(res,200,{profile,consumed:false});}
        else{if(!/^[A-Za-z0-9_-]{12,100}$/.test(body.requestId||''))fail('REQUEST_ID_INVALID',400);c.confirmAppearance({sessionId:a.tokenHash,preset,requestId:body.requestId});crowd.rebuild();reply(res,200,{ok:true,profile:app.store.user(a.userId),remainingAppearance:false});}return;
      }
      if(path.includes('/gold'))fail('AUTHORITATIVE_GOLD_WRITEBACK_NOT_ENABLED',503);
      fail('NOT_FOUND',404);
    }catch(e){if(!res.headersSent)reply(res,e.status||400,{error:e.code||'EMPLOYEE_CITY_ERROR'});}
  }
  app.server.on('request',handler);
  const upgrades=app.server.listeners('upgrade');for(const fn of upgrades)app.server.removeListener('upgrade',fn);
  app.server.on('upgrade',(req,socket,head)=>{try{const host='127.0.0.1:'+req.socket.localPort;if(req.headers.host!==host||req.headers.origin!=='http://'+host)fail('UPGRADE_DENIED',403);const a=auth(req),b=boundUid(a.userId);if(b)ensureLease(a,b);for(const fn of upgrades)fn(req,socket,head);}catch{socket.end('HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n');}});
  let stageSignature=stagePortraits?.signature(),lastStageCheck=0;
  const timer=setInterval(()=>{try{if(stagePortraits&&now()-lastStageCheck>=1000){lastStageCheck=now();const next=stagePortraits.signature();if(next!==stageSignature){crowd.rebuild();stageSignature=next;}}for(const b of db.prepare('SELECT * FROM city_employee_owners WHERE world_id=?').all(worldId)){const c=control(b),sid=connected(b.city_uid);if(sid){ensureLease({tokenHash:sid},b);}else if(c.lease?.state==='active')c.disconnect({sessionId:c.lease.sessionId,reason:'network'});c.tick({now:now()});}crowd.step(now());}catch{/* Keep original city/presence alive; optional crowd fails closed. */}},250);timer.unref();
  const close=app.close.bind(app);app.close=async()=>{clearInterval(timer);crowd.close();await close();};
  return {owner,crowd,close:app.close};
}
