'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = Boolean(process.env.B_BASELINE_SHELL || process.env.B_BASELINE_CLIENT ||
  process.env.B_BASELINE_APP || process.env.B_BASELINE_HOME);
const B_SESSION = 'north12b_password_session_v1';
const B_CACHE = 'north12b_password_data_v1';
const EMPLOYEE = 'north12b_private_dashboard_employee_id';
const DEVICE = 'north12b_private_dashboard_device_id';
const DATE = '2026-09-11';
const SOURCE = 'loading-state.xlsx';
const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
const ORIGIN = 'https://loading-state.test';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

function sourcePath(envName, fallback) {
  return process.env[envName] ? path.resolve(process.env[envName]) : path.join(ROOT, fallback);
}

function fixtureUrl(name) {
  return ORIGIN+'/'+name;
}

function metric(rate = 0.9) { return { a: 1, t: 2, reportRate: rate }; }

function privateData() {
  const items = [{ key: 'A999', displayName: 'AQ V+D 999 (含)以上', category: '核心', order: 0 }];
  const stores = STORES.map((name, index) => ({
    code: `SYN-${index}`, name, official: 0.9,
    items: { 'AQ V+D 999 (含)以上': metric() }
  }));
  const persons = Array.from({ length: 15 }, (_, index) => ({
    pname: `同仁＊${index + 1}`, store: 'SYN-1', role: '副店', official: 0.9,
    items: {
      'TTL AQ上線點數': metric(), 'AQ V+D 999 (含)以上': metric(),
      'AQ V+D 1399 (含)以上': metric(), 'RT上線點數': metric(),
      'RT V+D 999 (含)以上': metric(), 'RT V+D 1399 (含)以上': metric(),
      '好速案銷售點數': metric(), '特殊維繫用戶續約數': metric(),
      '配件及其他營收': metric(), '包膜與保貼營收': metric()
    }
  }));
  return {
    meta: { month: '2026-09', snapshotDay: 11, sourceFile: SOURCE, updatedAt: '2026-09-11T08:00:00+08:00' },
    items, aggregateRates: { 'AQ V+D 999 (含)以上': 0.9 }, stores, persons
  };
}

function privateSnapshot() {
  const stores = STORES.map((store, index) => ({
    store, company_rank: index + 1, company_rank_dod: 0, overall_kpi: 0.9,
    overall_kpi_dod: 0, addon_score: 1, insurance_attach_rate: 0.5
  }));
  const personal = Array.from({ length: 15 }, (_, index) => ({
    store: '酒泉', role: '副店', name: `同仁＊${index + 1}`, rank: index + 1,
    overall_rate: 0.9, overall_rate_dod: 0, rank_dod: 0, metrics: {}
  }));
  return {
    kpiBattle: {
      report_date: DATE, data_as_of_date: DATE, source_as_of_date: DATE,
      source_file: SOURCE, generated_at: '2026-09-11T08:00:00+08:00', personal_semantics: 'individual-v1',
      aggregate: { overall_kpi: 0.9, company_rank: 1, company_rank_dod: 0, addon_score: 1, overall_kpi_dod: 0 },
      stores, personal
    },
    awardsBattle: {
      report_run_date: DATE, data_as_of_date: DATE, source_as_of_date: DATE,
      processing_run_id: '', supervisor: { actual_total: 100, rank: 1, award: 'Y' },
      overall: { award: { actual_total: 100, rank: 1, award: 'Y' }, items: [] },
      stores: STORES.map(store => ({ store, award: { actual_total: 10, award: 'Y' }, items: [] }))
    }
  };
}

const DATA = privateData();
const SNAPSHOT = privateSnapshot();
// The protected shell checks the authenticated profile role separately from
// the role filter rendered in the real App. Keep this synthetic profile in
// the employee contract while the data rows exercise the 副店 filter.
const PROFILE = { maskedName: '同仁＊1', store: '酒泉', role: 'employee', isTrusted: false };

async function apiFixture(context, { delay = 35, readDelay = 0 } = {}) {
  const calls = [];
  let responseDelay = delay;
  let revoked = false;
  let disabled = false;
  let serverExpired = false;
  let leaseExpiresAt = Date.now() + 25 * 60 * 1000;
  let phoneToken = '';
  await context.route(ORIGIN+'/**',route=>{
    const relative=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const sources={'GasBClient.js':'B_BASELINE_CLIENT','dashboard-b-shell.js':'B_BASELINE_SHELL','app.js':'B_BASELINE_APP','home.js':'B_BASELINE_HOME'};
    const file=sourcePath(sources[relative],relative);
    if(!file.startsWith(ROOT+path.sep) && !Object.values(sources).some(key=>process.env[key] && file===path.resolve(process.env[key])))return route.abort();
    if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
    const ext=path.extname(file),types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
    return route.fulfill({contentType:types[ext]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  await context.route('https://script.google.com/**', async route => {
    let payload = {};
    try { payload = route.request().postDataJSON() || {}; } catch {}
    const action = payload.action || '';
    const started = Date.now();
    calls.push({ action, started, payload });
    await new Promise(resolve => setTimeout(resolve, readDelay && ['employee_private_read','employee_kpi_read','employee_dashboard_read'].includes(action)?readDelay:responseDelay));
    let body = { status: 'ok' };
    if (action === 'employee_status') {
      body = disabled ? { status: 'error' } : { status: 'ok', enabled: true, passwordAvailable: true };
    } else if (action === 'employee_login') {
      leaseExpiresAt = Date.now() + 25 * 60 * 1000;
      body = { status: 'ok', token: 'B1_a_' + 'a'.repeat(64), expiresAt: leaseExpiresAt, trustSource: 'password-bound' };
    } else if (action === 'employee_phone_enroll') {
      phoneToken = 'BP1_' + 'b'.repeat(64);
      body = { status: 'ok', phoneToken, expiresAt: Date.now() + 89 * 86400000 };
    } else if (action === 'employee_phone_resume') {
      if (revoked || payload.phoneToken !== phoneToken) body = { status: 'error' };
      else {
        leaseExpiresAt = Date.now() + 25 * 60 * 1000;
        body = { status: 'ok', token: 'B1_a_' + 'c'.repeat(64), expiresAt: leaseExpiresAt,
          phoneExpiresAt: Date.now() + 89 * 86400000, trustSource: 'password-bound' };
      }
    } else if (action === 'employee_session') {
      body = revoked || disabled ? { status: 'error' } : {
        status: 'ok', expiresAt: serverExpired ? Date.now() - 1 : leaseExpiresAt,
        trustSource: 'password-bound', phoneEligible: true
      };
    } else if (action === 'employee_private_read') {
      body = revoked || disabled ? { status: 'error' } : { status: 'ok', profile: PROFILE, trustSource: 'password-bound', snapshot: SNAPSHOT };
    } else if (action === 'employee_kpi_read') {
      body = revoked || disabled ? { status: 'error' } : { status: 'ok', profile: PROFILE, trustSource: 'password-bound', data: DATA };
    } else if (action === 'employee_dashboard_read') {
      body = revoked || disabled ? { status: 'error' } : {
        status: 'ok', expiresAt: serverExpired ? Date.now() - 1 : leaseExpiresAt,
        trustSource: 'password-bound', phoneEligible: true,
        privateResult: { status: 'ok', profile: PROFILE, trustSource: 'password-bound', snapshot: SNAPSHOT },
        kpiResult: { status: 'ok', profile: PROFILE, trustSource: 'password-bound', data: DATA }
      };
    } else if (action === 'employee_logout' || action === 'employee_phone_forget') {
      body = { status: 'ok' };
    } else if (action === 'private_access') {
      // Legacy access is intentionally observable so the home B test can fail on regressions.
      body = { status: 'ok' };
    } else if (action === 'read') {
      body = { status: 'ok', data: {} };
    } else if (action) {
      body = { status: 'error' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  return {
    calls,
    reset() { calls.splice(0); },
    setRevoked(value = true) { revoked = value; },
    setDisabled(value = true) { disabled = value; },
    setExpired(value = true) { serverExpired = value; },
    setDelay(value) { responseDelay = value; },
    actions() { return calls.map(call => call.action); },
    starts(actions) { return calls.filter(call => actions.includes(call.action)).map(call => call.started); }
  };
}

async function login(page) {
  await expect(page.locator('[data-b-employee]')).toBeVisible();
  await page.locator('[data-b-employee]').fill('SYNTH001');
  await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
  await page.locator('[data-b-submit]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'active');
}

async function appPage(context) {
  const page = await context.newPage();
  await page.goto(`${fixtureUrl('app.html')}?timing=1#home`);
  return page;
}

async function setHidden(page, hidden) {
  await page.evaluate(value => {
    try { Object.defineProperty(document, 'hidden', { configurable: true, value }); } catch {}
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function dispatchReturnBurst(page) {
  await page.evaluate(() => {
    try { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); } catch {}
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pageshow'));
  });
}

test('real App five tabs retain protected DOM, filters, expansion and scroll; resume validates once', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const fixture = await apiFixture(context);
  const page = await appPage(context);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  if(process.env.LOADING_SCREENSHOT_PATH)await page.screenshot({path:process.env.LOADING_SCREENSHOT_PATH});
  await page.locator('button[data-nav="battle"]').click();
  await page.locator('[data-battle-kind="personal"]').click();
  await page.locator('#personalRoleSelect').selectOption('副店');
  const row = page.locator('.personal-performance-button').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  const protectedText = await page.locator('.personal-performance-item').first().innerText();
  await page.evaluate(() => window.scrollTo(0, Math.min(800, document.body.scrollHeight)));
  const battleScroll = await page.evaluate(() => scrollY);
  expect(battleScroll).toBeGreaterThan(0);

  fixture.reset();
  const tabMeasurements=[];
  await page.evaluate(()=>{window.__tabScroll=[];document.addEventListener('click',event=>{const button=event.target.closest('.bottom-nav button');if(button)window.__tabScroll.push({to:button.dataset.nav,scroll:scrollY});},true);});
  for (let pass = 0; pass < 2; pass += 1) {
    for (const view of ['home', 'battle', 'report', 'schedule', 'patrol']) {
      const start=Date.now(),requests=fixture.calls.length;
      await page.locator(`.bottom-nav button[data-nav="${view}"]`).click();
      await expect(page.locator(`[data-view="${view}"]`)).toBeVisible();
      tabMeasurements.push({pass:pass+1,view,ms:Date.now()-start,requests:fixture.calls.length-requests});
    }
  }
  await page.locator('button[data-nav="battle"]').click();
  console.log('APP_TAB_METRICS '+JSON.stringify({version:BASELINE?'before':'after',tabs:tabMeasurements,scroll:await page.evaluate(()=>window.__tabScroll)}));
  await expect(page.locator('#personalRoleSelect')).toHaveValue('副店');
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  expect(await page.locator('.personal-performance-item').first().innerText()).toContain(protectedText.split('\n')[0]);
  const afterTabsScroll = await page.evaluate(() => scrollY);
  expect(fixture.calls).toHaveLength(0);
  if (!BASELINE) expect(afterTabsScroll).toBe(battleScroll);
  if (!BASELINE) {
    const metrics = await page.evaluate(() => window.DashboardB.metrics());
    expect(metrics.some(event => /^tab:/.test(event.name))).toBe(true);
  }

  await setHidden(page, true);
  if (!BASELINE) {
    await expect(page.locator('body')).toHaveClass(/dashboard-b-suspended/);
    await expect(page.locator('.personal-performance-item').first()).toContainText(protectedText.split('\n')[0]);
  }
  fixture.reset();
  await dispatchReturnBurst(page);
  await expect.poll(() => fixture.calls.filter(call => call.action === 'employee_session').length).toBe(1);
  await page.waitForTimeout(60);
  const returnActions = fixture.actions();
  console.log('APP_RESUME_METRICS ' + JSON.stringify({ version: BASELINE ? 'before' : 'after', actions: returnActions }));
  if(BASELINE){await context.close();return;}
  if (!BASELINE) {
    expect(returnActions).toEqual(['employee_session']);
    await expect(page.locator('body')).not.toHaveClass(/dashboard-b-suspended/);
    await expect(page.locator('.personal-performance-item').first()).toContainText(protectedText.split('\n')[0]);
  }

  // A logout during a slow validation invalidates the request generation; its
  // late response must not reveal the old protected contract again.
  fixture.setDelay(150);
  fixture.reset();
  await setHidden(page, true);
  await dispatchReturnBurst(page);
  await expect.poll(() => fixture.calls.filter(call => call.action === 'employee_session').length).toBe(1);
  await page.locator('[data-b-logout]').click();
  await page.waitForTimeout(180);
  if (!BASELINE) {
    await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'locked');
    await expect(page.locator('#battleContent')).not.toContainText(protectedText.split('\n')[0]);
  }

  // Re-establish the short lease before exercising server-side revocation.
  fixture.setDelay(35);
  fixture.setRevoked(false);
  await login(page);

  fixture.setRevoked();
  fixture.reset();
  await setHidden(page, true);
  await dispatchReturnBurst(page);
  await expect.poll(() => fixture.calls.filter(call => call.action === 'employee_session').length).toBe(1);
  await page.waitForTimeout(60);
  if (!BASELINE) {
    await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'pending');
    await expect(page.locator('#battleContent')).not.toContainText(protectedText.split('\n')[0]);
  }
  fixture.setRevoked(false);
  await page.locator('[data-b-refresh]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'active');
  fixture.setDisabled();
  fixture.reset();
  await setHidden(page, true);
  await dispatchReturnBurst(page);
  await expect.poll(() => fixture.calls.filter(call => call.action === 'employee_session').length).toBe(1);
  await page.waitForTimeout(60);
  if (!BASELINE) {
    await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'pending');
    await expect(page.locator('#battleContent')).not.toContainText(protectedText.split('\n')[0]);
  }
  fixture.setDisabled(false);
  await page.locator('[data-b-refresh]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'active');
  fixture.setExpired();
  fixture.reset();
  await setHidden(page, true);
  await dispatchReturnBurst(page);
  await expect.poll(() => fixture.calls.filter(call => call.action === 'employee_session').length).toBe(1);
  await page.waitForTimeout(60);
  if (!BASELINE) {
    await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'pending');
    await expect(page.locator('#battleContent')).not.toContainText(protectedText.split('\n')[0]);
  }
  await page.locator('[data-b-logout]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'locked');
  if (!BASELINE) {
    await expect(page.locator('#battleContent')).not.toContainText(protectedText.split('\n')[0]);
    expect(await page.evaluate(key => sessionStorage.getItem(key), B_SESSION)).toBeNull();
  }
  expect(errors).toEqual([]);
  await context.close();
});

test('real B request plan uses dashboard bundle for cacheless, validate only for cache hit, and owner phone bundle reads', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const fixture = await apiFixture(context, { delay: 45 });
  const page = await appPage(context);
  const initialStart=Date.now();
  await login(page);
  const initial={ms:Date.now()-initialStart,actions:fixture.actions()};
  fixture.reset();
  const cacheHitStart=Date.now();
  await page.reload();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'active');
  const cacheHit = fixture.actions(),cacheHitMs=Date.now()-cacheHitStart;
  fixture.reset();
  await page.evaluate(key => sessionStorage.removeItem(key), B_CACHE);
  const cachelessStart=Date.now();
  await page.reload();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'active');
  const cacheless = fixture.actions(),cachelessMs=Date.now()-cachelessStart;
  console.log('B_LOADING_METRICS ' + JSON.stringify({ version: BASELINE ? 'before' : 'after', initial,phases:BASELINE?[]:await page.evaluate(()=>DashboardB.metrics()),cacheHit:{ms:cacheHitMs,actions:cacheHit}, cacheless:{ms:cachelessMs,actions:cacheless} }));
  if (!BASELINE) {
    expect(cacheHit).toEqual(['employee_session']);
    expect(cacheless).toEqual(['employee_dashboard_read']);
  }

  // A protected bundle with an expired server lease must never paint the old
  // protected view after restore. The same bundle is accepted only after the
  // fixture restores a current lease and the user explicitly revalidates.
  const protectedBundleMarker = (await page.locator('#battleContent').innerText()).trim().split('\n')[0];
  fixture.setExpired();
  fixture.reset();
  await page.evaluate(key => sessionStorage.removeItem(key), B_CACHE);
  await page.reload();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'pending');
  if (!BASELINE && protectedBundleMarker) await expect(page.locator('#battleContent')).not.toContainText(protectedBundleMarker);
  fixture.setExpired(false);
  await page.locator('[data-b-refresh]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'active');
  await context.close();

  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ownerContext.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
  const ownerFixture = await apiFixture(ownerContext, { delay: 45 });
  const ownerPage = await appPage(ownerContext);
  await login(ownerPage);
  await expect.poll(() => ownerFixture.calls.filter(call => call.action === 'employee_phone_enroll').length).toBe(1);
  const firstOwnerActions = ownerFixture.actions();
  const firstSecure = ['employee_dashboard_read'];
  const firstStarts = ownerFixture.starts(firstSecure);
  console.log('OWNER_PHONE_METRICS ' + JSON.stringify({ version: BASELINE ? 'before' : 'after', actions: firstOwnerActions, securedStartSpan: Math.max(...firstStarts) - Math.min(...firstStarts) }));
  if (!BASELINE) {
    expect(firstOwnerActions.filter(action => action === 'employee_dashboard_read')).toHaveLength(1);
    expect(Math.max(...firstStarts) - Math.min(...firstStarts)).toBeLessThan(35);
  }
  await ownerPage.close();
  ownerFixture.reset();
  const reopenStart=Date.now();
  const reopened = await ownerContext.newPage();
  await reopened.goto(`${fixtureUrl('app.html')}?timing=1#home`);
  await expect(reopened.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'active');
  const reopenActions = ownerFixture.actions();
  console.log('APP_REOPEN_METRICS '+JSON.stringify({version:BASELINE?'before':'after',ms:Date.now()-reopenStart,actions:reopenActions,phases:BASELINE?[]:await reopened.evaluate(()=>DashboardB.metrics())}));
  if (!BASELINE) {
    expect(reopenActions.filter(action => action === 'employee_login')).toHaveLength(0);
    expect(reopenActions.filter(action => action === 'employee_phone_resume')).toHaveLength(1);
    expect(reopenActions.filter(action => action === 'employee_session')).toHaveLength(0);
    expect(reopenActions.filter(action => action === 'employee_dashboard_read')).toHaveLength(1);
    expect(reopenActions).toHaveLength(2);
  }
  await ownerContext.close();
});

test('home B login does not start legacy private_access/read', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const fixture = await apiFixture(context);
  const page = await context.newPage();
  await page.goto(`${fixtureUrl('home.html')}?timing=1`);
  await expect(page.locator('[data-b-submit]')).toBeVisible();
  // Make the old identity available only after the initial public refresh. The
  // post-login event must stay on the B channel instead of starting legacy reads.
  await page.evaluate(({ employee, device }) => {
    localStorage.setItem(employee, 'SYNTH001');
    localStorage.setItem(device, 'a'.repeat(48));
  }, { employee: EMPLOYEE, device: DEVICE });
  fixture.reset();
  await login(page);
  await page.waitForTimeout(100);
  const actions = fixture.actions();
  console.log('HOME_LOADING_METRICS ' + JSON.stringify({ version: BASELINE ? 'before' : 'after', actions }));
  if (!BASELINE) {
    expect(actions).not.toContain('private_access');
    expect(actions).not.toContain('read');
  }
  fixture.reset();
  const firstKpiStart=Date.now();
  await page.locator('[data-b-module="kpi"]').click();
  await expect(page).toHaveURL(/kpi-battle\.html#kpi$/);
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  await expect(page.locator('#kpiBattleContent')).toContainText('酒泉');
  const firstKpi={ms:Date.now()-firstKpiStart,actions:fixture.actions()};
  const switches=[];
  for(const module of ['awards','personal','kpi','awards','personal']){
    fixture.reset();const started=Date.now();
    await page.locator(`[data-b-module="${module}"]`).click();
    await expect(page).toHaveURL(new RegExp('#'+module+'$'));
    switches.push({module,ms:Date.now()-started,actions:fixture.actions()});
  }
  console.log('HOME_KPI_METRICS '+JSON.stringify({version:BASELINE?'before':'after',firstKpi,switches}));
  if(!BASELINE){
    expect(firstKpi.actions).toEqual(['employee_dashboard_read']);
    for(const row of switches)expect(row.actions).toEqual([]);
    const timing=await page.evaluate(()=>DashboardB.metrics());
    expect(timing.some(row=>row.name==='phase:restore')).toBe(true);
    expect(JSON.stringify(timing)).not.toMatch(/SYNTH|B1_|BP1_|password-bound/);
  }
  await context.close();
});


test('home immediate KPI navigation does not duplicate incomplete eager data reads',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const fixture=await apiFixture(context,{delay:35,readDelay:300});
  const page=await context.newPage();await page.goto(`${fixtureUrl('home.html')}?timing=1`);
  await login(page);
  const loginActions=fixture.actions(),start=Date.now();
  await page.locator('[data-b-module="kpi"]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  await expect(page.locator('#kpiBattleContent')).toContainText('酒泉');
  const actions=fixture.actions();
  console.log('HOME_QUICK_KPI_METRICS '+JSON.stringify({version:BASELINE?'before':'after',ms:Date.now()-start,loginActions,totalActions:actions}));
  if(!BASELINE){
    expect(actions.filter(action=>action==='employee_dashboard_read')).toHaveLength(1);
    expect(actions.filter(action=>action==='employee_login')).toHaveLength(1);
  }
  await context.close();
});
