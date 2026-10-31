#!/usr/bin/env node
// Reuse the official public query snapshot contract and presentation assets.
// This script reads prices only. It never publishes, uploads or changes data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const Transport=require('../threec-price-transport.js');
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
export const VERSION='price-offline/v2';
const Offline=require('../threec-price-offline-core.js');
export const publicPriceResponse=Offline.publicPriceResponse;
function replaceOne(source,oldValue,newValue){if(source.split(oldValue).length!==2)throw Error('Presentation source changed; review exporter anchor: '+oldValue.slice(0,60));return source.replace(oldValue,()=>newValue);}
function removeBetween(source,start,end,replacement=''){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);if(a<0||b<0)throw Error('Presentation source changed: '+start);return source.slice(0,a)+replacement+source.slice(b);}
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function buildTemplate(){
  const generatedAt='@@PRICE_OFFLINE_GENERATED_AT@@',sourceCommit='@@PRICE_OFFLINE_SOURCE_COMMIT@@',payloadHash='@@PRICE_OFFLINE_PAYLOAD_SHA256@@';
  const responses={shopping:{snapshot:{source_version_date:'@@PRICE_OFFLINE_SHOPPING_DATE@@'}},tradein:{snapshot:{source_version_date:'@@PRICE_OFFLINE_TRADEIN_DATE@@'}}};
  let ui=read('threec-query-ui.js');
  ui=replaceOne(ui,"const queryKind=document.body.dataset.queryKind==='tradein'?'tradein':'shopping';","const queryKind='shopping';");
  ui=replaceOne(ui,'  const DiffCore=scope.ThreecPriceDiffCore;\n','');
  ui=ui.replace(/^  const API=.*\n/m,'');
  ui=removeBetween(ui,'  function readPublicFrame(', '  function clearResults()',"  const embedded=JSON.parse(document.getElementById('price-data').textContent);\n  async function invoke(kind){return Transport.decode(embedded[kind]);}\n");
  ui=removeBetween(ui,'  function changeRows(', '  function shoppingFilters()', '  function renderChanges(){}\n');
  ui=removeBetween(ui,'  function showKind(', '  async function refresh()',"  function showKind(kind){state.active=kind;['shopping','tradein'].forEach(value=>{const active=value===kind;$(value+'Tab').classList.toggle('active',active);$(value+'Tab').setAttribute('aria-selected',String(active));$(value+'Pane').classList.toggle('hidden',!active);});}\n");
  ui=replaceOne(ui,"setStatus('正在讀取正式價格…');return;","setStatus('正在準備本機查詢…');return;");
  ui=replaceOne(ui,"setStatus('正在讀取正式價格…')","setStatus('正在讀取內嵌價格…')");
  ui=replaceOne(ui,"'已讀取正式資料；請依版本／日期核對後查詢。'","'離線唯讀版已就緒；價格依本檔來源版本。'");
  ui=removeBetween(ui,"    $('changeLoadBtn').addEventListener(","    document.querySelectorAll('[data-kind]')");
  ui=removeBetween(ui,'    let changeSearchTimer=',"    scope.addEventListener('pagehide'");
  ui=replaceOne(ui,"    $('refreshBtn').addEventListener('click',refresh);","    $('refreshBtn').addEventListener('click',refresh);\n    $('tradeinReset').addEventListener('click',()=>{['tradeinSearch','tradeinBrand','tradeinModel','tradeinProvider','tradeinGrade'].forEach(id=>$(id).value='');renderKind('tradein');});");
  ui=replaceOne(ui,"state.loading=false;$('refreshBtn').disabled=false;","state.loading=false;$('refreshBtn').disabled=false;requestAnimationFrame(()=>{const timing=document.getElementById('localTiming');if(!timing.dataset.ready){timing.textContent='本次開啟至可查詢：'+Math.round(performance.now())+' ms（此裝置實測）';timing.dataset.ready='true';}});");
  // This shared core contains two unused login-key constants. Do not ship even
  // unused identity terminology into the portable price-only artifact.
  let core=read('threec-query-core.js');
  core=removeBetween(core,'  // These are the identities', '  const PROVIDERS', '  const STORAGE_KEYS=Object.freeze({});\n');
  let html=read('tradein-query.html').replace(/<link rel="stylesheet"[^>]+>/g,'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  html=replaceOne(html,'<title>舊換新專區｜北一二B</title>','<title>門市查價｜手機專案與舊換新｜離線唯讀</title>');
  html=removeBetween(html,'  <section class="hero">','<section class="card" id="queryCard">',`  <section class="hero"><h1>手機專案與舊換新查價</h1><p>門市離線唯讀版 · 資料已內嵌，開啟即可搜尋</p><p>來源版本日期：手機 ${esc(responses.shopping.snapshot.source_version_date)} ／ 舊換新 ${esc(responses.tradein.snapshot.source_version_date)}<br>版本日期不等於生效日期；未到適用日請依公司公告。非即時報價，每次正式資料更新後請使用重新匯出的新版。</p><p>產出時間：${esc(generatedAt)}（UTC）<br>檔案版本：${VERSION} · @@PRICE_OFFLINE_PAYLOAD_SHORT@@</p><p id="localTiming" role="status">正在準備本機查詢…</p><details><summary>價格定義與版本資訊</summary><p>手機專案價依原表完整專案、月租、期數、資格及版本條件。單機價與專案價分列。舊換新依點子行動與 FutureDial（FDI）各自 S／A／B／C 原始回收價；如來源另有愛鋒派，保留其原分級或未分級報價。不同回收商與等級不相加；回收價與手機專案價獨立查詢。缺價不補零，0 元保留。</p><p>此檔是價格快照；不會自動更新。請先下載到裝置，再用瀏覽器開啟。HTML 唯讀不等於加密或存取控制。</p><p>程式來源版本：${esc(sourceCommit)}<br>資料指紋 SHA-256：${payloadHash}</p></details></section>\n`);
  html=replaceOne(html,'<h2 style="margin:0">回收價查詢</h2>','<h2 style="margin:0">門市價格查詢</h2>');
  html=replaceOne(html,'>重新整理</button>','>重新讀取本檔</button>');
  html=replaceOne(html,'class="tabs legacy-tabs" role="tablist" hidden','class="tabs" role="tablist" aria-label="查價類別"');
  html=replaceOne(html,'>手機專案／3C</button>','>手機專案價</button>');
  html=replaceOne(html,'>舊換新</button>','>舊換新回收價</button>');
  html=replaceOne(html,'<div id="tradeinMeta"','<button id="tradeinReset" class="text-button" type="button">清除舊換新篩選</button><div id="tradeinMeta"');
  html=removeBetween(html,'    <section id="changeCard"','    <p class="privacy">');
  html=replaceOne(html,'免登入即可瀏覽；重新開啟或按「重新整理」會讀取最新正式價格。','資料截至本檔所列來源版本。正式資料更新後，請取得新版 HTML。');
  const css=['threec-query.css','tradein-area.css','tradein-compact-view.css'].map(read).join('\n')+'\n.hero p{overflow-wrap:anywhere}.tabs{flex-wrap:wrap}.tabs button{min-height:44px}select,input{max-width:100%}[hidden]{display:none!important}body[data-query-kind] #shoppingPane:not(.hidden),body[data-query-kind] #tradeinPane:not(.hidden){display:block!important}';
  const scripts=[read('threec-price-transport.js'),read('price-model-view.js'),core,read('threec-comparison-core.js'),read('tradein-brand-query.js'),ui,read('tradein-compact-view.js')];
  html=replaceOne(html,'</head>',`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'"><style>${css}</style></head>`);
  html=replaceOne(html,'</body>',`<script type="application/json" id="price-data">@@PRICE_OFFLINE_DATA@@</script><script type="application/json" id="export-manifest">@@PRICE_OFFLINE_MANIFEST@@</script>${scripts.map(source=>'<script>'+source.replace(/<\/script/gi,'<\\/script')+'</script>').join('\n')}</body>`);
  return html;
}
export function buildHtml(input,{generatedAt=new Date().toISOString(),sourceCommit='unrecorded'}={}){
  const responses=Offline.projectResponses(input);
  const payloadSha256=crypto.createHash('sha256').update(JSON.stringify(responses)).digest('hex');
  return Offline.assemble(buildTemplate(),responses,{generatedAt,sourceCommit,payloadSha256});
}

async function main(){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){if(!['--out','--shopping','--tradein'].includes(args[i])||!args[i+1])throw Error('Usage: node scripts/export-price-offline.mjs --out /private/new-version.html [--shopping /private/shopping.json --tradein /private/tradein.json]');options[args[i].slice(2)]=args[i+1];}
  if(!options.out||Boolean(options.shopping)!==Boolean(options.tradein))throw Error('Specify output and both saved sources, or neither saved source.');
  const output=path.resolve(options.out);
  if(output.startsWith(root+path.sep))throw Error('Keep real price snapshots outside the repository.');
  if(fs.existsSync(output))throw Error('Output already exists; use a new version filename.');
  const input={},reads=[];
  const api=read('threec-query-ui.js').match(/const API='([^']+)'/)[1];
  for(const kind of ['shopping','tradein']){
    const start=performance.now();
    if(options[kind])input[kind]=JSON.parse(fs.readFileSync(path.resolve(options[kind]),'utf8'));
    else{
      const response=await fetch(api+'?readAttempt=offline-export-'+crypto.randomUUID(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'threec_snapshot_read',kind,includeChanges:false,priceEncoding:Transport.ENCODING}),redirect:'follow',credentials:'omit',signal:AbortSignal.timeout(65000)});
      if(!response.ok)throw Error(kind+': formal read HTTP '+response.status);
      input[kind]=await response.json();
    }
    reads.push({kind,route:options[kind]?'saved-response':'formal-public-read',milliseconds:Math.round(performance.now()-start)});
  }
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const result=buildHtml(input,{sourceCommit});
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,result.html,{flag:'wx'});
  fs.writeFileSync(output+'.receipt.json',JSON.stringify({...result.manifest,reads,bytes:Buffer.byteLength(result.html),htmlSha256:crypto.createHash('sha256').update(result.html).digest('hex')},null,2),{flag:'wx'});
  console.log(JSON.stringify({output,bytes:Buffer.byteLength(result.html),version:VERSION,sources:result.manifest.sources,reads},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
