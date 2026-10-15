'use strict';
const {test,expect}=require('@playwright/test'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const width of [390,1280])test('portable '+width+'px bundled colors use exact two-provider prices and remain isolated',async({page},info)=>{
 const out=info.outputPath('public-bundle');execFileSync(process.execPath,[path.join(root,'scripts/build-tradein-share.mjs'),out],{cwd:root});
 const rows=['午夜','星光','紅','藍'].map(color=>({source_sheet:'合成回收表',brand:'APPLE',model:'APPLE 合成機_128G-('+color+')(5G)',quotes:{'點子行動':{S:null,A:1000,B:800,C:0},'FutureDial（FDI）':{S:1100,A:900,B:400,C:null}}}));rows[3].quotes['FutureDial（FDI）'].A=901;
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
 await page.route('https://**/*',route=>{const request=JSON.parse(route.request().postData());calls.push(request);return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({status:'ok',snapshot:{kind:'tradein',source_version_date:'2026-10-01',row_count:4,rows}})});});
 await page.goto('file://'+path.join(out,'index.html'));await expect(page.locator('.tc-item')).toHaveCount(2);await expect(page.locator('#sourceMeta')).toContainText('4 筆');
 await page.locator('#provider').selectOption('FutureDial（FDI）');await page.locator('#grade').selectOption('A');await expect(page.locator('.tc-number')).toHaveText(['900','901']);
 await page.locator('#keyword').fill('紅');await expect(page.locator('.tc-item')).toHaveCount(1);await expect(page.locator('.tc-number')).toHaveText('900');
 await expect(page.locator('a,input[type=password]')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#results').screenshot({path:info.outputPath('SYNTHETIC-portable-colors-'+width+'.png')});
 expect(calls).toEqual([{action:'threec_snapshot_read',kind:'tradein',includeChanges:false}]);expect(errors).toEqual([]);
});
