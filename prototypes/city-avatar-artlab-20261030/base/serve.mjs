import http from 'node:http';import {readFile,writeFile,unlink} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {dirname,join} from 'node:path';import {networkInterfaces} from 'node:os';import {execFile} from 'node:child_process';import {timingSafeEqual,randomBytes} from 'node:crypto';
import {safeV42DataDir} from './data-safety.mjs';
import {GameStore,GameError} from './game-store.mjs';
import {GuestDeviceStore} from './guest-device.mjs';
import {guestRouteAllowed} from './guest-policy.mjs';
import {Presence} from './presence.mjs';
import {SupervisorService} from './supervisor-service.mjs';
import {privateIPv4,selectLanAddress} from './network.mjs';
export {privateIPv4,selectLanAddress};
const root=dirname(fileURLToPath(import.meta.url));
const publicFiles=new Set(['forest-edge-scene.js','forest-playground.js','forest-playground-controls.js','forest-playground-controls.css','index.html','photo-capture.js','home-scene.js','forest-city-context.js','forest-scene.js','forest-rules.js','pet-companion.js','shop-locations.js','photo-mode.js','photo-mode.css','city-shops.js','city-shops.css','work-portals.js','work-portals.css','device-continuation.js','device-continuation.css','r2-geometry-index.js','render-diagnostics.js','render-policy.js','occlusion-materials.js','phone-displays.js','vehicle-reactions.js','guest-access.js','guest-access.css','city-onboarding.js','city-onboarding.css','style.css','models.js','world.js','client.js','nav.js','scene-rules.js','browser-presence.js','session-recovery.js','city-ui.js','city-data.js','city-layout.js','city-scenery.js','appearance-preview.js','greenery.js','architecture-materials.js','ambient-occlusion.js','ambient-routes.js','street-kit.js','static-mesh.js','city-daylight.js','city-lighting.js','character-gestures.js','social-ui.js','social-ui.css','vendor/three.js']);
const mime=p=>p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8';
function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2))}
export function createGameServer({dataDir=join(root,'.private-v42'),host='127.0.0.1',lan=false,port=4430,now=()=>Date.now(),inviteExpiresAt=null,allowGuestRegistration=false,allowGuestDeviceRecovery=allowGuestRegistration,deviceRecoveryExpiresAt=Date.parse('2026-10-31T15:59:00Z'),cookieName='city_v42'}={}){
 if(typeof cookieName!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(cookieName))throw new GameError('INVALID_COOKIE_NAME');
 const store=new GameStore(join(safeV42DataDir(dataDir),'city.sqlite'),{now});
 // V4.3 applies additive gameplay migrations to an isolated copy of the V4.2 save.
 store.db.exec("INSERT OR REPLACE INTO v4_metadata VALUES('namespace','north12b-city-v4.3')");
 store.db.exec('CREATE TABLE IF NOT EXISTS v42_runtime_lock(id INTEGER PRIMARY KEY CHECK(id=1),pid INTEGER NOT NULL,nonce TEXT NOT NULL)');
 const ownerNonce=randomBytes(24).toString('hex');
 try{store.tx(()=>{const prior=store.get('SELECT * FROM v42_runtime_lock WHERE id=1');if(prior){let alive=true;try{process.kill(prior.pid,0)}catch(error){if(error.code==='ESRCH')alive=false;}if(alive)throw new GameError('WORLD_ALREADY_RUNNING',409);}store.run('INSERT OR REPLACE INTO v42_runtime_lock VALUES(1,?,?)',process.pid,ownerNonce);});}catch(error){store.close();throw error;}
 let stopped=false;
 store.db.exec('CREATE INDEX IF NOT EXISTS v42_audit_actor ON audit(actor)');
 const bootstrap=uid=>({...store.bootstrap(uid),stateRevision:store.get('SELECT COUNT(*) n FROM audit WHERE actor=?',uid).n});
 const presence=new Presence(store,{now});
 const supervisor=new SupervisorService(store,{now,position:uid=>presence.position(uid),isConnected:uid=>presence.clients.has(uid)});
 presence.supervisor=supervisor;
 const devices=allowGuestDeviceRecovery?new GuestDeviceStore(store,{now,expiresAt:deviceRecoveryExpiresAt}):null,deviceCookieName=cookieName+'_device';
 const deviceCookie=(token,expires)=>`${deviceCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0,Math.floor((expires-now())/1000))}`;
 const limits=new Map(),listeners=new Set(),bindings=new Map([[host,lan]]);
 function expectedTransport(req){
  const address=(req.socket.localAddress||'').replace(/^::ffff:/,''),peer=(req.socket.remoteAddress||'').replace(/^::ffff:/,''),expectedHost=`${address}:${req.socket.localPort}`;
  if(!bindings.has(address)||req.headers.host!==expectedHost||!(bindings.get(address)?privateIPv4(peer):['127.0.0.1','::1'].includes(peer)))throw new GameError('PRIVATE_PREVIEW_ONLY',403);
  return{expectedHost,expectedOrigin:'http://'+expectedHost};
 }
 const invites=new Map(['demo-jiuquan-1','demo-jiuquan-2'].map(uid=>[randomBytes(24).toString('hex'),uid]));const oneTimeExpires=inviteExpiresAt==null?now()+15*60000:Math.min(now()+12*3600000,Number(inviteExpiresAt));if(!Number.isFinite(oneTimeExpires)||oneTimeExpires<=now())throw new GameError('INVALID_INVITE_EXPIRY',400);
 function response(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
 const handler=async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
  let expectedOrigin;try{({expectedOrigin}=expectedTransport(req));}catch{response(res,403,{error:'PRIVATE_PREVIEW_ONLY'});return}
  const client=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
  let url;try{url=new URL(req.url,expectedOrigin)}catch{response(res,400,{error:'BAD_URL'});return}
  const mutating=!['GET','HEAD'].includes(req.method);
  try{
   if(!url.pathname.startsWith('/api/')){
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['GET','HEAD'].includes(req.method)||!publicFiles.has(file)){response(res,404,{error:'NOT_FOUND'});return}
    const b=await readFile(join(root,file));res.writeHead(200,{'Content-Type':mime(file),'Content-Length':b.length});res.end(req.method==='HEAD'?undefined:b);return
   }
   if(!['GET','POST'].includes(req.method))throw new GameError('METHOD_NOT_ALLOWED',405);
   let body={};
   if(mutating){if(req.headers.origin!==expectedOrigin)throw new GameError('ORIGIN_DENIED',403);if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new GameError('JSON_REQUIRED',415);let bytes=0,parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16000)throw new GameError('BODY_TOO_LARGE',413);parts.push(chunk)}try{body=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw new GameError('INVALID_JSON')}if(!body||typeof body!=='object'||Array.isArray(body))throw new GameError('INVALID_JSON')}
   const method=req.method,path=url.pathname;
   if(method==='GET'&&path==='/api/clock'){response(res,200,{serverTime:now(),timezone:'Asia/Taipei'});return;}

   if(method==='GET'&&path==='/api/access'){response(res,200,{guestRegistration:allowGuestRegistration===true});return;}
   if(method==='GET'&&path==='/api/device/status'){if(!devices)throw new GameError('NOT_FOUND',404);response(res,200,devices.status(cookies(req)[deviceCookieName]));return;}
   if(method==='POST'&&path==='/api/device/restore'){
    if(!devices)throw new GameError('NOT_FOUND',404);if(Object.keys(body).some(k=>k!=='challenge'))throw new GameError('INVALID_FIELDS');
    const rate=limits.get(client)||{count:0,until:now()+60000};if(rate.until<now()){rate.count=0;rate.until=now()+60000}rate.count++;limits.set(client,rate);if(rate.count>12)throw new GameError('LOGIN_RATE_LIMIT',429);
    let currentUserId=null;try{currentUserId=store.authenticate(cookies(req)[cookieName]).userId}catch(error){if(!(error instanceof GameError)||error.status!==401)throw error;}
    const session=devices.restore(cookies(req)[deviceCookieName],body.challenge,{currentUserId});res.setHeader('Set-Cookie',`${cookieName}=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8*3600}`);response(res,200,{...bootstrap(session.userId),pose:presence.position(session.userId),csrf:session.csrf,expires:session.expires});return;
   }
   if(method==='POST'&&path==='/api/guest'){
    if(allowGuestRegistration!==true)throw new GameError('NOT_FOUND',404);
    const key='guest:'+client,rate=limits.get(key)||{count:0,until:now()+60000};if(rate.until<now()){rate.count=0;rate.until=now()+60000}rate.count++;limits.set(key,rate);if(rate.count>5)throw new GameError('GUEST_REGISTRATION_RATE_LIMIT',429);
    let signedInUserId=null;try{signedInUserId=store.authenticate(cookies(req)[cookieName]).userId}catch(error){if(!(error instanceof GameError)||error.status!==401)throw error;}
    const guest=store.registerGuest(body,{signedInUserId}),s=store.login(guest.card);
    res.setHeader('Set-Cookie',`${cookieName}=${s.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8*3600}`);
    response(res,200,{...bootstrap(s.userId),pose:presence.position(s.userId),csrf:s.csrf,expires:s.expires,guestRecovery:{card:guest.card}});return;
   }
   if(method==='POST'&&path==='/api/login'){
    const rate=limits.get(client)||{count:0,until:now()+60000};if(rate.until<now()){rate.count=0;rate.until=now()+60000}rate.count++;limits.set(client,rate);if(rate.count>12)throw new GameError('LOGIN_RATE_LIMIT',429);
    let code=body.code;if(Object.keys(body).some(k=>!['code','oneTime'].includes(k)))throw new GameError('INVALID_FIELDS');
    if(body.oneTime){const key=[...invites.keys()].find(token=>equal(body.oneTime,token));if(!key||now()>oneTimeExpires)throw new GameError('INVITE_EXPIRED',401);const invited=invites.get(key);invites.delete(key);code=store.codes()[invited].code}
    const s=store.login(code);res.setHeader('Set-Cookie',`${cookieName}=${s.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8*3600}`);response(res,200,{...bootstrap(s.userId),pose:presence.position(s.userId),csrf:s.csrf,expires:s.expires});return
   }
   const auth=store.authenticate(cookies(req)[cookieName]);const uid=auth.userId;
   if(mutating&&!equal(req.headers['x-city-csrf'],auth.csrf))throw new GameError('CSRF_DENIED',403);
   const guest=store.isGuest(uid);
   // New authenticated routes default to denied for guests until explicitly reviewed.
   if(guest&&!guestRouteAllowed(method,path))throw new GameError('GUEST_INTERNAL_ACCESS_DENIED',403);
   if(guest&&method==='POST'&&path==='/api/decorate'&&typeof body.spaceId==='string'&&body.spaceId.startsWith('store:'))throw new GameError('GUEST_STORE_READ_ONLY',403);
   let result;
   if(method==='POST'&&path==='/api/device/remember'){if(!devices)throw new GameError('NOT_FOUND',404);if(Object.keys(body).length)throw new GameError('INVALID_FIELDS');const d=devices.remember(uid,cookies(req)[deviceCookieName]);res.setHeader('Set-Cookie',deviceCookie(d.token,d.expiresAt));result={remembered:true,expiresAt:d.expiresAt};}
   else if(method==='POST'&&path==='/api/device/forget'){if(!devices)throw new GameError('NOT_FOUND',404);if(Object.keys(body).length)throw new GameError('INVALID_FIELDS');devices.forget(cookies(req)[deviceCookieName]);res.setHeader('Set-Cookie',deviceCookie('',0));result={forgotten:true};}
   else if(method==='GET'&&path==='/api/session')result={...bootstrap(uid),pose:presence.position(uid),csrf:auth.csrf,expires:auth.expires};
   else if(method==='POST'&&path==='/api/guest/card')result=store.guestRecoveryCard(uid,body);
   else if(method==='POST'&&path==='/api/logout'){store.logout(auth);presence.revoke(auth.tokenHash);devices?.forget(cookies(req)[deviceCookieName]);res.setHeader('Set-Cookie',[`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,deviceCookie('',0)]);result={ok:true}}
   else if(method==='POST'&&path==='/api/building/enter')result=store.authorizeBuilding(uid,body);
   else if(method==='POST'&&path==='/api/profile')result=store.profile(uid,body);
   else if(method==='POST'&&path==='/api/claim')result=store.claim(uid,body);
   else if(method==='POST'&&path==='/api/purchase')result=store.purchase(uid,body);
   else if(method==='POST'&&path==='/api/pet/follow')result=store.selectPet(uid,body);
   else if(method==='POST'&&path==='/api/forest/enter'){if(Object.keys(body).some(k=>k!=='portalId')||('portalId' in body&&(typeof body.portalId!=='string'||!body.portalId||body.portalId.length>24)))throw new GameError('INVALID_FIELDS');result=presence.enterForest(uid,body.portalId);}
   else if(method==='POST'&&path==='/api/forest/leave'){if(Object.keys(body).some(k=>k!=='portalId')||('portalId' in body&&(typeof body.portalId!=='string'||!body.portalId||body.portalId.length>24)))throw new GameError('INVALID_FIELDS');result=presence.leaveForest(uid,body.portalId);}
   else if(method==='GET'&&path==='/api/home')result=store.ownHome(uid);
   else if(method==='POST'&&path==='/api/home/enter'){if(Object.keys(body).length)throw new GameError('INVALID_FIELDS');result=presence.enterHome(uid);}
   else if(method==='POST'&&path==='/api/home/leave'){if(Object.keys(body).length)throw new GameError('INVALID_FIELDS');result=presence.leaveHome(uid);}
   else if(method==='GET'&&path==='/api/stores')result={stores:store.storeList(uid)};
   else if(method==='POST'&&path==='/api/exchange-gold')result=store.exchangeGold(uid,body);
   else if(method==='POST'&&path==='/api/task/start')result=store.startTask(uid,body);
   else if(method==='POST'&&path==='/api/task/answer')result=store.answerTask(uid,body);
   else if(method==='GET'&&path==='/api/travel')result=store.travelStatus(uid);
   else if(method==='POST'&&path==='/api/travel/arrive')result=presence.arriveTravel(uid,body);
   else if(method==='GET'&&path.startsWith('/api/work/'))result=store.work(uid,path.slice(10));
   else if(method==='POST'&&path==='/api/work/complete')result=store.acknowledge(uid,body);
   else if(method==='POST'&&path==='/api/report')result=store.report(uid,body);
   else if(method==='GET'&&path==='/api/space')result=store.space(uid,url.searchParams.get('id'));
   else if(method==='POST'&&path==='/api/travel'){if(presence.position(uid).scene!=='outdoor')throw new GameError('RETURN_TO_CITY_REQUIRED',409);result=store.travel(uid,body);}
   else if(method==='POST'&&path==='/api/decorate'){presence.validateDecoration(body,uid);result=store.decorate(uid,body);}
   else if(method==='GET'&&path==='/api/location')result={pose:presence.position(uid)};
   else if(method==='GET'&&path==='/api/presence-metrics')result=presence.metrics();
   else if(method==='GET'&&path==='/api/ledger')result={entries:store.ledger(uid)};
   else if(method==='GET'&&path==='/api/supervisor')result={supervisor:supervisor.snapshot()};
   else if(method==='POST'&&path==='/api/supervisor/start')result=supervisor.start(uid,body);
   else if(method==='POST'&&path==='/api/supervisor/ask')result=supervisor.ask(uid,body);
   else if(method==='POST'&&path==='/api/supervisor/complete')result=supervisor.complete(uid,body);
   else if(method==='POST'&&path==='/api/supervisor/end')result=supervisor.end(uid,body);
   else if(method==='POST'&&path==='/api/formal/gold-import')result=store.importGold();
   else throw new GameError('NOT_FOUND',404);
   if(result?.profile)result={...result,...bootstrap(uid)};
   response(res,200,result)
  }catch(e){const known=e instanceof GameError;if(!known)console.error('City server error:',e.code||e.message);response(res,known?e.status:500,{error:known?e.code:'SERVER_ERROR',...(known?e.details:{})})}
 };
 function makeListener(){
  const instance=http.createServer(handler);listeners.add(instance);
  presence.attach(instance,req=>{const {expectedOrigin}=expectedTransport(req);if(req.headers.origin!==expectedOrigin)throw new GameError('UPGRADE_DENIED',403);const token=cookies(req)[cookieName];return{auth:store.authenticate(token),token};});
  instance.requestTimeout=15000;instance.headersTimeout=10000;instance.keepAliveTimeout=2000;
  return instance;
 }
 const server=makeListener();
 async function listenAdditional({host:address,port:extraPort}){
  if(!privateIPv4(address)&&address!=='127.0.0.1')throw new GameError('PRIVATE_PREVIEW_ONLY',403);
  bindings.set(address,address!=='127.0.0.1');const extra=makeListener();
  try{await new Promise((resolve,reject)=>{extra.once('error',reject);extra.listen(extraPort,address,resolve)});return extra;}catch(error){listeners.delete(extra);throw error;}
 }
 return{server,store,presence,listenAdditional,oneTime:(uid='demo-jiuquan-1')=>[...invites.entries()].find(([,owner])=>owner===uid)?.[0],close:async()=>{if(stopped)return;stopped=true;presence.close();await Promise.all([...listeners].map(instance=>new Promise(resolve=>{instance.closeAllConnections();if(instance.listening)instance.close(resolve);else resolve()})));store.run('DELETE FROM v42_runtime_lock WHERE id=1 AND nonce=?',ownerNonce);store.close()}}

}
export async function main(){
 const lan=process.argv.includes('--lan'),selected=lan?selectLanAddress(networkInterfaces(),process.env.CITY_V42_LAN_IP||''):null,host=selected?.address||'127.0.0.1',port=Number(process.env.CITY_V42_PORT||(lan?4431:4430));
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('預覽埠必須為1024–65535。');
 const dataDir=process.env.CITY_V42_DATA_DIR||join(root,'.private-v42'),app=createGameServer({dataDir,host,lan,port});try{app.server.listen(port,host);await new Promise((resolve,reject)=>{app.server.once('listening',resolve);app.server.once('error',reject)});}catch(error){await app.close();throw error;}
 let otherBase='';
 try{
  if(lan){const extra=await app.listenAdditional({host:'127.0.0.1',port:4430});otherBase=`http://127.0.0.1:${extra.address().port}/`;}
  else{const address=selectLanAddress(networkInterfaces(),process.env.CITY_V42_LAN_IP||'').address;const extra=await app.listenAdditional({host:address,port:4431});otherBase=`http://${address}:${extra.address().port}/`;}
 }catch(error){console.log('第二入口未啟動：'+error.message+'；主要入口仍可使用。');}
 await writeFile(join(dataDir,'preview-process.json'),JSON.stringify({pid:process.pid,entryScript:join(root,'serve.mjs')})+'\n',{mode:0o600});
 const base=`http://${host}:${port}/`,entry=base+'#invite='+app.oneTime();
 if(otherBase)console.log('同一小城的另一入口：'+otherBase+'（桌機與手機共用同一個即時同步程序）');
 console.log('第二位酒泉試玩者的一次邀請：'+(lan?base:otherBase||base)+'#invite='+app.oneTime('demo-jiuquan-2'));
 console.log('\n營運小城 IV.2｜隔離試玩伺服器（不連正式帳戶或資料）\n'+(lan?'同Wi-Fi手機開啟：':'桌機開啟：')+entry+'\n此邀請15分鐘內可用一次。既有帳號可用下面試玩卡登入，跨裝置共用同一張卡即同一位玩家。\n');
 for(const[id,c]of Object.entries(app.store.codes()))console.log(`${c.name}：${c.code}`);
 console.log('\n1遊戲金牌＝50金幣計價；初始320金幣／12金牌為一次性示範贈與。\n角色／錢包／店裝存此Mac的.private-v42資料庫。正式金牌紀錄不變。\n停止：Control+C；此伺服器關閉後手機不能連線。\n');
 if(process.argv.includes('--open')&&process.platform==='darwin')execFile('/usr/bin/open',[entry]);
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{await app.close();await unlink(join(dataDir,'preview-process.json')).catch(()=>{});console.log('City IV.2 stopped.');process.exit(0)});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL(process.argv[1],'file://'+process.cwd()+'/')))main().catch(e=>{console.error(e.code==='EADDRINUSE'?'預覽埠已使用，請開既有網址。':e.code==='WORLD_ALREADY_RUNNING'?'這份存檔的小城已啟動，請使用原啟動視窗的桌機／手機網址，避免另開重複世界。':e.message);process.exitCode=1});
