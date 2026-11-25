const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');

test('homepage reads only on a verified question and clears a late answer on logout',async({page})=>{
  const origin='https://nori.test',root=path.resolve(__dirname,'..');
  const calls=[],errors=[];
  const expiresAt=Date.now()+20*60000;
  const proof={status:'ok',trustSource:'password-bound',profile:{role:'employee',isTrusted:false}};
  let release,hold=false;
  const bundle={trustSource:'password-bound',expiresAt,phoneEligible:false,
    privateResult:{...proof,snapshot:{}},kpiResult:{...proof,data:{items:[],
      meta:{month:'2026-11',snapshotDay:24,sourceFile:'1125.xlsx'},
      stores:[{code:'TEST',name:'台北通化',official:.97}],persons:[{store:'TEST',pname:'測＊甲',official:1.1234}]}}};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin){
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep) || !fs.existsSync(file))return route.abort();
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
      return route.fulfill({contentType:types[path.extname(file)] || 'application/octet-stream',body:fs.readFileSync(file)});
    }
    if(url.hostname!=='script.google.com')return route.abort();
    const {action}=route.request().postDataJSON();
    calls.push(action);
    const results={employee_status:{enabled:true,passwordAvailable:true},
      employee_login:{trustSource:'password-bound',expiresAt,token:'B1_a_'+'a'.repeat(64)},
      employee_session:{trustSource:'password-bound',expiresAt,phoneEligible:false},employee_dashboard_read:bundle};
    if(action==='employee_dashboard_read' && hold)await new Promise(resolve=>{release=resolve;});
    await route.fulfill({json:{status:'ok',...results[action]}}).catch(()=>{});
  });
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(origin+'/home.html#ask-nori');
  const answer=page.locator('#nori-answer');
  async function ask(question){await page.locator('#nori-question').fill(question);await page.locator('#nori-question').press('Enter');}
  await ask('督導面談紀錄在哪裡');
  await expect(answer).toContainText('情報站');
  await ask('測試甲今天KPI達成？');
  await expect(answer).toContainText('首頁用員編');
  await page.getByText('前往首頁登入',{exact:true}).click();
  await page.locator('[data-b-employee]').fill('SYNTHETIC');
  await page.locator('[data-b-password]').fill('SYNTHETIC');
  await page.locator('[data-b-submit]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  expect(calls).not.toContain('employee_dashboard_read');
  await page.locator('#ask-nori').click();
  await ask('測試甲今天KPI達成？');
  await expect(answer).toContainText('112.34%');
  await expect(answer).toContainText('2026-11-24');
  await ask('個人KPI達成率');
  await expect(answer).toContainText('想查哪位');
  await ask('測試甲');
  await expect(answer).toContainText('112.34%');
  hold=true;
  await ask('測試甲今天KPI達成？');
  await expect.poll(()=>Boolean(release)).toBe(true);
  await page.locator('#nori-close').click();
  await page.locator('summary').filter({hasText:'登入與資料更新選項'}).evaluate(el=>el.parentElement.open=true);
  await page.locator('[data-b-logout]').click();
  release();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');
  await expect(answer).not.toContainText('112.34');
  expect(errors).toEqual([]);
});
