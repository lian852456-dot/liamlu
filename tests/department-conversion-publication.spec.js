const {test,expect}=require('@playwright/test');
const B=require('../readonly-dashboard-core.js'),O=require('../north12-officer-core.js'),P=require('../conversion-publication-core.js');
const {fixture}=require('./helpers/readonly-conversion-runtime.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8875/';
function publication(){
 const b=B.validateConversion(fixture()),stores=[...b.stores],records=[...b.records];
 for(const [i,region] of ['北一二A','北一二C','北一二D'].entries()){
  const id='DNB2000'+i;stores.push({id,region,name:'合成'+region,short:region});
  records.push(...b.records.filter(r=>r.store===b.stores[0].id).map(r=>({...r,store:id})));
 }
 return P.fromOfficer(O.validate({...b,schema:O.SCHEMA,stores,records}));
}
test('protected reader renders sandboxed weekly report and clears on failed refresh',async({page})=>{
 let fail=false;const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/Content Security Policy|Refused to execute/.test(m.text()))errors.push(m.text());});
 await page.route('https://script.google.com/**',async route=>{
  const input=route.request().postDataJSON();
  expect(input.action).toBe('readonly_conversion_department_read');
  await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(fail?{status:'error',message:'synthetic denied'}:{status:'ok',live:{revision:1},publication:publication()})});
 });
 await page.goto(base+'department-conversion.html');
 await page.locator('#employee').fill('SYN001');await page.locator('#secret').fill('synthetic');await page.locator('#login').click();
 await expect(page.locator('#coverage')).toContainText('北一二D');
 await expect(page.locator('#message')).toContainText('已讀回正式來源');
 const frame=page.frameLocator('#report');
 await expect(frame.locator('svg').first()).toBeVisible();
 await expect(frame.locator('body')).toContainText('北一處均值來源尚未納入');
 expect(await frame.locator('input[type=file]').count()).toBe(0);
 expect(errors).toEqual([]);
 fail=true;await page.locator('#refresh').click();
 await expect(page.locator('#auth')).toBeVisible();await expect(page.locator('#report')).toHaveAttribute('srcdoc','');
 await expect(page.locator('#coverage')).toBeEmpty();
});
