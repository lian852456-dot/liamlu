const {test,expect}=require('@playwright/test'),fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
const {execFileSync}=require('node:child_process'),{fixture}=require('./helpers/readonly-dashboard-fixture.cjs');
const {createRuntime,parsed,OPERATOR}=require('./helpers/tradein-synthetic-runtime.cjs');
let server,base,html;
test.beforeAll(async()=>{
 const root=path.resolve(__dirname,'..');html=JSON.parse(execFileSync(process.execPath,['-e',"require('./tests/helpers/unified-html-samples.cjs').samples().then(s=>process.stdout.write(JSON.stringify(s.html)))"],{cwd:root,encoding:'utf8',maxBuffer:20*1024*1024}));
 server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname.startsWith('/sample/')){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});return res.end(html[pathname.split('/')[2]]);}const file=path.resolve(root,'.'+pathname);if(path.relative(root,file).startsWith('..'))throw Error();const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'text/html')+';charset=utf-8'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{await new Promise(r=>server.close(r));});
for(const width of [1280,390])for(const kind of ['kpi','awards','store','department','patrol','officer','tradein'])test(`${kind} single HTML works offline at ${width}px`,async({page,context},info)=>{
 const errors=[],network=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url()!==base+'/sample/'+kind&&!r.url().startsWith('data:'))network.push(r.url());});
 await page.setViewportSize({width,height:900});await page.goto(base+'/sample/'+kind);await context.setOffline(true);
 await expect(page.locator('script[src],link[href],iframe,form,input[type="file"],input[type="password"]')).toHaveCount(0);
 if(kind==='store'){await page.locator('[data-tab="conversion"]').click();await page.locator('#store').selectOption({index:1});}
 if(kind==='department'){await page.locator('[data-tab="gold"]').click();await expect(page.locator('#peopleBody')).toContainText('測＊員');}
 if(kind==='patrol'){await page.locator('#query').fill('合成缺失');await expect(page.locator('#visible')).toContainText('1');}
 if(kind==='officer'){await page.locator('[data-tab="insights"]').click();await expect(page.locator('#status')).toContainText('資料已載入');}
 if(kind==='tradein'){await page.locator('#query').fill('合＊0');await expect(page.locator('#count')).toHaveText('顯示 1／9 人');await page.locator('#query').fill('');}
 if(kind==='kpi'||kind==='awards'){await page.locator('#search').fill('不存在的合成條件');await expect(page.locator('section tbody tr:visible')).toHaveCount(0);await page.locator('#search').fill('');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(network).toEqual([]);expect(errors).toEqual([]);
 await page.screenshot({path:info.outputPath(kind+'-'+width+'.png'),fullPage:true});
});
test('KPI and awards download from verified memory and stop after logout',async({page})=>{
 const bundle=fixture(),calls=[];
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(u.hostname!=='script.google.com')return route.abort();const payload=route.request().postDataJSON();calls.push(payload.action);return route.fulfill({json:payload.action==='private_access'?bundle.privateResult:bundle.kpiResult});});
 await page.goto(base+'/kpi-battle.html');await page.locator('[data-b-a]').click();await page.locator('#kpiBattleContent #privateEmployeeId').fill('SYNTH01');await page.locator('#kpiBattleContent [data-private-dashboard-action="login"]').click();await expect(page.locator('[data-battle-html-export="kpi"]')).toBeVisible();
 for(const kind of ['kpi','awards']){
  if(kind==='awards')await page.evaluate(()=>location.hash='awards');
  const pending=page.waitForEvent('download');await page.locator('[data-battle-html-export="'+kind+'"]').click();const download=await pending,text=await fs.readFile(await download.path(),'utf8');expect(text).toContain('north12-single-html/v1');expect(text).not.toContain('B1_a_');expect(text).not.toContain('SYNTHETIC_DEVICE');
 }
 expect(calls).toEqual(['private_access','kpicalc_access']);await page.evaluate(()=>window.DashboardB.clear());await expect(page.locator('[data-battle-html-export]')).toHaveCount(0);
});
test('trade-in HTML includes all rows while reminder is concise; month change disables download',async({page},info)=>{
 const r=createRuntime(),source=parsed();r.configure(source);const p=r.a.tradeinPerformancePreview({source,employeeId:OPERATOR,adminSecret:r.secret}),v=r.a.tradeinPerformancePublish({source,...p,employeeId:OPERATOR,adminSecret:r.secret});r.a.tradeinPerformancePublicPublish({employeeId:OPERATOR,adminSecret:r.secret,month:source.month,sourceHash:source.source_sha256,expectedActiveHash:v.snapshotHash});
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-09T14:00:00Z')});
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();if(u.hostname!=='script.google.com')return route.abort();let payload;try{payload=JSON.parse(route.request().postData());}catch{payload=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));}calls.push(payload.action);const body=r.dispatch(payload);if(u.searchParams.get('transport')==='iframe'){const message=JSON.stringify({type:'north12b-gas-response-v1',requestId:u.searchParams.get('requestId'),body}).replace(/</g,'\\u003c');return route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><script>top.postMessage('+message+',"*")</script>'});}return route.fulfill({json:body});});
 await page.goto(base+'/tradein-progress.html');await expect(page.locator('#refreshData')).toBeEnabled();await expect(page.locator('#downloadReminderHtml')).toBeEnabled();await expect(page.locator('#reminderText')).toHaveValue(/店點 TOP3/);await expect(page.locator('#reminderText')).toHaveValue(/價格優勢待核/);
 const pending=page.waitForEvent('download');await page.locator('#downloadReminderHtml').click();const d=await pending,text=await fs.readFile(await d.path(),'utf8');expect(text).toContain('完整人員明細（4 人）');expect(text).toContain('north12-single-html/v1');expect(text).not.toContain(r.secret);expect(calls).toEqual(['tradein_performance_public_read']);
 await page.setViewportSize({width:390,height:900});await page.locator('#reminderPreview').evaluate(el=>el.open=true);await page.screenshot({path:info.outputPath('tradein-live-reminder-390.png'),fullPage:true});
 await page.locator('#periodMonth').fill('2026-11');await page.locator('#periodMonth').dispatchEvent('change');await expect(page.locator('#reminderText')).toHaveValue('');await expect(page.locator('#downloadReminderHtml')).toBeDisabled();expect(errors).toEqual([]);
});
