'use strict';
const {test,expect}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');let server,base;
const ledger={schema:'north12b-public-gold/v1',settlements:[{date:'2026-10-01',rows:[{store:'三創',alias:'測試甲',balance:20,delta:null},{store:'通化',alias:'測試乙',balance:-3,delta:null}]},{date:'2026-10-02',rows:[{store:'三創',alias:'測試甲',balance:21,delta:1,reason:'合成增牌原因',exemption:''},{store:'通化',alias:'測試乙',balance:-4,delta:-1,reason:'合成減牌原因',exemption:''}]}]};
const fixture=()=>({schema:'north12b-public-gold-annotations/v1',mode:'annotation-only',batches:[{id:'synthetic-week-01',period:'2026-10-W1',title:'已扣說明 <img src=x onerror="window.noteInjected=true">',alreadyApplied:true,applyToBalance:false,descriptionTotal:-30,rows:[{store:'三創',displayName:'測試甲',insuranceSales:1,attachRate:'25.00%',descriptionAmount:-20,criterion:'低於40%'},{store:'通化',displayName:'測試乙',insuranceSales:2,attachRate:'45.00%',descriptionAmount:-10,criterion:'40%至未滿50%'}]}]});
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/`;
});
test.afterAll(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
async function setup(page,notes){await page.route('**/exec',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',ledger})}));await page.route('**/gold-annotations-public.json*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(notes)}));}
for(const width of [1440,390])test(`${width}px displays already-paid explanations while daily numbers and filters stay independent`,async({page})=>{
 await page.setViewportSize({width,height:1000});await setup(page,fixture());await page.goto(base+'gold-medal.html');
 await expect(page.locator('#goldNotesBatches tbody tr')).toHaveCount(2);await expect(page.locator('#goldNotesStatus')).toContainText('不再扣牌');
 await expect(page.locator('.gold-note-summary')).toHaveText('2 筆｜已扣說明額合計 -30｜本次追加扣牌 0');
 await expect(page.locator('#viewerSummary .summary-card').first()).toContainText('17');
 await expect(page.locator('#viewerDailyBody')).toContainText('合成增牌原因');
 expect(await page.evaluate(()=>window.noteInjected)).toBeUndefined();expect(await page.locator('#goldNotesBatches img').count()).toBe(0);
 await page.locator('#viewerStore').selectOption('三創');await expect(page.locator('#viewerBody')).toContainText('21');
 await expect(page.locator('#goldNotesBatches tbody tr')).toHaveCount(2);
 await page.locator('#viewerMonth').selectOption('2026-10-01');await expect(page.locator('#viewerBody')).toContainText('20');await expect(page.locator('#viewerDailyBody')).toContainText('—');
 await expect(page.locator('#goldNotesBatches tbody tr')).toHaveCount(2);
 expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/gold-notes-${width}.png`,fullPage:true});
});
test('notes failure clears explanations and leaves confirmed daily scores unchanged',async({page})=>{
 let invalid=false;await page.route('**/exec',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',ledger})}));
 await page.route('**/gold-annotations-public.json*',route=>{const n=fixture();if(invalid)n.batches[0].applyToBalance=true;return route.fulfill({contentType:'application/json',body:JSON.stringify(n)});});
 await page.goto(base+'gold-medal.html');await expect(page.locator('#goldNotesBatches tbody tr')).toHaveCount(2);
 invalid=true;await page.locator('#refreshButton').click();await expect(page.locator('#goldNotesStatus')).toHaveClass(/error/);await expect(page.locator('#goldNotesBatches tbody tr')).toHaveCount(0);
 await expect(page.locator('#viewerBody tr')).toHaveCount(2);await expect(page.locator('#viewerSummary .summary-card').first()).toContainText('17');
 invalid=false;await page.locator('#refreshButton').click();await expect(page.locator('#goldNotesBatches tbody tr')).toHaveCount(2);await expect(page.locator('#viewerSummary .summary-card').first()).toContainText('17');
});
