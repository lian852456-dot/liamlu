import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(process.argv[2]||path.join(root,'dist/tradein-price-share'));
const src=(name)=>fs.readFileSync(path.join(root,name),'utf8');
let html=src('tradein-price-share.html')
  .replace(/tradein-price-share\.css\?v=[^"]+/g,'style.css')
  .replace(/tradein-price-share\.js\?v=[^"]+/g,'app.js')
  .replace(/\s*<link rel="stylesheet" href="tradein-compact-view\.css\?v=[^"]+">/g,'')
  .replace(/\s*<script src="tradein-compact-view\.js\?v=[^"]+"><\/script>/g,'');
// Bundle only the shared presentation enhancement. The deployed site still has exactly three files.
const css=src('tradein-price-share.css')+'\n'+src('tradein-compact-view.css');
const js=src('tradein-price-share.js')+'\n;\n'+src('tradein-compact-view.js');
if(!html.includes('href="style.css"')||!html.includes('src="app.js"'))throw Error('Portable bundle asset mapping failed');
if(/<script\b[^>]*src="(?:https?:|\/\/)/i.test(html))throw Error('External client script is not allowed');
if(/<a\b/i.test(html))throw Error('Share page must not provide any portal links');
if(/home\.html|tradein-progress|tradein-brief|dashboard|portal-logout|threec-query-core|\.localStorage|\.sessionStorage/i.test(html+'\n'+js))
  throw Error('Public bundle contains private portal reference');
if(!js.includes("action:'threec_snapshot_read',kind:'tradein',includeChanges:false"))
  throw Error('Unexpected public API contract');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'index.html'),html);
fs.writeFileSync(path.join(out,'style.css'),css);
fs.writeFileSync(path.join(out,'app.js'),js);
console.log('Public-only bundle ready: '+out+' (index.html, style.css, app.js)');
