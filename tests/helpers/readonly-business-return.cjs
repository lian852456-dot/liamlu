const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./readonly-dashboard-fixture.cjs');
const root = path.resolve(__dirname, '../..');
const origin = 'https://business-return.test';
const home = origin + '/liamlu/home.html';
const dashboard = origin + '/liamlu/readonly-dashboard.html';
const leaseKey = 'north12b_password_session_v1';

async function setup(context, { approved = false } = {}) {
  const bundle = fixture(), calls = [];
  const sessions = new Map();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname.startsWith('/liamlu/')) {
      const file = path.resolve(root, url.pathname.slice('/liamlu/'.length));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.abort();
      const mime = { '.js':'text/javascript', '.html':'text/html', '.css':'text/css', '.svg':'image/svg+xml' };
      return route.fulfill({ contentType:mime[path.extname(file)] || 'application/octet-stream', path:file });
    }
    if (url.hostname !== 'script.google.com') return route.abort();
    const p = route.request().postDataJSON();
    calls.push(p.action);
    let reply = {status:'error'};
    if (p.action === 'employee_status') reply = {status:'ok',enabled:true,passwordAvailable:true};
    if (p.action === 'employee_login') {
      const token = 'B1_a_' + (sessions.size + 1).toString(16).padStart(64,'0');
      const expiresAt = Date.now() + 1500000;
      sessions.set(token, {expiresAt, device:p.deviceId, live:true});
      reply = {status:'ok', token, expiresAt, trustSource:'password-bound'};
    }
    if (approved && p.employeeId === 'SYNTH001' && p.deviceId) {
      if (p.action === 'private_access') reply = bundle.privateResult;
      if (p.action === 'kpicalc_access') reply = bundle.kpiResult;
    }
    const session = sessions.get(p.token);
    if (session?.live && session.device === p.deviceId) {
      reply = {status:'ok',expiresAt:session.expiresAt,trustSource:'password-bound',phoneEligible:false};
      if (p.action === 'employee_dashboard_read') Object.assign(reply,bundle);
      if (p.action === 'employee_logout') session.live = false;
    }
    return route.fulfill({json:reply});
  });
  return { calls, revoke:() => sessions.forEach(session => session.live = false) };
}

async function signIn(page, employee = 'SYNTH001') {
  await page.locator('[data-b-employee]').fill(employee);
  await page.locator('[data-b-password]').fill('SYNTHETIC');
  await page.locator('[data-b-submit]').click();
}

test('a business login from the locked dashboard returns in the same tab and survives reload', async ({page, context}) => {
  const { calls, revoke } = await setup(context);
  await page.goto(dashboard);
  await expect(page.locator('#auth-message')).toContainText('LOGIN');
  await page.locator('#login-link').click();
  await signIn(page);
  await expect(page).toHaveURL(dashboard);
  await expect(page.locator('#controls')).toBeVisible();
  await page.reload();
  await expect(page.locator('#controls')).toBeVisible();
  expect(calls.filter(action => action === 'employee_login')).toHaveLength(1);
  expect(calls.filter(action => action === 'employee_dashboard_read')).toHaveLength(2);
  await page.locator('header a[href^="home.html"]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  await page.goBack();
  await expect(page.locator('#controls')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  await page.locator('a.card[href="readonly-dashboard.html"]').click();
  await expect(page.locator('#controls')).toBeVisible();
  expect(calls.filter(action => action === 'employee_login')).toHaveLength(1);
  revoke();
  await page.locator('#refresh').click();
  await expect(page.locator('#auth-message')).toContainText('AUTH');
  await expect(page.locator('#controls')).toBeHidden();
  expect(calls).not.toContain('private_access');
});

test('a restored document cannot erase the replacement login for another employee', async ({page, context}) => {
  const { calls } = await setup(context);
  await page.goto(home);
  await signIn(page);
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  // A same-tab document retains the old JS heap while another logs in.
  // Use a same-origin frame to keep both heaps alive independent of browser bfcache policy.
  await page.evaluate(url => {
    const frame = document.createElement('iframe'); frame.src = url; frame.style.width = '100%';
    document.body.append(frame);
  }, home);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  const options = frame.locator('.b-options');
  if (await options.locator('summary').isVisible() && await options.getAttribute('open') === null) await options.locator('summary').click();
  await frame.locator('[data-b-logout]').click();
  await signIn(frame, 'SYNTH002');
  await expect(frame.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  const before = calls.filter(action => action === 'employee_session').length;
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key) !== null, leaseKey)).toBe(true);
  await expect.poll(() => calls.filter(action => action === 'employee_session').length).toBe(before + 1);
  await page.goto(dashboard);
  await expect(page.locator('#controls')).toBeVisible();
  expect(calls.filter(action => action === 'employee_login')).toHaveLength(2);
});

test('a fresh tab and cold start with only a patrol login stay locked', async ({context}) => {
  const { calls } = await setup(context);
  const original = await context.newPage();
  await original.goto(home);
  await signIn(original);
  await expect(original.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  for (const cold of [false, true]) {
    if (cold) await original.close();
    const fresh = await context.newPage();
    await fresh.addInitScript(() => sessionStorage.setItem('bei12b_patrol_session_token_v2','SYNTHETIC'));
    await fresh.goto(dashboard);
    await expect(fresh.locator('#auth-message')).toContainText('LOGIN');
    await expect(fresh.locator('#controls')).toBeHidden();
    await fresh.close();
  }
  expect(calls).not.toContain('employee_dashboard_read');
});

test('explicit approved-device login returns only after the original server checks', async ({context, page}) => {
  const { calls } = await setup(context, {approved:true});
  await page.goto(dashboard);
  await page.locator('#login-link').click();
  const options = page.locator('.b-options');
  if (await options.locator('summary').isVisible() && await options.getAttribute('open') === null) await options.locator('summary').click();
  await page.locator('[data-b-a]').click();
  const panel = page.locator('#kpiBattleContent');
  await panel.locator('#privateEmployeeId').fill('SYNTH001');
  await panel.locator('[data-private-dashboard-action="login"]').click();
  await expect(page).toHaveURL(dashboard);
  await expect(page.locator('#controls')).toBeVisible();
  expect(calls).toEqual(['private_access','kpicalc_access','private_access','kpicalc_access']);
});

test('expired proof and arbitrary return destinations do not unlock or redirect', async ({context, page}) => {
  const { calls } = await setup(context);
  await page.goto(home + '?return=https%3A%2F%2Fother.test');
  await signIn(page);
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  await expect(page).toHaveURL(home + '?return=https%3A%2F%2Fother.test');
  await page.clock.install();
  await page.goto(dashboard);
  await expect(page.locator('#controls')).toBeVisible();
  await page.clock.fastForward(1500001);
  await expect(page.locator('#controls')).toBeHidden();
  await page.reload();
  await expect(page.locator('#controls')).toBeHidden();
  await expect(page.locator('#auth-message')).toContainText(/SESSION|LOGIN/);
  expect(calls.filter(action => action === 'employee_dashboard_read')).toHaveLength(1);
});
