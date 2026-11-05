'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const P=['點子行動','FutureDial（FDI）','愛鋒派'];
const G=['S','A','B','C','未分級'];
const configs=[
 {name:'internal',file:'tradein-query.html',brand:'#tradeinBrand',model:'#tradeinModel',keyword:'#tradeinSearch',provider:'#tradeinProvider',grade:'#tradeinGrade',target:'#tradeinResults',meta:'#tradeinMeta',asset:'tradein-brand-query.js',url:'https://lian852456-dot.github.io/liamlu/tradein-query.html'},
 {name:'public',file:'tradein-price-share.html',brand:'#brand',model:'#model',keyword:'#keyword',provider:'#provider',grade:'#grade',target:'#results',meta:'#sourceMeta',asset:'app.js',url:'https://twm-tradein-price.pages.dev/'}
].filter(c=>fs.existsSync(path.join(root,c.file))&&(c.name!=='internal'||fs.readFileSync(path.join(root,c.file),'utf8').includes('tradein-brand-query.js')));
const clean=v=>v==null?'':String(v).trim();
const key=r=>[clean(r.brand),clean(r.colorless_model||r.model)].join('\u0001');
const isQuoted=v=>v!=null&&clean(v)!=='';
function row(brand,model,n){return {source_sheet:'SYNTHETIC ONLY',brand,model,quotes:{[P[0]]:{S:'',A:String(n),B:'0',C:'123'},[P[1]]:{S:String(n+111),A:String(n+7),B:null,C:'456'}}};}
function fixture(){return {status:'ok',snapshot:{kind:'tradein',source_version_date:'2026-10-12',snapshot_hash:'synthetic-samsung-filter',published_at:'2026-10-12T00:00:00+08:00',row_count:3,rows:[row('Samsung','Galaxy S24 256GB (5G)',5700),row('SAMSUNG','Galaxy Z Fold6 512GB (5G)',15900),row('Apple','iPhone 15 128GB (5G)',3900)]},changesDeferred:true};}
async function mock(page,body){
 const calls=[];let failed=false;
 await page.route('https://**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(!u.pathname.endsWith('/exec'))return route.abort();
  const text=req.postData()||'{}';const payload=JSON.parse(text.startsWith('{')?text:new URLSearchParams(text).get('payload')||'{}');calls.push(payload);
  const answer=failed?{status:'error',message:'合成測試：拒絕讀取'}:payload.kind==='tradein'?body:{status:'ok',snapshot:null,changesDeferred:true};
  if(u.searchParams.get('transport')==='iframe'){
   const msg=JSON.stringify({type:'north12b-gas-response-v1',requestId:u.searchParams.get('requestId'),body:answer}).replace(/</g,'\\u003c');
   return route.fulfill({contentType:'text/html',body:'<script>top.postMessage('+msg+',"*")</script>'});
  }
  return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(answer)});
 });return {calls,fail:()=>{failed=true;}};
}
async function actualPrices(page,c){
 return page.locator(c.target+' .tc-item').evaluateAll(cards=>cards.map(card=>Array.from(card.querySelectorAll('.tc-provider-row')).map(block=>({
  provider:block.querySelector('.tc-provider-label').textContent,
  prices:Object.fromEntries(Array.from(block.querySelectorAll('.tc-cell')).filter(cell=>!cell.classList.contains('tc-missing')).map(cell=>[cell.dataset.grade,cell.querySelector('.tc-number')?.textContent||cell.textContent.replace(/\s*元\s*$/,'')]))
 }))));
}
function expectedPrices(rows,provider='',grade=''){
 return rows.map(r=>P.filter(p=>(!provider||provider===p)&&G.some(g=>(!grade||grade===g)&&isQuoted(r.quotes[p]?.[g]))).map(p=>({provider:p===P[1]?'FDI':p,prices:Object.fromEntries(G.filter(g=>(!grade||grade===g)&&isQuoted(r.quotes[p]?.[g])).map(g=>[g,Number(clean(r.quotes[p][g]).replace(/,/g,'')).toLocaleString('en-US')]))})));
}
async function openOfficialFilters(page){const advanced=page.locator('.query-tradein-advanced');if(await advanced.count()&&await advanced.getAttribute('open')===null)await advanced.locator(':scope > summary').click();}
async function modernMatrices(page,expectedRows){
 const matrices=[];let index=0;
 while(index<expectedRows.length){
  const count=await page.locator('.official-price-table tbody tr').count();expect(count).toBeGreaterThan(0);
  for(let i=0;i<count;i++){
   await page.locator('.official-price-table tbody th button').nth(i).click();await page.locator('[data-oq=detail]').click();await expect(page.locator('#tradeinOfficialDialog')).toBeVisible();
   const actual=await page.locator('[data-oq=dialog-body] tbody tr').evaluateAll(nodes=>{
    const providers=new Map();for(const tr of nodes){const p=tr.querySelector('th').textContent.replace(/（獨立報價）/g,'').trim(),label=/FDI/.test(p)?'FDI':p,cells=tr.querySelectorAll('td'),g=cells[0].textContent.includes('未分級')?'未分級':cells[0].textContent.trim()[0];if(!providers.has(label))providers.set(label,{provider:label,prices:{}});providers.get(label).prices[g]=cells[1].textContent.replace(/\s*元\s*$/,'');}return [...providers.values()];
   });
   expect(actual).toEqual(expectedPrices([expectedRows[index]])[0]);matrices.push(actual);index++;await page.locator('[data-oq=close]').click();
  }
  if(index<expectedRows.length)await page.locator('[data-oq=next]').click();
 }
 expect(index).toBe(expectedRows.length);return matrices;
}
if(configs.some(c=>c.name==='internal'))test('default v6 mobile user opens filters and checks all supplier grades through source details',async({page})=>{
 const C=require('../threec-query-core.js'),data=fixture(),before=JSON.stringify(data);await mock(page,data);await page.setViewportSize({width:390,height:844});await page.goto('file://'+path.join(root,'tradein-query.html'));
 await expect(page.locator('#tradeinResults')).toHaveClass(/official-workspace/);await openOfficialFilters(page);await page.locator('#tradeinBrand').selectOption('Samsung');
 const snapshot={...data.snapshot,rows:data.snapshot.rows.filter(r=>/^samsung$/i.test(r.brand))};for(const k of C.modelOptions(snapshot,'tradein').map(o=>o.value)){await page.locator('#tradeinModel').selectOption(k);await modernMatrices(page,C.filterTradeinByModel(snapshot,{modelKey:k}));}expect(JSON.stringify(data)).toBe(before);
});
for(const c of configs){
 for(const width of [320,390,1280])test(`${c.name} ${width}px Samsung aliases share one option; both price matrices remain exact`,async({page},testInfo)=>{
  const data=fixture(),original=JSON.stringify(data),api=await mock(page,data);await page.setViewportSize({width,height:900});await page.goto('file://'+path.join(root,c.file)+(c.name==='internal'?'?view=source':''));
  await expect(page.locator(c.brand+' option')).toHaveText(['全部廠牌','Apple','Samsung']);
  await page.locator(c.brand).selectOption('Samsung');
  await expect(page.locator(c.target+' .tc-item')).toHaveCount(2);
  expect(await actualPrices(page,c)).toEqual(expectedPrices(data.snapshot.rows.slice(0,2)));
  expect(await page.locator(c.model+' option').evaluateAll(o=>o.slice(1).map(x=>x.value))).toEqual(data.snapshot.rows.slice(0,2).map(key));
  for(const r of data.snapshot.rows.slice(0,2)){
   await page.locator(c.model).selectOption(key(r));await expect(page.locator(c.target+' .tc-item')).toHaveCount(1);
   expect(await actualPrices(page,c)).toEqual(expectedPrices([r]));
  }
  await page.locator(c.model).selectOption('');await page.locator(c.provider).selectOption(P[1]);await page.locator(c.grade).selectOption('A');
  expect(await actualPrices(page,c)).toEqual(expectedPrices(data.snapshot.rows.slice(0,2),P[1],'A'));
  await page.locator(c.keyword).fill('fold6');await expect(page.locator(c.target+' .tc-item')).toHaveCount(1);
  expect(await actualPrices(page,c)).toEqual(expectedPrices([data.snapshot.rows[1]],P[1],'A'));
  await page.locator(c.brand).selectOption('Apple');await expect(page.locator(c.target+' .tc-item')).toHaveCount(0);
  await page.locator(c.brand).selectOption('Samsung');await expect(page.locator(c.target+' .tc-item')).toHaveCount(1);
  await expect(page.locator(c.provider)).toHaveValue(P[1]);await expect(page.locator(c.grade)).toHaveValue('A');
  expect(JSON.stringify(data)).toBe(original);expect(api.calls.length).toBe(c.name==='public'?1:2);
  expect(api.calls.every(p=>p.action==='threec_snapshot_read')).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('SYNTHETIC-samsung-'+c.name+'-'+width+'.png'),fullPage:true});
 });
 test(`${c.name} same model under both source aliases never overwrites a quote`,async({page})=>{
  const data=fixture();data.snapshot.rows[1].model=data.snapshot.rows[0].model;await mock(page,data);await page.goto('file://'+path.join(root,c.file)+(c.name==='internal'?'?view=source':''));
  await page.locator(c.brand).selectOption('Samsung');await expect(page.locator(c.model+' option')).toHaveCount(3);
  for(const r of data.snapshot.rows.slice(0,2)){await page.locator(c.model).selectOption(key(r));await expect(page.locator(c.target+' .tc-item')).toHaveCount(1);expect(await actualPrices(page,c)).toEqual(expectedPrices([r]));}
 });
 test(`${c.name} complete catalog includes both aliases past initial display limit; error clears it`,async({page})=>{
  const data=fixture();data.snapshot.rows=Array.from({length:66},(_,i)=>row(i<33?'Samsung':'SAMSUNG','Galaxy synthetic '+i+' 256GB',1000+i));data.snapshot.row_count=66;
  const api=await mock(page,data);await page.goto('file://'+path.join(root,c.file)+(c.name==='internal'?'?view=source':''));await page.locator(c.brand).selectOption('Samsung');
  await expect(page.locator(c.brand+' option')).toHaveText(['全部廠牌','Samsung']);await expect(page.locator(c.model+' option')).toHaveCount(67);
  await page.locator(c.model).selectOption(key(data.snapshot.rows[65]));await expect(page.locator(c.target+' .tc-item')).toHaveCount(1);
  expect(await actualPrices(page,c)).toEqual(expectedPrices([data.snapshot.rows[65]]));await expect(page.locator(c.meta)).toContainText('66');
  api.fail();await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('拒絕讀取');await expect(page.locator(c.target+' .tc-item')).toHaveCount(0);
  await expect(page.locator(c.brand+' option')).toHaveText(['全部廠牌']);
 });
}

// Separate, finite, read-only post-deployment acceptance. No login or publication calls.
if(process.env.LIVE_SURFACE){
 const c=configs.find(x=>x.name===process.env.LIVE_SURFACE);
 test('LIVE official Samsung catalog and all original supplier/grade prices',async({page,request},testInfo)=>{
  test.setTimeout(240000);expect(c).toBeTruthy();
  const report={surface:c.name,url:c.url,commit:process.env.GITHUB_SHA||'',source:'live official endpoint',passed:false};
  let observed=null;
  try{
   const asset=new URL(c.asset,c.url).href;
   await expect.poll(async()=>{try{const r=await request.get(asset+'?verify='+report.commit,{timeout:10000});return r.ok()&&(await r.text()).includes('const canonicalBrand=');}catch{return false;}},{timeout:120000,intervals:[5000,10000]}).toBe(true);
   await page.exposeFunction('__captureTradein',data=>{if(data&&data.kind==='tradein'&&Array.isArray(data.rows))observed=data;});
   await page.addInitScript(()=>{
    const json=Response.prototype.json;Response.prototype.json=async function(){const b=await json.call(this);if(b?.status==='ok'&&b.snapshot?.kind==='tradein')window.__captureTradein(b.snapshot);return b;};
    addEventListener('message',e=>{try{const u=new URL(e.origin);if(u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('-script.googleusercontent.com'))&&e.data?.type==='north12b-gas-response-v1'&&e.data.body?.status==='ok')window.__captureTradein(e.data.body.snapshot);}catch{}});
   });
   await page.setViewportSize({width:390,height:844});await page.goto(c.url+'?verify='+report.commit,{waitUntil:'domcontentloaded',timeout:30000});
   await expect.poll(()=>!!observed,{timeout:75000}).toBe(true);
   const original=JSON.stringify(observed),rows=observed.rows.filter(r=>/^samsung$/i.test(clean(r.brand))&&P.some(p=>G.some(g=>isQuoted(r.quotes[p]?.[g]))));
   report.sourceDate=observed.source_version_date;report.snapshotHash=observed.snapshot_hash;report.sourceRows=observed.rows.length;
   report.rawBrandCounts=Object.fromEntries(['Samsung','SAMSUNG'].map(b=>[b,rows.filter(r=>clean(r.brand)===b).length]));
   expect(report.rawBrandCounts.Samsung).toBeGreaterThan(0);expect(report.rawBrandCounts.SAMSUNG).toBeGreaterThan(0);
   const aliases=await page.locator(c.brand+' option').evaluateAll(o=>o.filter(x=>/^samsung$/i.test(x.textContent.trim())).map(x=>({label:x.textContent,value:x.value})));
   expect(aliases).toEqual([{label:'Samsung',value:'Samsung'}]);await openOfficialFilters(page);await page.locator(c.brand).selectOption('Samsung');
   const modern=await page.locator(c.target+'.official-workspace').count()>0,C=modern?require('../threec-query-core.js'):null,scoped={...observed,rows};
   const keys=modern?C.modelOptions(scoped,'tradein').map(o=>o.value):[...new Set(rows.map(key))];expect(await page.locator(c.model+' option').evaluateAll(o=>o.slice(1).map(x=>x.value))).toEqual(keys);
   let quoteCount=0;
   for(const k of keys){
    const matches=modern?C.filterTradeinByModel(scoped,{modelKey:k}):rows.filter(r=>key(r)===k);await page.locator(c.model).selectOption(k);
    const expected=expectedPrices(matches);if(modern){expect(await modernMatrices(page,matches)).toEqual(expected);}else{await expect(page.locator(c.target+' .tc-item')).toHaveCount(matches.length);expect(await actualPrices(page,c)).toEqual(expected);}
    quoteCount+=expected.flat().reduce((n,p)=>n+Object.keys(p.prices).length,0);
   }
   expect(JSON.stringify(observed)).toBe(original);report.samsungRows=rows.length;report.modelOptionsChecked=keys.length;report.quoteValuesChecked=quoteCount;report.singleSamsungOption=true;report.originalPricesPreserved=true;report.defaultV6Comparison=modern;
   await page.locator(c.model).selectOption(keys[0]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   report.passed=true;
  }catch(e){report.error=String(e.message).slice(0,1600);throw e;}
  finally{fs.writeFileSync(testInfo.outputPath('live-acceptance.json'),JSON.stringify(report,null,2));console.log('LIVE_ACCEPTANCE '+JSON.stringify(report));}
 });
}
