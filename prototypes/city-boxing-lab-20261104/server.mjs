import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {BoxingStore,LabError} from './boxing-store.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),port=4810,store=new BoxingStore(path.join(root,'.private-runtime/boxing.sqlite')),pub=path.join(root,'public');
const json=(res,status,obj)=>res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}).end(JSON.stringify(obj));
const buckets=new Map();const timer=setInterval(()=>{store.sweep();for(const[k,v]of buckets)if(Date.now()-v.at>60000)buckets.delete(k)},60);timer.unref();
const server=http.createServer(async(req,res)=>{try{if(req.headers.host!=='127.0.0.1:'+port)return json(res,403,{error:'HOST_DENIED'});const url=new URL(req.url,'http://127.0.0.1:'+port),route=url.pathname;
 if(route==='/health')return json(res,200,{ready:true,release:'20261105-boxing-avatar.2',scope:'isolated-synthetic-only',formalWalletEnabled:false});
 if(route.startsWith('/api/')){const rawCookie=/\bboxinglab=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1];let uid;if(route!=='/api/session')uid=store.session(rawCookie).id;
  const key=rawCookie||req.socket.remoteAddress,now=Date.now(),limit=buckets.get(key)||{at:now,n:0};if(now-limit.at>1000){limit.at=now;limit.n=0;}if(++limit.n>20)throw new LabError('RATE_LIMIT',429);buckets.set(key,limit);
  let body={};if(req.method==='POST'){let publicOrigin;try{publicOrigin=JSON.parse(fs.readFileSync(path.join(root,'.private-preview/gateway.json'))).origin}catch{}const allowed=['http://127.0.0.1:'+port,publicOrigin].filter(Boolean);if(!allowed.includes(req.headers.origin))throw new LabError('ORIGIN_DENIED',403);if(!String(req.headers['content-type']).startsWith('application/json'))throw new LabError('JSON_REQUIRED',415);let input='';for await(const chunk of req){input+=chunk;if(Buffer.byteLength(input)>4096)throw new LabError('BODY_TOO_LARGE',413)}try{body=JSON.parse(input)}catch{throw new LabError('INVALID_JSON')}if(!body||Array.isArray(body)||typeof body!=='object')throw new LabError('INVALID_JSON');}
  if(route==='/api/session'&&req.method==='GET')return json(res,200,{self:store.session(rawCookie)});
  if(route==='/api/city'&&req.method==='GET')return json(res,200,store.cityState(uid));
  if(route==='/api/boxing/enter'&&req.method==='POST')return json(res,200,store.enterArena(uid));
  if(route==='/api/boxing/leave'&&req.method==='POST')return json(res,200,store.leaveArena(uid));
  if(route==='/api/city/move'&&req.method==='POST')return json(res,200,store.moveCity(uid,body.pose));
  if(route==='/api/session'&&req.method==='POST'){if(Object.keys(body).some(k=>k!=='nickname'))throw new LabError('INVALID_FIELDS');let self;try{self=store.session(rawCookie)}catch{const result=store.createPlayer(body.nickname);self=result.player;res.setHeader('set-cookie',`boxinglab=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${req.headers.origin?.startsWith('https:')?'; Secure':''}`);}return json(res,200,{self});}
  if(route==='/api/heartbeat'&&req.method==='POST'){store.beat(uid,body.tabId);return json(res,200,{ok:true});}
  if(route==='/api/state'&&req.method==='GET')return json(res,200,store.state(uid,url.searchParams.get('roomId')));
  if(req.method!=='POST')throw new LabError('NOT_FOUND',404);
  let roomId=body.roomId;
  if(route==='/api/rooms'){if(body.mode!=='honor'||body.stake!==0)throw new LabError('HONOR_ONLY',403);store.enterArena(uid);roomId=store.createRoom(uid,body.mode,body.stake);}
  else if(route==='/api/join'){store.join(uid,roomId);store.enterArena(uid);}
  else if(route==='/api/accept')store.accept(uid,roomId,body.requestId);
  else if(route==='/api/cancel')store.cancel(uid,roomId,body.requestId);
  else if(route==='/api/action'){store.action(uid,roomId,body.seq,body.kind);}
  else throw new LabError('NOT_FOUND',404);
  return json(res,200,store.state(uid,roomId));
 }
 let rel;try{rel=decodeURIComponent(route)}catch{throw new LabError('BAD_PATH')}const file=path.resolve(pub,rel==='/'?'index.html':'.'+rel);if(!['GET','HEAD'].includes(req.method)||!file.startsWith(pub+'/')||rel.split('/').some(x=>x.startsWith('.'))||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();const content=fs.readFileSync(file);res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.glb')?'model/gltf-binary':file.endsWith('.webm')?'video/webm':file.endsWith('.png')?'image/png':'application/javascript; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow','content-length':content.length});res.end(req.method==='HEAD'?undefined:content);
 }catch(e){json(res,e.status||500,{error:e.code||'INTERNAL_ERROR'});if(!e.code)console.error(e.message)}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({port,scope:'isolated-synthetic-only'})));for(const sig of['SIGINT','SIGTERM'])process.once(sig,()=>{clearInterval(timer);server.close(()=>{store.close();process.exit()})});
