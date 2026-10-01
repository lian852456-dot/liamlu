const {test,expect}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
let server,base;
test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const rel=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
    const file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{await new Promise(r=>server.close(r));});
test('October fill, zero/blank serialization, refill, and September history use their own groups',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-10-01T09:00:00Z'));
  await page.route('https://script.google.com/**',route=>{
    const url=new URL(route.request().url()),cb=url.searchParams.get('callback');
    const body={status:'ok',data:{},entries:[]};
    return route.fulfill({contentType:cb?'text/javascript':'application/json',body:cb?cb+'('+JSON.stringify(body)+')':JSON.stringify(body)});
  });
  await page.goto(base+'/index.html');
  await expect(page.locator('#fillDate')).toHaveValue('2026-10-01');
  await page.locator('.store-card[data-store="通化"]').click();
  await expect(page.locator('#awardModelsV1Grid input')).toHaveCount(10);
  await expect(page.locator('#awardModelsV1Grid')).toContainText('Z Fold8 Ultra／Z Fold8／Z Flip8');
  await expect(page.locator('#awardModelsV1Grid')).toContainText('vivo V80 Lite');
  await expect(page.locator('#awardModelsV1Grid')).toContainText('OPPO A7 Pro');
  await expect(page.locator('#awardModelsV1Grid')).not.toContainText('V70');
  await page.locator('#f_award_zfold8-family').fill('0');
  await page.locator('#f_award_s26-ultra').fill('2');
  const data=await page.evaluate(()=>getAwardModelsFormData());
  expect(Object.keys(data)).toHaveLength(10);
  expect(data['zfold8-family']).toBe(0);expect(data['s26-ultra']).toBe(2);expect(data['vivo-v80-lite']).toBe(null);
  await page.evaluate(data=>setAwardModelsFormData(data),data);
  await expect(page.locator('#f_award_zfold8-family')).toHaveValue('0');
  await expect(page.locator('#f_award_s26-ultra')).toHaveValue('2');
  await expect(page.locator('#f_award_vivo-v80-lite')).toHaveValue('');
  await page.locator('#fillDate').fill('2026-09-30');await page.locator('#fillDate').dispatchEvent('change');
  await expect(page.locator('#awardModelsV1Grid input')).toHaveCount(10);
  await expect(page.locator('#awardModelsV1Grid')).toContainText('vivo V70 FE');
  await expect(page.locator('#awardModelsV1Grid')).not.toContainText('V80 Lite');
  await page.locator('#fillDate').fill('2026-08-31');await page.locator('#fillDate').dispatchEvent('change');
  await expect(page.locator('#awardModelsV1Grid input')).toHaveCount(13);
});

