import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
const fail=(code,status=403)=>{throw Object.assign(new Error(code),{code,status});};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const getGame=new Set(['/api/clock','/api/access','/api/device/status','/api/session','/api/stores','/api/space','/api/location','/api/ledger','/api/travel','/api/supervisor','/api/home','/api/presence-metrics','/api/employee/crowd']);
const postGame=new Set(['/api/logout','/api/profile','/api/purchase','/api/pet/follow','/api/exchange-gold','/api/travel','/api/travel/arrive','/api/decorate','/api/building/enter','/api/forest/enter','/api/forest/leave','/api/home/enter','/api/home/leave','/api/supervisor/start','/api/supervisor/ask','/api/supervisor/complete','/api/supervisor/end']);
export function attachEmployeePlayLogin({app,cookieName,activeRoster,prelinked=[],blockedUids=[],worldId='current-guests',now=Date.now,expiresAt}) {
 if(!app?.store?.db||!app?.server||!Array.isArray(activeRoster)||worldId!=='current-guests'||!Number.isFinite(expiresAt)||expiresAt<=now()||!/^[a-z][a-z0-9_]{0,63}$/.test(cookieName))throw Error('PLAY_LOGIN_CONFIG');
 const db=app.store.db,active=new Set(activeRoster.filter(r=>r.active===true).map(r=>r.employeeId)),blocked=new Set(blockedUids);
 if(!active.size||active.size>200)throw Error('PLAY_ROSTER_REQUIRED');
 db.exec(`CREATE TABLE IF NOT EXISTS city_play_links(world_id TEXT NOT NULL,employee_id TEXT NOT NULL,city_uid TEXT NOT NULL REFERENCES users(id),at INTEGER NOT NULL,source TEXT NOT NULL,PRIMARY KEY(world_id,employee_id),UNIQUE(world_id,city_uid));
 CREATE TABLE IF NOT EXISTS city_play_sessions(token_hash TEXT PRIMARY KEY,world_id TEXT NOT NULL,employee_id TEXT NOT NULL,expires INTEGER NOT NULL);`);
 const byId=id=>db.prepare('SELECT * FROM city_play_links WHERE world_id=? AND employee_id=?').get(worldId,id);
 const byUid=uid=>db.prepare('SELECT * FROM city_play_links WHERE world_id=? AND city_uid=?').get(worldId,uid);
 function eligible(uid){const u=app.store.user(uid);if(u.account_kind!=='guest'||blocked.has(uid))fail('PLAY_ROLE_NOT_ELIGIBLE');return u;}
 function link(uid,id,source){if(!active.has(id))fail('PLAY_EMPLOYEE_UNAVAILABLE',404);eligible(uid);const old=byId(id),other=byUid(uid);
  if(old&&old.city_uid!==uid||other&&other.employee_id!==id)fail('PLAY_LINK_CONFLICT',409);
  const formal=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='city_employee_owners'").get();
  if(formal){const conflict=db.prepare('SELECT employee_id,city_uid FROM city_employee_owners WHERE world_id=? AND (employee_id=? OR city_uid=?)').all(worldId,id,uid);if(conflict.some(r=>r.employee_id!==id||r.city_uid!==uid))fail('PLAY_LINK_CONFLICT',409);}
  if(!old)db.prepare('INSERT INTO city_play_links VALUES(?,?,?,?,?)').run(worldId,id,uid,now(),source);return byId(id);
 }
 db.exec('BEGIN IMMEDIATE');try{for(const row of prelinked)link(row.cityUID,row.employeeId,'user-confirmed-existing-role');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 const mode='employee-id-game-only',masked=id=>'***'+id.slice(-3),limited=a=>db.prepare('SELECT * FROM city_play_sessions WHERE token_hash=? AND world_id=? AND expires>?').get(a.tokenHash,worldId,now());
 const auth=req=>app.store.authenticate(cookies(req)[cookieName]);
 function bootstrap(a){const r=limited(a),l=byUid(a.userId),result={...app.store.bootstrap(a.userId),pose:app.presence.position(a.userId),csrf:a.csrf,expires:a.expires,playLogin:null,stateRevision:db.prepare('SELECT COUNT(*) n FROM audit WHERE actor=?').get(a.userId).n};
  if(l)result.playLink={employeeIdMasked:masked(l.employee_id),gameOnly:true};
  if(r){result.playLogin={mode,employeeIdMasked:masked(r.employee_id),formalIdentityVerified:false};result.access={...result.access,businessBuildings:false,businessTasks:false,editStores:false};}
  return result;
 }
 function transport(req,mutating=false){const address=(req.socket.localAddress||'').replace(/^::ffff:/,''),peer=(req.socket.remoteAddress||'').replace(/^::ffff:/,''),host=address+':'+req.socket.localPort;if(address!=='127.0.0.1'||!['127.0.0.1','::1'].includes(peer)||req.headers.host!==host)fail('PRIVATE_PREVIEW_ONLY');if(mutating&&req.headers.origin!=='http://'+host)fail('ORIGIN_DENIED');if(now()>=expiresAt)fail('PREVIEW_EXPIRED',410);}
 async function body(req){transport(req,true);if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail('JSON_REQUIRED',415);let bytes=0,chunks=[];for await(const c of req){bytes+=c.length;if(bytes>1024)fail('BODY_TOO_LARGE',413);chunks.push(c);}let b;try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_FIELDS',400);}if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).join('|')!=='employeeId'||typeof b.employeeId!=='string'||!/^\d{7}$/.test(b.employeeId))fail('PLAY_EMPLOYEE_FORMAT',400);return b;}
 const limits=new Map();let total={count:0,until:0};
 function rate(id){if(total.until<=now())total={count:0,until:now()+60000};if(++total.count>120)fail('PLAY_LOGIN_RATE_LIMIT',429);if(!active.has(id))fail('PLAY_EMPLOYEE_UNAVAILABLE',404);let r=limits.get(id);if(!r||r.until<=now())r={count:0,until:now()+60000};r.count++;limits.set(id,r);if(r.count>12)fail('PLAY_LOGIN_RATE_LIMIT',429);}
 const originals=app.server.listeners('request');for(const fn of originals)app.server.removeListener('request',fn);const next=(req,res)=>{for(const fn of originals)fn(req,res);};
 app.server.on('request',async(req,res)=>{let path;try{path=new URL(req.url,'http://127.0.0.1').pathname;}catch{return json(res,400,{error:'BAD_URL'});}if(!path.startsWith('/api/'))return next(req,res);
  try{transport(req);const special=path==='/api/play-login'||path==='/api/play-link';let a=null;try{a=auth(req);}catch(e){if(e.status!==401)throw e;}
   if(special){if(req.method!=='POST')fail('METHOD_NOT_ALLOWED',405);const b=await body(req);rate(b.employeeId);
    if(path==='/api/play-link'){
     if(!a)fail('AUTH_REQUIRED',401);if(limited(a))fail('PLAY_FORMAL_VERIFICATION_REQUIRED');if(!equal(req.headers['x-city-csrf'],a.csrf))fail('CSRF_DENIED');link(a.userId,b.employeeId,'existing-city-session-self-link');return json(res,200,bootstrap(a));
    }
    const row=byId(b.employeeId);if(!row)fail('PLAY_EMPLOYEE_UNAVAILABLE',404);eligible(row.city_uid);if(a&&a.userId!==row.city_uid)fail('PLAY_SIGN_OUT_FIRST',409);
    const u=app.store.user(row.city_uid),token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex'),expires=Math.min(now()+8*3600000,expiresAt);
    db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM city_play_sessions WHERE expires<=? OR token_hash NOT IN(SELECT token_hash FROM sessions)').run(now());db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(hash(token),u.id,csrf,db.prepare('SELECT epoch FROM users WHERE id=?').get(u.id).epoch,expires);db.prepare('INSERT INTO city_play_sessions VALUES(?,?,?,?)').run(hash(token),worldId,b.employeeId,expires);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    res.setHeader('Set-Cookie',`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor((expires-now())/1000)}`);return json(res,200,bootstrap({userId:u.id,csrf,expires,tokenHash:hash(token)}));
   }
   if(path==='/api/session'&&req.method==='GET'&&a)return json(res,200,bootstrap(a));
   if(a&&limited(a)){
    if(req.method==='GET'&&path==='/api/employee/link/status')return json(res,200,{bound:false,playOnly:true,formalIdentityVerified:false});
    if(!(req.method==='GET'&&getGame.has(path)||req.method==='POST'&&postGame.has(path)))fail('PLAY_FORMAL_VERIFICATION_REQUIRED');
   }
   return next(req,res);
  }catch(e){json(res,e.status||500,{error:e.code||'PLAY_LOGIN_UNAVAILABLE'});}
 });
 return Object.freeze({worldId,gameOnly:true,prelinked:prelinked.length});
}
