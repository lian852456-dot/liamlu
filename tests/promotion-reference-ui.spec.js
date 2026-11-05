const {test,expect}=require('@playwright/test');const path=require('node:path'),fs=require('node:fs');
const Core=require('../promotion-catalog-core.js');const quoteFixture=()=>({standard:{'機款主檔':[{'機款ID':'D1','系列':'測試手機','容量':'256G','品牌':'Test'}]},prices:{fields:['id','project','tariff','term','rent','price','retail'],dicts:[['D1'],['5G_XH(24)-新申裝/續約'],['999H'],[24],[999],[0],['原表未提供']],rows:[[0,0,0,0,0,0,0]]},priceSource:{file:'synthetic.xls',date:'2026-11-02'},recycle:{devices:[{sourceSheet:'測試表',brand:'Test',variants:[{rawModel:'測試手機 黑色 256G',items:[{vendor:'dianzi',grade:'A',price:0},{vendor:'fdi',grade:'S',price:100}]}]}],source:{date:'2026-11-01',file:'synthetic.xlsx'},sources:[{file:'synthetic.xlsx',date:'2026-11-01',validThrough:'2026-11-14'}]}});
const catalogFixture=()=>({schema:Core.SCHEMA,title:'合成活動資料',version:'synthetic',reviewDate:'2026-11-05',coverageNotes:['僅供測試'],sources:[{id:'S1',title:'合成來源',fileName:'synthetic.png',sha256:'a'.repeat(64),image:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDOsAAAAASUVORK5CYII='}],rows:[{id:'R1',type:'tradein',status:'new',brand:'Test',model:'測試手機 256G',start:'2026-11-01',end:'2026-11-30',sourceId:'S1',sourceRow:'測試列',band100:'unknown',channels:['DS','FS'],audience:'測試用戶',plans:'測試專案',codes:['QA'],notes:'最高額不相加 <script>bad()</script>',benefits:[{kind:'discount',amount:0,condition:'來源為0',codes:[]},{kind:'stacked_cap',amount:100,condition:'已含基本折價',codes:[]}]},{id:'R2',type:'return',status:'closed',brand:'Test',model:'已關閉機款',start:'2026-10-01',end:'2026-10-31',sourceId:'S1',sourceRow:'關閉列',band100:'unknown',channels:['DS','FS'],audience:'測試用戶',plans:'測試專案',codes:[],notes:'已關閉',benefits:[{kind:'discount',amount:200,condition:'已關閉',codes:[]}]}]});
async function setup(page,name='threec-query.html'){
 const requests=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/exec*',route=>{requests.push(route.request().url());const url=new URL(route.request().url()),body={status:'ok',snapshot:null};return url.searchParams.get('transport')==='iframe'?route.fulfill({contentType:'text/html',body:'<script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body})+',"*")</script>'}):route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('file://'+path.resolve(__dirname,'../'+name));return{requests,errors};
}
for(const name of ['threec-query.html','tradein-query.html'])test(name+' 本機參考匯入、來源切換與異動隔離',async({page})=>{
 const {requests,errors}=await setup(page,name);await page.locator('#quoteReference summary').click();const html='<script>throw Error("must not execute")</script><script id="DATA" type="application/json">'+JSON.stringify(quoteFixture())+'</script>';
 await page.locator('#quoteReference input').setInputFiles({name:'synthetic.html',mimeType:'text/html',buffer:Buffer.from(html)});
 await expect(page.locator('#queryStatus')).toContainText('目前查詢本機參考檔');
 if(name.startsWith('threec'))await expect(page.locator('#shoppingResults')).toContainText('0 元');else await expect(page.locator('[data-tref=quotes]')).toContainText('待確認（來源為0）');
 await expect(page.locator(name.startsWith('threec')?'#shoppingMeta':'#tradeinMeta')).toContainText('參考檔來源日期');
 const before=requests.length;await page.locator('#changeSearch').fill('local');await page.waitForTimeout(450);expect(requests.length).toBe(before);
 await expect(page.locator('#changeJsonBtn')).toBeDisabled();expect(errors).toEqual([]);
 await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('尚未發布正式資料');
});
test('手機活動篩選、關閉顯示、原圖與壞檔清除；不寫瀏覽器儲存',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {errors}=await setup(page);await page.locator('#promotionCatalog summary').first().click();
 await page.locator('[data-promo=file]').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(catalogFixture()))});
 await expect(page.locator('[data-promo=count]')).toContainText('符合 1 筆');await expect(page.locator('[data-promo=results]')).toContainText('NT$ 0');await expect(page.locator('[data-promo=results]')).toContainText('疊加後最高折價');
 await page.locator('[data-promo=channel]').selectOption('CS');await expect(page.locator('[data-promo=count]')).toContainText('符合 0 筆');await page.locator('[data-promo=channel]').selectOption('DS');
 await page.locator('[data-promo=inactive]').check();await expect(page.locator('[data-promo=count]')).toContainText('符合 2 筆');
 await page.locator('[data-promo=search]').fill('256G');await page.locator('[data-source]').first().click();await expect(page.locator('[data-promo=dialog]')).toBeVisible();await expect(page.locator('[data-promo=image]')).toHaveJSProperty('naturalWidth',1);await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.evaluate(()=>[...Object.keys(localStorage),...Object.keys(sessionStorage)].some(k=>/promotion|catalog|quote/i.test(k)))).toBe(false);
 await page.locator('[data-promo=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.locator('[data-promo=message]')).toContainText('未載入');await expect(page.locator('[data-promo=content]')).toBeHidden();expect(errors).toEqual([]);
});
test('分頁後完整展開與返回頁面清除活動',async({page})=>{
 await setup(page);await page.locator('#promotionCatalog summary').first().click();const x=catalogFixture();x.rows=Array.from({length:25},(_,i)=>({...x.rows[0],id:'QA'+i,model:'測試機'+i}));
 await page.locator('[data-promo=file]').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(x))});await expect(page.locator('.promo-card')).toHaveCount(12);await page.locator('[data-promo=more]').click();await expect(page.locator('.promo-card')).toHaveCount(24);await page.locator('[data-promo=more]').click();await expect(page.locator('.promo-card')).toHaveCount(25);await expect(page.locator('[data-promo=more]')).toBeHidden();
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));await expect(page.locator('[data-promo=content]')).toBeHidden();await expect(page.locator('[data-promo=results]')).toBeEmpty();
});
for(const kind of ['手機價格','舊換新'])test('私有驗收版 '+kind+' 真實來源、零外連與窄屏',{tag:'@private'},async({page})=>{
 test.skip(!process.env.PRIVATE_PREVIEW_DIR);await page.setViewportSize({width:390,height:844});const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,route=>{external.push(route.request().url());route.abort();});
 await page.goto('file://'+path.join(process.env.PRIVATE_PREVIEW_DIR,'11月'+kind+'_私有驗收版.html'));
 await expect(page.locator('#queryStatus')).toContainText('本機參考',{timeout:15000});await expect(page.locator('[data-promo=message]')).toContainText('13 張來源、109 筆活動');
 await expect(page.locator(kind==='手機價格'?'#shoppingResults':'[data-tref=table]')).not.toBeEmpty();
 if(kind==='手機價格'){await page.locator('.query-extra-filters>summary').click();await page.locator('.filter-details summary').click();await page.locator('#shoppingSearch').fill('vivo V80');await expect(page.locator('#shoppingResults')).toContainText('vivo V80');await page.locator('#shoppingRent').selectOption('1399');await page.locator('#shoppingTerm').selectOption('48');await expect(page.locator('#shoppingResults')).not.toContainText('沒有符合');}
 else{await expect(page.locator('#queryStatus')).toContainText('2026-11-14');await expect(page.locator('#queryStatus')).toContainText('2026-11-30');await page.locator('[data-tref=search]').fill('iPhone 13 mini');await expect(page.locator('[data-tref=quotes]')).toContainText('FDI');}
 await page.locator('#queryCard').evaluate(el=>el.scrollIntoView());await page.screenshot({path:path.resolve(process.env.PRIVATE_PREVIEW_DIR,'../evidence/private-'+kind+'-prices-mobile.png'),fullPage:false});await page.locator('#promotionCatalog summary').first().click();await page.locator('[data-promo=type]').selectOption('tradein');await page.locator('[data-promo=search]').fill('SONY Xperia 1 VIII');await expect(page.locator('.promo-card')).toHaveCount(2);await expect(page.locator('[data-promo=results]')).toContainText('5,000');await expect(page.locator('[data-promo=results]')).toContainText('7,000');
 await page.locator('[data-source]').first().click();await expect(page.locator('[data-promo=image]')).toHaveJSProperty('naturalWidth',1600);await page.locator('[data-promo=close]').click();
  await page.locator('[data-promo=search]').fill('');await page.locator('[data-promo=type]').selectOption('tst');await page.locator('[data-promo=date]').fill('2026-10-31');await expect(page.locator('.promo-card')).toHaveCount(0);await page.locator('[data-promo=date]').fill('2026-11-05');await expect(page.locator('.promo-card')).toHaveCount(1);
 expect(external).toEqual([]);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#promotionCatalog').evaluate(el=>el.scrollIntoView());await page.screenshot({path:path.resolve(process.env.PRIVATE_PREVIEW_DIR,'../evidence/private-'+kind+'-mobile.png'),fullPage:false});
});
test('整合驗收檔在同一頁切換售價、回收價及活動，保留來源且不外連',{tag:'@private'},async({page})=>{
 test.skip(!process.env.PRIVATE_PREVIEW_DIR);const external=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>{external.push(r.request().url());r.abort();});
 await page.goto('file://'+path.join(process.env.PRIVATE_PREVIEW_DIR,'11月價格與舊換新_整合驗收版.html'));
 await expect(page.locator('#queryStatus')).toContainText('本機參考');await page.locator('#shoppingSearch').fill('vivo V80');await expect(page.locator('#shoppingResults')).toContainText('vivo V80');
 await page.locator('#tradeinTab').click();await page.locator('[data-tref=search]').fill('iPhone 13 mini');await expect(page.locator('[data-tref=quotes]')).toContainText('FDI');
 await page.locator('#promotionCatalog summary').first().click();await page.locator('[data-promo=current]').click();await expect(page.locator('[data-promo=search]')).toHaveValue('iPhone 13 mini');
 await page.locator('#promotionCatalog summary').first().click();await page.locator('#shoppingTab').click();await expect(page.locator('#shoppingSearch')).toHaveValue('vivo V80');expect(external).toEqual([]);expect(errors).toEqual([]);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.resolve(process.env.PRIVATE_PREVIEW_DIR,'../evidence/combined-desktop.png'),fullPage:false});
});
