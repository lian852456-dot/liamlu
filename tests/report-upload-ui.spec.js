'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const PAGE = path.resolve(__dirname, '../gas/ReportUpload.html');
const DIFF_CORE = fs.readFileSync(path.resolve(__dirname, '../threec-price-diff-core.js'), 'utf8');

function fixtureHtml() {
  let html = fs.readFileSync(PAGE, 'utf8');
  html = html.replace(/<script><\?!= reportUploadInclude_\('ReportUploadSheetJs'\); \?><\/script>/, '<script></script>');
  html = html.replace(/<script><\?!= reportUploadInclude_\('ReportUploadTradeInCore'\); \?><\/script>/, '<script>window.TradeInImportCore={parseFile:async()=>({}),buildPublishSnapshot:()=>({kind:"shopping",source_version_date:"2026-10-01",source_file_name:"prices.xlsx",source_file_sha256:"b".repeat(64),row_count:1,excluded_no_price_count:0,rows:[{source_sheet:"iPhone",source_row_number:2,brand:"Apple",model:"iPhone 16 256GB",colorless_model:"iPhone 16 256GB",retail_price:"29,900",project_prices:{"合約24期":"1,299"}}]})};window.XLSX={};</script>');
  html = html.replace(/<script><\?!= reportUploadInclude_\('ReportUploadThreecDiffCore'\); \?><\/script>/, `<script>${DIFF_CORE}</script>`);
  const bridge = `<script>
    window.__calls=[];
    const snapshot={kind:'shopping',source_version_date:'2026-10-01',source_file_sha256:'${'b'.repeat(64)}',row_count:1,rows:[{source_sheet:'iPhone',source_row_number:2,brand:'Apple',model:'iPhone 16 256GB',colorless_model:'iPhone 16 256GB',retail_price:'29,900',project_prices:{'合約24期':'1,299'}}]};
    const diff={kind:'shopping',counts:{added:1,changed:1,unchanged:1,removed:0},addedCount:1,changedCount:1,unchangedCount:1,removedCount:0,changeCount:2,offset:0,limit:100,hasMore:false,changes:[{status:'changed',model:'iPhone 16 256GB',modelCapacity:'iPhone 16 256GB',condition:'合約24期',plan:'合約24期',before:{kind:'number',display:'1,299 元'},after:{kind:'zero',display:'0 元'}},{status:'added',model:'iPhone 16 256GB',modelCapacity:'iPhone 16 256GB',condition:'新合約',plan:'新合約',provider:'FutureDial（FDI）',grade:'A',before:null,after:{kind:'number',display:'999 元'}}]};
    const answer=(name,payload)=>{window.__calls.push({name,payload});if(name==='report_upload_log')return {status:'ok',entries:[],live:{kpi:null}};if(name==='threec_status')return {status:'ok',registry:{shopping:{active:{snapshot_hash:'base-hash',source_version_date:'2026-09-30',row_count:1},previous:null},tradein:{active:null,previous:null}}};if(name==='report_award_pair_recover_latest')return {ok:false};if(name==='threec_diff_preview')return {status:'ok',basis:{snapshot_hash:'base-hash',date:'2026-09-30',source_sha:'a'.repeat(64)},registry:{shopping:{active:{snapshot_hash:'base-hash'}}},changeSet:diff,updateCheck:{ok:true}};if(name==='threec_publish')return {status:'published',registry:{shopping:{active:{snapshot_hash:'new-hash'}}},changeSet:diff,updateCheck:{ok:true}};if(name==='threec_readback')return {status:'ok',snapshot};return {status:'ok'};};
    const target={withSuccessHandler(fn){target.success=fn;return run;},withFailureHandler(fn){target.failure=fn;return run;},success:null,failure:null};let run;
    run=new Proxy(target,{get(obj,prop){if(prop in obj)return obj[prop];return payload=>{setTimeout(()=>{try{if(obj.success)obj.success(answer(prop,payload));}catch(error){if(obj.failure)obj.failure(error);}},0);return run;};}});
    window.google={script:{run}};
  </script>`;
  return html.replace('<body>', '<body>' + bridge);
}

test('3C 上傳預覽顯示完整條件差異，發布帶 active guard 且 active 變動會阻擋', async ({ page }) => {
  await page.setContent(fixtureHtml(), { waitUntil: 'domcontentloaded' });
  await page.locator('#employeeId').fill('EMPTEST');
  await page.locator('#adminSecret').fill('secret');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#app')).toBeVisible();
  await page.locator('#shoppingFile').setInputFiles({ name:'prices.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from('fixture') });
  await page.locator('#shoppingPreviewBtn').click();
  await expect(page.locator('#threecDiffPanel')).toBeVisible();
  await expect(page.locator('#threecDiffPanel')).toContainText('完整條件差異比對');
  await expect(page.locator('#threecDiffPanel')).toContainText('調價（筆報價條件）');
  await expect(page.locator('#threecDiffPanel')).toContainText('合約24期');
  await expect(page.locator('#threecDiffPanel')).toContainText('FutureDial（FDI）');
  await page.locator('#threecConfirm').check();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#threecPublishBtn').click();
  await expect.poll(async () => page.evaluate(() => window.__calls.filter(call => call.name === 'threec_publish').map(call => call.payload)[0])).toEqual(expect.objectContaining({ expectedActiveHash:'base-hash', requiresDiffCheck:true }));
  await expect(page.locator('#threecMessage')).toContainText('私有快照已發布');
  await page.locator('#threecDiffSearch').fill('FutureDial');
  await expect.poll(async () => page.evaluate(() => window.__calls.filter(call => call.name === 'threec_changes_read').length)).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.__calls.filter(call => call.name === 'threec_changes_read').some(call => call.payload.search === 'FutureDial'))).toBe(true);
});

test('上傳預覽若正式 active 已變動，確認發布鍵維持停用', async ({ page }) => {
  let html = fixtureHtml().replace("updateCheck:{ok:true}", "updateCheck:{blocked:true,status:'blocked'}");
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.locator('#employeeId').fill('EMPTEST');
  await page.locator('#adminSecret').fill('secret');
  await page.locator('#loginBtn').click();
  await page.locator('#shoppingFile').setInputFiles({ name:'prices.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:Buffer.from('fixture') });
  await page.locator('#shoppingPreviewBtn').click();
  await page.locator('#threecConfirm').check();
  await expect(page.locator('#threecPublishBtn')).toBeDisabled();
  await expect(page.locator('#threecDiffBasis')).toContainText('目前 active 已變動');
});
