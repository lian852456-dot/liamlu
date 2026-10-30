import {createGameServer} from './base/serve.mjs';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import{readFile}from'node:fs/promises';import{join,dirname}from'node:path';import{fileURLToPath}from'node:url';
export const ROOT=dirname(fileURLToPath(import.meta.url));export const DEADLINE=Date.parse('2026-10-31T15:59:00.000Z');
const rootFiles=new Set(['review.html', 'evidence/full-character-integration/full-body-overview.png', 'evidence/full-character-integration/comparison-front.png', 'evidence/full-character-integration/comparison-quarter.png', 'evidence/full-character-integration/comparison-side.png', 'evidence/full-character-integration/comparison-back.png', 'evidence/full-character-integration/comparison-city-day.png', 'evidence/full-character-integration/comparison-city-dusk.png', 'evidence/full-character-integration/comparison-city-night.png','index.html','artlab.css','artlab-ui.js','studio.html','studio.js','game.html','game-controls.js','game-session-bootstrap.js','avatar-deluxe.js','head-art.js','head-art-previous.js','avatar-deluxe-head-art-v1.js','avatar-head-v1-alias.js','avatar-candidate.js','avatar-deluxe-integrated.js','avatar-integrated-alias.js','gltf-loader.js','hair-glb.js','assets/hair-glb/short-bob-v1.glb','assets/hair-glb-v2/short-bob-v2.glb','hair-glb-v1.js','avatar-deluxe-blender-v1.js','avatar-blender-v1-alias.js']);
const baseFiles=new Set(JSON.parse(readFileSync(join(ROOT,'baseline-manifest.json'))).files.map(f=>f.file).filter(f=>!f.endsWith('.mjs')&&!f.startsWith('base/vendor/ws/')&&!f.includes('employee-')&&!f.includes('staff-peer')&&f!=='base/index.html'));
export const PUBLIC_FILES=Object.freeze([...rootFiles,...baseFiles].sort());
const mime=p=>p.endsWith('.png')?'image/png':p.endsWith('.glb')?'model/gltf-binary':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8';
export function createArtLabServer({dataDir=join(ROOT,'base/.private-v42-full-integration'),port=4734,now=Date.now}={}){
 if(now()>=DEADLINE)throw Error('ARTLAB_PREVIEW_EXPIRED');
 const app=createGameServer({dataDir,host:'127.0.0.1',port,now,cookieName:'city_avatar_full_integration_20261030',allowGuestRegistration:true,inviteExpiresAt:DEADLINE});
 const original=app.server.listeners('request');app.server.removeAllListeners('request');
 app.server.on('request',async(req,res)=>{let path;try{path=new URL(req.url,'http://127.0.0.1').pathname;}catch{res.writeHead(400);res.end();return;}
  const peer=(req.socket.remoteAddress||'').replace(/^::ffff:/,''),host='127.0.0.1:'+req.socket.localPort;
  if(!['127.0.0.1','::1'].includes(peer)||req.headers.host!==host){res.writeHead(403);res.end();return;}
  if(now()>=DEADLINE){res.writeHead(410);res.end('Preview expired');return;}
  if(path.startsWith('/api/')){for(const handler of original)handler(req,res);return;}
  const file=path==='/'?'index.html':path.slice(1);
  if(!['GET','HEAD'].includes(req.method)||!rootFiles.has(file)&&!baseFiles.has(file)){res.writeHead(404);res.end();return;}
  try{const bytes=await readFile(join(ROOT,file));res.writeHead(200,{'Content-Type':mime(file),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Robots-Tag':'noindex, nofollow'});res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(404);res.end();}
 });return app;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const app=createArtLabServer();await new Promise((r,j)=>{app.server.once('error',j);app.server.listen(4734,'127.0.0.1',r);});let stopped=false;const close=async()=>{if(stopped)return;stopped=true;clearTimeout(timer);await app.close();};const timer=setTimeout(close,DEADLINE-Date.now());for(const s of ['SIGTERM','SIGINT'])process.once(s,close);console.log(JSON.stringify({url:'http://127.0.0.1:4734',deadline:new Date(DEADLINE).toISOString(),isolated:true}));
}
