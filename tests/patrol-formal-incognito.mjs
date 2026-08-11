import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const FORMAL_URL = process.env.PATROL_FORMAL_URL;
const SECRET_FILE = process.env.PATROL_SECRET_FILE;
const EXECUTABLE_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

if (!FORMAL_URL) throw new Error('PATROL_FORMAL_URL is required');
if (!SECRET_FILE) throw new Error('PATROL_SECRET_FILE is required');

const correctKey = (await readFile(SECRET_FILE, 'utf8')).trim();
if (!correctKey) throw new Error('The patrol secret file is empty');

const browser = await chromium.launch({
  headless: true,
  ...(EXECUTABLE_PATH ? { executablePath: EXECUTABLE_PATH } : {})
});

const protectedActions = new Set([
  'debug',
  'ptread',
  'ptwrite',
  'ptvisit_read',
  'ptvisit_write',
  'sread',
  'hread',
  'hwrite',
  'half_media_upload'
]);

function requestContract(request) {
  const url = new URL(request.url());
  if (!url.hostname.endsWith('google.com') || !url.pathname.includes('/macros/')) return null;
  let payload = {};
  try {
    payload = JSON.parse(request.postData() || '{}');
  } catch {
    payload = {};
  }
  const action = payload.action || url.searchParams.get('action') || '';
  return {
    action,
    hasKey: Boolean(payload.key || url.searchParams.get('key')),
    hasToken: Boolean(payload.token || url.searchParams.get('token'))
  };
}

async function createFreshPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests = [];
  page.on('request', request => {
    const contract = requestContract(request);
    if (contract?.action) requests.push(contract);
  });
  await page.goto(FORMAL_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('#patrolPasscode').waitFor({ state: 'visible' });
  return { context, page, requests };
}

async function waitForRequestAction(requests, action, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (requests.some(item => item.action === action)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${action}`);
}

async function lockedState(page) {
  return page.evaluate(() => ({
    gateVisible: getComputedStyle(document.querySelector('#patrolAuthGate')).display !== 'none',
    appChildren: document.querySelector('#patrolAppHost').childElementCount,
    pasteBoxCount: document.querySelectorAll('#pasteBox').length,
    sensitiveVisible: /台北酒泉|貼上巡店紀錄|每月班表・每日/.test(document.body.innerText),
    legacyLocalKey:
      localStorage.getItem('PT_KEY') ||
      localStorage.getItem('bei12b_pt_key') ||
      localStorage.getItem('patrol_pt_key'),
    sessionToken: sessionStorage.getItem('bei12b_pt_session_token')
  }));
}

const results = {};

try {
  {
    const { context, page, requests } = await createFreshPage();
    const initial = await lockedState(page);
    await page.locator('#patrolAuthSubmit').click();
    const afterBlank = await lockedState(page);
    const actions = requests.map(item => item.action);
    assert.equal(initial.gateVisible, true);
    assert.equal(initial.appChildren, 0);
    assert.equal(initial.pasteBoxCount, 0);
    assert.equal(initial.sensitiveVisible, false);
    assert.equal(afterBlank.gateVisible, true);
    assert.equal(afterBlank.appChildren, 0);
    assert.equal(actions.includes('ptauth'), false);
    assert.deepEqual(actions.filter(action => protectedActions.has(action)), []);
    results.blank = { locked: true, protectedRequests: 0 };
    await context.close();
  }

  {
    const { context, page, requests } = await createFreshPage();
    await page.locator('#patrolPasscode').fill('incorrect-patrol-key-20260729');
    await page.locator('#patrolAuthSubmit').click();
    await page.waitForFunction(() =>
      document.querySelector('#patrolAuthMessage')?.textContent.includes('錯誤')
    );
    const afterWrong = await lockedState(page);
    const actions = requests.map(item => item.action);
    assert.equal(afterWrong.gateVisible, true);
    assert.equal(afterWrong.appChildren, 0);
    assert.equal(afterWrong.legacyLocalKey, null);
    assert.equal(afterWrong.sessionToken, null);
    assert.equal(actions.filter(action => action === 'ptauth').length, 1);
    assert.deepEqual(actions.filter(action => protectedActions.has(action)), []);
    results.wrong = { locked: true, passwordSaved: false, protectedRequests: 0 };
    await context.close();
  }

  {
    const { context, page, requests } = await createFreshPage();
    await page.locator('#patrolPasscode').fill(correctKey);
    await page.locator('#patrolAuthSubmit').click();
    await page.waitForFunction(() =>
      document.querySelector('#patrolAppHost')?.childElementCount > 0 &&
      getComputedStyle(document.querySelector('#patrolAuthGate')).display === 'none'
    );
    await page.waitForFunction(() =>
      document.querySelector('#cloudStatus')?.textContent.includes('已連線')
    );
    await waitForRequestAction(requests, 'ptread');

    await page.getByRole('button', { name: '每月班表' }).click();
    await page.waitForFunction(() =>
      document.querySelector('#scheduleView')?.classList.contains('active')
    );
    await waitForRequestAction(requests, 'sread');

    await page.getByRole('button', { name: '半月督導檢查' }).click();
    await page.waitForFunction(() =>
      document.querySelector('#halfView')?.classList.contains('active')
    );
    await waitForRequestAction(requests, 'hread');

    const unlocked = await page.evaluate(() => ({
      gateHidden: getComputedStyle(document.querySelector('#patrolAuthGate')).display === 'none',
      appChildren: document.querySelector('#patrolAppHost').childElementCount,
      sessionToken: Boolean(sessionStorage.getItem('bei12b_pt_session_token')),
      legacyLocalKey:
        localStorage.getItem('PT_KEY') ||
        localStorage.getItem('bei12b_pt_key') ||
        localStorage.getItem('patrol_pt_key'),
      patrolTab: Boolean(document.querySelector('[data-view="patrol"]')),
      scheduleTab: Boolean(document.querySelector('[data-view="schedule"]')),
      halfTab: Boolean(document.querySelector('[data-view="half"]'))
    }));
    const authRequest = requests.find(item => item.action === 'ptauth');
    const protectedReads = requests.filter(item => ['ptread', 'sread', 'hread'].includes(item.action));
    assert.equal(unlocked.gateHidden, true);
    assert.ok(unlocked.appChildren > 0);
    assert.equal(unlocked.sessionToken, true);
    assert.equal(unlocked.legacyLocalKey, null);
    assert.equal(unlocked.patrolTab && unlocked.scheduleTab && unlocked.halfTab, true);
    assert.equal(authRequest?.hasKey, true);
    assert.equal(authRequest?.hasToken, false);
    assert.deepEqual(
      [...new Set(protectedReads.map(item => item.action))].sort(),
      ['hread', 'ptread', 'sread']
    );
    assert.equal(protectedReads.every(item => item.hasToken && !item.hasKey), true);

    await page.locator('#privateLogoutBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('#patrolAppHost')?.childElementCount === 0 &&
      getComputedStyle(document.querySelector('#patrolAuthGate')).display !== 'none'
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    const afterLogout = await lockedState(page);
    assert.equal(afterLogout.gateVisible, true);
    assert.equal(afterLogout.appChildren, 0);
    assert.equal(afterLogout.sessionToken, null);
    results.correct = {
      unlockedAfterBackendOk: true,
      protectedReadsUseToken: true,
      plaintextStoredLocally: false,
      tabsLoaded: ['patrol', 'schedule', 'half'],
      logoutRelocked: true
    };
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
