const { test, expect } = require('@playwright/test');
const path = require('node:path');

const FORMAL_FILE_URL = process.env.LIAM_APP_BASE_URL || `file://${path.resolve(__dirname, '../app.html')}`;
const FILE_URL = `${FORMAL_FILE_URL}${FORMAL_FILE_URL.includes('?')?'&':'?'}preview=1`;

test.use({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });

test('formal mode boots without Preview data or JavaScript errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(FORMAL_FILE_URL);
  await expect(page.locator('#dataMode')).toHaveText('解鎖正式資料');
  await expect(page.locator('#previewBanner')).toBeHidden();
  await expect(page.locator('#viewerState')).toHaveText('未登入');
  await expect(page.locator('#kpiHero')).toContainText('解鎖正式資料');
  expect(errors).toEqual([]);
});

test('390x844 home gives the supervisor summary without horizontal overflow', async ({ page }) => {
  let formalRequests = 0;
  await page.route('https://script.google.com/**', route => { formalRequests += 1; return route.abort(); });
  await page.goto(FILE_URL);
  await expect(page).toHaveTitle('Liam Supervisor App 1.2');
  await expect(page.locator('#dataMode')).toHaveText('Preview／示意資料');
  await expect(page.locator('#previewBanner')).toContainText('非正式營運數據');
  await expect(page.locator('#operationsRows')).toContainText('16:00');
  await expect(page.locator('#operationsRows')).toContainText('21:00');
  await expect(page.locator('#kpiHero')).toContainText('113.1%');
  await expect(page.locator('.store-item')).toHaveCount(9);
  await expect(page.locator('#awardHome .award-row:not(.header)')).toHaveCount(9);
  await expect(page.locator('#awardHome')).not.toContainText('Top 1');
  await expect(page.locator('#awardHome')).not.toContainText('Top 2');
  await expect(page.locator('#awardHome')).not.toContainText('區領獎總額');
  const kpiValues = await page.locator('.store-row .store-metric b').allTextContents();
  expect(kpiValues.every(value => value && !value.includes('...'))).toBe(true);
  const rowHeights = await page.locator('.store-row').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  expect(rowHeights.every(height => height >= 44)).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(formalRequests).toBe(0);
});

test('store rows, battle modes, report rows, schedule and patrol dashboard are interactive', async ({ page }) => {
  await page.goto(FILE_URL);
  const secondStore = page.locator('.store-item').nth(1);
  await secondStore.locator('.store-row').click();
  await expect(secondStore).toHaveClass(/expanded/);
  await expect(secondStore.locator('.core-cell')).toHaveCount(6);

  await page.locator('.bottom-nav [data-nav="battle"]').click();
  await expect(page.locator('[data-view="battle"]')).toBeVisible();
  await expect(page.locator('#battleContent')).toContainText('九店比較');
  await page.locator('[data-battle-kind="award"]').click();
  await expect(page.locator('#battleContent .award-battle-row:not(.header)')).toHaveCount(9);
  await expect(page.locator('#battleContent')).not.toContainText('區領獎總額');
  await expect(page.locator('#battleContent')).not.toContainText('Top 1');
  await page.locator('[data-battle-scope="store"]').click();
  await expect(page.locator('#battleStorePicker')).toBeVisible();
  await expect(page.locator('#battleContent')).toContainText('店領獎金額');
  await expect(page.locator('#battleContent')).toContainText('指定機款');
  await expect(page.locator('#battleContent .award-store-item')).toHaveCount(3);
  await expect(page.locator('#battleContent')).toContainText('通化 指定機款 A');
  await page.locator('#battleStoreSelect').selectOption('酒泉');
  await expect(page.locator('#battleContent .award-selected-store')).toContainText('酒泉');
  await expect(page.locator('#battleContent')).toContainText('酒泉 指定機款 C');
  await expect(page.locator('#battleContent')).not.toContainText('通化 指定機款 A');
  const awardStoreOptions=await page.locator('#battleStoreSelect option').allTextContents();
  expect(awardStoreOptions).toHaveLength(9);
  for (const store of awardStoreOptions) {
    await page.locator('#battleStoreSelect').selectOption({ label:store });
    await expect(page.locator('#battleContent .award-selected-store')).toContainText(store);
    await expect(page.locator('#battleContent')).toContainText(`${store} 指定機款 A`);
  }

  await page.locator('[data-battle-kind="personal"]').click();
  await page.locator('[data-battle-scope="region"]').click();
  await expect(page.locator('#battleContent')).toContainText('總人數');
  await expect(page.locator('#battleContent')).toContainText('AQ需關注店長');
  await expect(page.locator('#battleContent .personal-performance-item')).toHaveCount(3);
  await expect(page.locator('#battleContent')).toContainText('店長店績');
  await expect(page.locator('#battleContent .personal-performance-button')).toHaveCount(0);
  await expect(page.locator('#battleContent')).not.toContainText('1326');
  await page.locator('#personalRoleSelect').selectOption('副店');
  const firstPerson=page.locator('#battleContent .personal-performance-item').first();
  await firstPerson.locator('.personal-performance-button').click();
  await expect(firstPerson).toHaveClass(/expanded/);
  await expect(firstPerson.locator('.personal-metric-grid article')).toHaveCount(10);
  await expect(page.locator('#battleContent')).toContainText('AQ 店長關注明細');

  await page.locator('.bottom-nav [data-nav="report"]').click();
  await expect(page.locator('#reportOperations')).toContainText('A999 上線數');
  await expect(page.locator('#reportOperations')).toContainText('12');
  await expect(page.locator('#reportOperations')).toContainText('保險搭售率');
  await expect(page.locator('#reportFeedbackSummary .report-feedback-card')).toHaveCount(1);
  await expect(page.locator('#reportFeedbackSummary')).toContainText('大稻埕');
  await expect(page.locator('#reportFeedbackSummary')).toContainText('16:00 示意零報原因');
  await expect(page.locator('#reportFeedbackSummary')).not.toContainText('21:00 示意零報原因');
  await page.locator('[data-report-segment="21"]').click();
  await expect(page.locator('#reportOverview')).toContainText('5/9');
  await expect(page.locator('#reportOperations')).toContainText('19');
  await expect(page.locator('#reportFeedbackSummary .report-feedback-card')).toHaveCount(1);
  await expect(page.locator('#reportFeedbackSummary')).toContainText('通化');
  await expect(page.locator('#reportFeedbackSummary')).toContainText('21:00 示意零報原因');
  await expect(page.locator('#reportFeedbackSummary')).not.toContainText('16:00 示意零報原因');
  const feedbackReportStore = page.locator('.report-store').filter({hasText:'通化'});
  await feedbackReportStore.locator('.report-store-button').click();
  await expect(feedbackReportStore).toHaveClass(/expanded/);
  await expect(feedbackReportStore.locator('.report-store-feedback')).toContainText('門市回覆');
  await expect(feedbackReportStore.locator('.report-store-feedback')).toContainText('零報原因');
  const emptyFeedbackStore=page.locator('.report-store').filter({has:page.locator('.report-store-button span:first-child', {hasText:'酒泉'})});
  await emptyFeedbackStore.locator('.report-store-button').click();
  await expect(emptyFeedbackStore.locator('.report-store-feedback')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await page.locator('.bottom-nav [data-nav="schedule"]').click();
  await expect(page.locator('[data-view="schedule"]')).toBeVisible();
  await page.locator('#scheduleDate').fill('2026-08-10');
  await page.locator('#scheduleDate').dispatchEvent('change');
  await expect(page.locator('#scheduleList .schedule-store')).toHaveCount(9);
  await expect(page.locator('[data-profile-entry]')).toBeVisible();

  await page.locator('.bottom-nav [data-nav="patrol"]').click();
  await expect(page.locator('[data-view="patrol"]')).toBeVisible();
  await expect(page.locator('#patrolOverview')).toContainText('本月已巡店數');
  await expect(page.locator('#patrolOverview')).toContainText('6');
  await expect(page.locator('#patrolTodayDetail')).toContainText('下一站');
  await expect(page.locator('#patrolOverview')).toContainText('題 18 雙月全盤進度');
  await expect(page.locator('#patrolOverview')).toContainText('題 14–17 每月盤點');
  await expect(page.locator('#patrolOverview')).toContainText('本月各店巡店次數');
  await expect(page.locator('#patrolRecentList .recent-row')).toHaveCount(3);
  const patrolOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(patrolOverflow).toBeLessThanOrEqual(0);
  await page.screenshot({path:'test-output/liam-supervisor-patrol-minimal-390x844.png',fullPage:true});
});

test('isolated patrol visit flow records arrival and departure with one protected POST per tap', async ({ page }) => {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const events=[
    {serverTime:'2026-08-11T14:57:50+08:00',date:'2026-08-11',action:'arrival',store:'台北通化',note:'DEPLOY_TEST_20260811T145733',visitSessionId:'deploy-test'},
    {serverTime:'2026-08-11T14:57:53+08:00',date:'2026-08-11',action:'departure',store:'台北通化',note:'DEPLOY_TEST_20260811T145733',visitSessionId:'deploy-test'}
  ]; let writes=0; const submittedStores=[];
  await page.addInitScript(()=>sessionStorage.setItem('bei12b_pt_session_token','short-session-token'));
  await page.route('https://script.google.com/**',async route=>{
    const request=route.request();
    if(request.method()==='POST') {
      const payload=JSON.parse(request.postData()||'{}');
      if(payload.action==='ptauth') return route.fulfill({json:{status:'ok',token:'short-session-token'}});
      if(payload.action==='ptvisit_write') {
        writes+=1; submittedStores.push(payload.store);
        const event={serverTime:`${today}T${writes===1?'09:12:00':'10:35:00'}+08:00`,date:today,action:payload.visitAction,store:`台北${payload.store.replace(/^台北/,'')}`,note:payload.note,visitSessionId:'visit-1'};
        events.push(event);
        return route.fulfill({json:{status:'ok',event,events,openVisit:payload.visitAction==='arrival'?event:null}});
      }
    }
    const action=new URL(request.url()).searchParams.get('action');
    if(action==='sread') return route.fulfill({json:{status:'ok',schedule:{month:'2026-08',stores:[]}}});
    if(action==='ptread') return route.fulfill({json:{status:'ok',stores:['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'].map(name=>({name})),rows:[]}});
    if(action==='ptvisit_read') return route.fulfill({json:{status:'ok',events}});
    return route.fulfill({json:{status:'error',message:'unexpected action'}});
  });
  await page.goto(FORMAL_FILE_URL+'#patrol');
  await expect(page.locator('#patrolArrivalButton')).toBeEnabled();
  await expect(page.locator('#patrolVisitToday .patrol-visit-event')).toHaveCount(0);
  await page.locator('#patrolArrivalButton').click();
  await expect(page.locator('#patrolVisitStore')).toHaveValue('');
  await expect(page.locator('#patrolVisitSubmit')).toBeDisabled();
  expect(await page.locator('#patrolVisitStore').evaluate(select=>select.checkValidity())).toBe(false);
  expect(writes).toBe(0);
  const storeOptions=await page.locator('#patrolVisitStore option').allTextContents();
  expect(storeOptions).toEqual(['請選擇店點','通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.locator('#patrolVisitSubmit').evaluate(button=>button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.locator('#patrolVisitStore').selectOption('酒泉');
  await expect(page.locator('#patrolVisitSubmit')).toBeEnabled();
  await page.locator('#patrolVisitNote').fill('例行巡店');
  await page.locator('#patrolVisitSubmit').dblclick();
  await expect(page.locator('#patrolVisitToday .patrol-visit-event')).toHaveCount(1);
  await expect(page.locator('#patrolVisitMessage')).toContainText('09:12 到店｜酒泉');
  expect(writes).toBe(1);
  await expect(page.locator('#patrolDepartureButton')).toBeEnabled();
  await page.locator('#patrolDepartureButton').click();
  await expect(page.locator('#patrolVisitCurrentStore')).toHaveText('目前在：酒泉');
  await expect(page.locator('#patrolVisitStore')).toHaveValue('酒泉');
  await page.locator('#patrolVisitSubmit').click();
  await expect(page.locator('#patrolVisitToday .patrol-visit-event')).toHaveCount(2);
  await expect(page.locator('#patrolVisitMessage')).toContainText('10:35 離店｜酒泉');
  expect(writes).toBe(2);
  expect(submittedStores).toEqual(['酒泉','酒泉']);
  const displayed=await page.locator('#patrolVisitToday .patrol-visit-event').allTextContents();
  expect(displayed.join('\n')).not.toContain('DEPLOY_TEST');
});

test('patrol visit UI fails closed when server response store differs from explicit selection', async ({ page }) => {
  await page.addInitScript(()=>sessionStorage.setItem('bei12b_pt_session_token','short-session-token'));
  await page.route('https://script.google.com/**',async route=>{
    const request=route.request();
    if(request.method()==='POST') {
      const payload=JSON.parse(request.postData()||'{}');
      if(payload.action==='ptauth') return route.fulfill({json:{status:'ok',token:'short-session-token'}});
      if(payload.action==='ptvisit_write') return route.fulfill({json:{status:'ok',event:{serverTime:'2026-08-11T12:00:00+08:00',date:'2026-08-11',action:'arrival',store:'台北通化',note:'',visitSessionId:'mismatch'}}});
    }
    const action=new URL(request.url()).searchParams.get('action');
    if(action==='sread') return route.fulfill({json:{status:'ok',schedule:{month:'2026-08',stores:[]}}});
    if(action==='ptread') return route.fulfill({json:{status:'ok',stores:['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'].map(name=>({name})),rows:[]}});
    if(action==='ptvisit_read') return route.fulfill({json:{status:'ok',events:[]}});
    return route.fulfill({json:{status:'error',message:'unexpected action'}});
  });
  await page.goto(FORMAL_FILE_URL+'#patrol');
  await expect(page.locator('#patrolArrivalButton')).toBeEnabled();
  await expect(page.locator('#patrolOverview')).toContainText('本月巡店大盤進度');
  await page.locator('#patrolArrivalButton').click();
  await expect(page.locator('#patrolVisitDialog')).toBeVisible();
  await page.locator('#patrolVisitStore').selectOption('酒泉');
  await page.locator('#patrolVisitSubmit').click();
  await expect(page.locator('#patrolVisitMessage')).toContainText('伺服器回傳店點與送出店點不一致');
  await expect(page.locator('#patrolVisitToday .patrol-visit-event')).toHaveCount(0);
});

test('formal unlock is explicit and does not load summaries before Approved Device succeeds', async ({ page }) => {
  const actions = [];
  await page.route('https://script.google.com/**', async route => {
    const payload = JSON.parse(route.request().postData() || '{}');
    actions.push(payload.action);
    await route.fulfill({ json:{ status:'error', message:'此員編尚未核准此裝置，請先「首次申請綁定」並等待督導核准' } });
  });
  await page.goto(FORMAL_FILE_URL);
  await page.locator('#dataMode').click();
  await expect(page.locator('[data-view="me"]')).toBeVisible();
  await page.locator('#employeeId').fill('TEST01');
  await page.locator('#privateAccessForm').getByRole('button').click();
  await expect(page.locator('#dataMode')).toHaveText('裝置待核准');
  await expect(page.locator('#privateDeviceStatus')).toHaveText('此 iPhone App 裝置待核准');
  await expect(page.locator('#privateAccessMessage')).toContainText('此 iPhone App 裝置待核准');
  expect(actions).toEqual(['private_access']);
  const stored = await page.evaluate(() => ({ employee:localStorage.getItem('north12b_private_dashboard_employee_id'), device:Boolean(localStorage.getItem('north12b_private_dashboard_device_id')) }));
  expect(stored).toEqual({ employee:'TEST01', device:true });
  await page.locator('#privateLogout').click();
  const afterLogout = await page.evaluate(() => ({ employee:localStorage.getItem('north12b_private_dashboard_employee_id'), device:Boolean(localStorage.getItem('north12b_private_dashboard_device_id')) }));
  expect(afterLogout).toEqual({ employee:null, device:true });
});

test('existing device request flow clears the activation code and reports pending', async ({ page }) => {
  let submittedCode = '';
  await page.route('https://script.google.com/**', async route => {
    const payload = JSON.parse(route.request().postData() || '{}');
    if (payload.action === 'private_request') {
      submittedCode = payload.bootstrapCode;
      await route.fulfill({ json:{ status:'ok', requestStatus:'pending' } });
      return;
    }
    await route.fulfill({ json:{ status:'ok', requestStatus:'pending' } });
  });
  await page.goto(FORMAL_FILE_URL + '#me');
  await page.locator('#employeeId').fill('TEST01');
  await page.locator('#privateBindingDetails').click();
  await page.locator('#bootstrapCode').fill('654321');
  await page.locator('#privateBindingForm').getByRole('button').click();
  await expect(page.locator('#bootstrapCode')).toHaveValue('');
  await expect(page.locator('#privateDeviceStatus')).toHaveText('此 iPhone App 裝置待核准');
  expect(submittedCode).toBe('654321');
  const storedValues = await page.evaluate(() => {
    const values = storage => Array.from({ length:storage.length }, (_,index) => storage.getItem(storage.key(index)));
    return [...values(localStorage), ...values(sessionStorage)];
  });
  expect(storedValues).not.toContain('654321');
});

test('patrol passcode exists only during submission and only the short token persists', async ({ page }) => {
  let submittedPasscode = '';
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      submittedPasscode = payload.key || '';
      await route.fulfill({ json:{ status:'ok', token:'short-lived-test-token' } });
      return;
    }
    const action = new URL(request.url()).searchParams.get('action');
    await route.fulfill({ json:action === 'sread' ? { status:'ok', schedule:{ month:'2026-08', stores:[] } } : { status:'ok', records:[] } });
  });
  await page.goto(FORMAL_FILE_URL + '#me');
  await page.locator('#patrolPasscode').fill('test-passcode');
  await page.locator('#patrolAccessForm').getByRole('button').click();
  await expect(page.locator('#patrolPasscode')).toHaveValue('');
  await expect(page.locator('#patrolAccessMessage')).toContainText('短效 session 已驗證');
  expect(submittedPasscode).toBe('test-passcode');
  const storage = await page.evaluate(() => {
    const values = target => Array.from({ length:target.length }, (_,index) => target.getItem(target.key(index)));
    return { local:values(localStorage), session:values(sessionStorage) };
  });
  expect(storage.local).not.toContain('test-passcode');
  expect(storage.session).not.toContain('test-passcode');
  expect(storage.session).toContain('short-lived-test-token');
});
