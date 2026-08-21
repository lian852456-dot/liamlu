const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGE_URL = process.env.TEST_BASE_URL ? new URL('audit-report.html', process.env.TEST_BASE_URL).href : `file://${path.resolve(__dirname, '../audit-report.html')}`;
const STORES = [
  ['DNB10062', '台北酒泉'], ['DNB10082', '台北永吉'], ['DNB10094', '台北復興南'],
  ['DNB10146', '台北杭州南'], ['DNB10168', '台北萬大'], ['DNB10174', '台北通化'],
  ['DNB10284', '台北大稻埕'], ['DNB10307', '台北三創'], ['DNB10440', '台北六張犁']
].map(([store_id, store_name]) => ({ store_id, store_name }));
const ITEMS = [
  { item_id: 'island_display', item_name: '中島、展示機環境清潔' },
  { item_id: 'op_zone', item_name: 'OP 商品、專區清潔' },
  { item_id: 'counter_seating', item_name: '櫃台電腦後方／客戶座位區清潔' }
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4JcAAAAASUVORK5CYII=', 'base64');

function detail(overrides = {}) {
  return {
    status: 'ok', batch_id: 'audit-cleaning-202608', batch_name: '稽核前環境清潔確認',
    submission_id: 'submission_test_123456789012345', store_id: 'DNB10307', store_name: '台北三創',
    inspector_name: '王小明', employee_id: 'EMP1234', submission_status: 'submitted',
    submitted_at: '2026-08-21T14:00:00+08:00', reviewed_at: '', updated_at: '2026-08-21T14:00:00+08:00', revision: 1,
    items: ITEMS.map(item => ({ ...item, status: 'submitted', reviewer_comment: '', note: '', photo_count: 1, photos: [{ client_photo_id: `server_${item.item_id}_123456`, photo_name: `${item.item_id}.png`, revision: 1, status: 'submitted' }] })),
    timeline: [{ event_type: 'created', status: 'draft', item_id: '', item_name: '', comment: '', created_at: '2026-08-21T13:00:00+08:00' }],
    ...overrides
  };
}

function normalizeItems(items) {
  return ITEMS.map(item => items?.find(row => row.item_id === item.item_id) || { ...item, status: 'draft', reviewer_comment: '', note: '', photo_count: 0, photos: [] });
}

async function mockApi(page, options = {}) {
  const calls = [];
  const uploads = new Map();
  let failOnce = Boolean(options.failOnce);
  let authed = false;
  let current = options.initialStatus || null;
  let ownedSubmission = current?.submission_id || '';
  let ownedEditToken = options.editToken || 'edit_test_123456789012345678901234';
  await page.route('https://script.google.com/**', async route => {
    const payload = JSON.parse(route.request().postData() || '{}');
    calls.push(payload);
    let body;
    const batchId = options.uatBatch ? 'audit-cleaning-202608-uat' : 'audit-cleaning-202608';
    if (payload.action === 'audit_config') {
      if (options.waitForSeed) await page.evaluate(() => window.__auditMigrationSeedReady);
      body = { status: 'ok', contract: 'audit-cleaning-v2-self-report', mode: 'self-report', identityVerification: false,
        batch: { batch_id: batchId, batch_name: options.uatBatch ? '稽核回報 UAT' : '稽核前環境清潔確認', starts_on: '2026-08-20', due_on: '2026-08-31', active: true }, stores: STORES, items: ITEMS, maxPhotosPerItem: 10 };
    } else if (payload.action === 'audit_start') {
      if (!STORES.some(store => store.store_id === payload.store_id) || !String(payload.inspector_name || '').trim() || !String(payload.employee_id || '').trim()) body = { status: 'error', message: '基本資料不完整' };
      else {
        ownedSubmission = payload.submission_id; ownedEditToken = payload.edit_token;
        current = detail({ batch_id: batchId, submission_id: payload.submission_id, store_id: payload.store_id, store_name: STORES.find(store => store.store_id === payload.store_id).store_name,
          inspector_name: String(payload.inspector_name).trim(), employee_id: String(payload.employee_id).trim().toUpperCase(), submission_status: current?.submission_status === 'rework' ? 'rework' : 'draft', submitted_at: current?.submitted_at || '',
          items: current?.items || ITEMS.map(item => ({ ...item, status: 'draft', reviewer_comment: '', note: '', photo_count: 0, photos: [] })), timeline: current?.timeline || [{ event_type: 'created', status: 'draft', item_id: '', item_name: '', comment: '', created_at: '2026-08-21T14:00:00+08:00' }] });
        body = current;
      }
    } else if (payload.action === 'audit_status') {
      body = current && payload.submission_id === ownedSubmission && payload.edit_token === ownedEditToken ? current : { status: 'error', message: '找不到本次回報或草稿識別已失效' };
    } else if (payload.action === 'audit_upload') {
      if (payload.submission_id !== ownedSubmission || payload.edit_token !== ownedEditToken) body = { status: 'error', message: '找不到本次回報或草稿識別已失效' };
      else if (failOnce && String(payload.file?.name || '').includes('fail')) { failOnce = false; body = { status: 'error', message: '模擬單張失敗' }; }
      else {
        uploads.set(payload.client_photo_id, payload);
        body = { status: 'ok', duplicate: false, photo: { client_photo_id: payload.client_photo_id, photo_name: payload.file.name, revision: current?.revision || 1, status: 'draft' } };
      }
    } else if (payload.action === 'audit_photo_delete') {
      uploads.delete(payload.client_photo_id); body = { status: 'ok', deleted: true };
    } else if (payload.action === 'audit_submit') {
      const required = ITEMS.map(item => item.item_id);
      if (payload.submission_id !== ownedSubmission || payload.edit_token !== ownedEditToken) body = { status: 'error', message: '找不到本次回報或草稿識別已失效' };
      else if (current?.submission_status === 'rework') {
        const returned = current.items.find(item => item.status === 'rework')?.item_id;
        if (!returned || ![...uploads.values()].some(row => row.item_id === returned)) body = { status: 'error', message: '退回項目尚未加入補件照片' };
        else {
          current = detail({ ...current, submission_status: 'submitted', revision: (current.revision || 1) + 1, items: current.items.map(item => item.item_id === returned ? { ...item, status: 'submitted', reviewer_comment: '', photo_count: item.photo_count + 1, photos: [...item.photos, ...[...uploads.values()].filter(row => row.item_id === returned).map(row => ({ client_photo_id: row.client_photo_id, photo_name: row.file.name, revision: (current.revision || 1) + 1, status: 'submitted' }))] } : item), timeline: [...current.timeline, { event_type: 'resubmitted', item_id: returned, item_name: ITEMS.find(item => item.item_id === returned).item_name, status: 'submitted', comment: '', created_at: '2026-08-21T14:30:00+08:00' }] });
          body = { ...current, readback_verified: true };
        }
      } else {
        const all = required.every(itemId => [...uploads.values()].some(row => row.item_id === itemId));
        if (!all) body = { status: 'error', message: '尚缺照片' };
        else {
          current = detail({ ...current, submission_status: 'submitted', submitted_at: current.submitted_at || '2026-08-21T14:30:00+08:00', items: ITEMS.map(item => { const uploaded = [...uploads.values()].filter(row => row.item_id === item.item_id); return { ...item, status: 'submitted', photo_count: uploaded.length, photos: uploaded.map(row => ({ client_photo_id: row.client_photo_id, photo_name: row.file.name, revision: 1, status: 'submitted' })) }; }), timeline: [...(current.timeline || []), { event_type: 'submitted', item_id: '', item_name: '', status: 'submitted', comment: '', created_at: '2026-08-21T14:30:00+08:00' }] });
          body = { ...current, readback_verified: true };
        }
      }
    } else if (payload.action === 'audit_photo_read') {
      const allowed = payload.token === 'valid-token' || (payload.submission_id === ownedSubmission && payload.edit_token === ownedEditToken);
      body = allowed ? { status: 'ok', client_photo_id: payload.client_photo_id, photo_name: 'private.png', mime_type: 'image/png', base64: PNG.toString('base64') } : { status: 'error', message: 'unauthorized' };
    } else if (payload.action === 'ptauth') {
      const ok = payload.key === 'correct-pass' || payload.token === 'valid-token'; authed = ok; body = ok ? { status: 'ok', token: 'valid-token', expiresIn: 1800 } : { status: 'error', message: 'unauthorized' };
    } else if (payload.action === 'audit_overview') {
      if (!authed || payload.token !== 'valid-token') body = { status: 'error', message: 'unauthorized' };
      else body = { status: 'ok', batch: { batch_id: batchId, batch_name: '稽核前環境清潔確認' }, stores: STORES.map(store => ({ ...store, submission_id: current?.store_id === store.store_id ? current.submission_id : '', inspector_name: current?.store_id === store.store_id ? current.inspector_name : '', employee_id: current?.store_id === store.store_id ? current.employee_id : '', status: current?.store_id === store.store_id ? current.submission_status : 'missing', submitted_at: current?.store_id === store.store_id ? current.submitted_at : '', last_rework_at: '', items: normalizeItems(current?.store_id === store.store_id ? current.items : []).map(item => ({ ...item, photo_count: current?.store_id === store.store_id ? item.photo_count : 0 })) })) };
    } else if (payload.action === 'audit_detail') {
      body = authed && payload.token === 'valid-token' && current ? current : { status: 'error', message: 'unauthorized' };
    } else if (payload.action === 'audit_review') {
      if (!authed || payload.token !== 'valid-token' || !current) body = { status: 'error', message: 'unauthorized' };
      else {
        const returned = payload.decision === 'return';
        current = detail({ ...current, submission_status: returned ? 'rework' : 'approved', items: current.items.map(item => item.item_id === payload.item_id ? { ...item, status: returned ? 'rework' : 'approved', reviewer_comment: returned ? payload.comment : '', photo_count: item.photo_count } : item), timeline: [...current.timeline, { event_type: returned ? 'returned' : 'approved', item_id: payload.item_id, item_name: ITEMS.find(item => item.item_id === payload.item_id).item_name, status: returned ? 'rework' : 'approved', comment: payload.comment || '', created_at: '2026-08-21T15:00:00+08:00' }] });
        body = current;
      }
    } else if (payload.action === 'audit_cancel') {
      current = detail({ ...current, submission_status: 'cancelled', timeline: [...(current?.timeline || []), { event_type: 'cancelled', item_id: '', item_name: '', status: 'cancelled', comment: payload.comment, created_at: '2026-08-21T15:30:00+08:00' }] }); body = current;
    } else if (payload.action === 'ptlogout') body = { status: 'ok' };
    else body = { status: 'error', message: 'unknown' };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  return { calls, uploads };
}

async function addPhoto(page, itemIndex, name = 'photo.png') {
  await page.locator('.audit-item').nth(itemIndex).locator('.photo-input').setInputFiles({ name, mimeType: 'image/png', buffer: PNG });
}
async function fillBasic(page, store = 'DNB10307') {
  await page.locator('#storeSelect').selectOption(store);
  await page.fill('#inspectorName', '王小明');
  await page.fill('#storeEmployeeId', 'EMP1234');
}

test('quality reminder remains store-only, responsive and keyboard accessible', async ({ page }) => {
  await mockApi(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(PAGE_URL);
  const card = page.locator('#qualityReminderCard'); const button = page.locator('#qualityReminderButton');
  await expect(card).toBeVisible(); await expect(page.locator('#qualityReminderImage')).toHaveAttribute('src', 'assets/audit/quality-management-reminder.png');
  await expect(page.locator('#qualityReminderImage')).toHaveAttribute('alt', '品質管理重點提醒：SGS行前清潔及稽核檢查事項');
  expect(await page.evaluate(() => { const hero = document.querySelector('.hero'); const card = document.querySelector('#qualityReminderCard'); const basic = document.querySelector('.basic-card'); return Boolean(hero.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(card.compareDocumentPosition(basic) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await button.click(); await expect(page.locator('#photoDialog')).toBeVisible(); await expect(page.locator('#previousPhoto')).toBeHidden(); await expect(page.locator('#nextPhoto')).toBeHidden();
  await expect(page.locator('#closePhotoDialog')).toBeFocused(); await page.keyboard.press('Escape'); await expect(page.locator('#photoDialog')).toBeHidden(); await expect(button).toBeFocused(); await button.press('Enter'); await expect(page.locator('#photoDialog')).toBeVisible(); await page.locator('#closePhotoDialog').click();
  await page.locator('#modeSwitch').click(); await expect(page.locator('#storeView')).toBeHidden(); await expect(card).toBeHidden();
});

test('self-report form exposes nine editable stores, required identity fields, multi-add, delete, preview and ten-photo limit', async ({ page }) => {
  await mockApi(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(PAGE_URL);
  expect(await page.locator('#storeSelect option').allTextContents()).toEqual(['請選擇門市', ...STORES.map(store => store.store_name)]);
  expect(await page.locator('#storeSelect option').evaluateAll(options => options.slice(1).map(option => [option.value, option.textContent]))).toEqual(STORES.map(store => [store.store_id, store.store_name]));
  await expect(page.locator('#storeSelect')).toBeEnabled(); await expect(page.locator('#inspectorName')).toHaveAttribute('required', ''); await expect(page.locator('#storeEmployeeId')).toHaveAttribute('required', ''); await expect(page.locator('#submitButton')).toBeDisabled();
  await fillBasic(page); await addPhoto(page, 0, 'one.png'); await addPhoto(page, 0, 'two.png'); await addPhoto(page, 1, 'op.png'); await addPhoto(page, 2, 'counter.png'); await page.fill('#storeEmployeeId', 'X'); await expect(page.locator('#submitButton')).toBeDisabled(); await page.fill('#storeEmployeeId', 'EMP1234'); await expect(page.locator('#submitButton')).toBeEnabled(); await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(2);
  await page.locator('.audit-item').first().locator('.preview-button').first().click(); await expect(page.locator('#photoDialog')).toBeVisible(); await expect(page.locator('#dialogCaption')).toContainText('第 1／2 張'); await page.locator('#closePhotoDialog').click();
  await page.locator('.audit-item').first().locator('.delete-button').first().click(); await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1);
  const extra = Array.from({ length: 10 }, (_, index) => ({ name: `extra-${index}.png`, mimeType: 'image/png', buffer: PNG })); await page.locator('.audit-item').first().locator('.photo-input').setInputFiles(extra); await expect(page.locator('#globalMessage')).toContainText('單項最多 10 張'); await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1); await expect(page.locator('#storeAuthButton')).toHaveCount(0); await expect(page.locator('#rosterProbeCard')).toHaveCount(0);
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('batch migration keeps basic fields, IndexedDB bytes and photos while rotating submission/edit ownership', async ({ page }) => {
  const oldSubmission = 'submission_old_batch_123456789012345'; const oldEdit = 'edit_old_batch_123456789012345678901234'; const photoId = 'photo_old_batch_1234567890';
  await page.addInitScript(({ oldSubmission, oldEdit, photoId }) => {
    localStorage.setItem('bei12b_audit_draft_v1', JSON.stringify({ batch_id: 'audit-cleaning-202607', store_id: 'DNB10307', inspector_name: '王小明', employee_id: 'EMP1234', submission_id: oldSubmission, edit_token: oldEdit, notes: { island_display: '已整線' }, items: { island_display: { photos: [{ id: photoId, name: 'old.png', type: 'image/png', size: 1, lastModified: 1, fingerprint: 'old-fingerprint', status: 'pending', server: null }] } } }));
    window.__auditMigrationSeedReady = new Promise(resolve => { const request = indexedDB.open('bei12b-audit-drafts', 1); request.onupgradeneeded = () => request.result.createObjectStore('photos'); request.onsuccess = () => { const db = request.result; const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put({ bytes: [1, 2, 3], type: 'image/png', name: 'old.png' }, `${oldSubmission}|${photoId}`); tx.oncomplete = () => { db.close(); resolve(true); }; }; });
  }, { oldSubmission, oldEdit, photoId });
  await mockApi(page, { waitForSeed: true }); await page.goto(PAGE_URL); await expect(page.locator('#storeSelect')).toHaveValue('DNB10307'); await expect(page.locator('#inspectorName')).toHaveValue('王小明'); await expect(page.locator('#storeEmployeeId')).toHaveValue('EMP1234'); await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1); await expect(page.locator('.audit-item').first().locator('.photo-state')).toContainText('待上傳');
  const migrated = await page.evaluate(({ oldSubmission, oldEdit, photoId }) => new Promise(resolve => { const draft = JSON.parse(localStorage.getItem('bei12b_audit_draft_v1')); const request = indexedDB.open('bei12b-audit-drafts', 1); request.onsuccess = () => { const db = request.result; const tx = db.transaction('photos', 'readonly'); const keys = tx.objectStore('photos').getAllKeys(); keys.onsuccess = () => { resolve({ draft, keys: keys.result, oldBytesKey: `${oldSubmission}|${photoId}`, oldEdit }); db.close(); }; }; }), { oldSubmission, oldEdit, photoId });
  expect(migrated.draft.batch_id).toBe('audit-cleaning-202608'); expect(migrated.draft.submission_id).not.toBe(oldSubmission); expect(migrated.draft.edit_token).not.toBe(oldEdit); expect(migrated.draft.notes.island_display).toBe('已整線'); expect(migrated.keys).toContain(migrated.oldBytesKey); expect(migrated.keys.some(key => String(key).endsWith(`|${photoId}`) && key !== migrated.oldBytesKey)).toBe(true);
});

test('partial photo failure preserves successful photos and retries only the failed photo before readback success', async ({ page }) => {
  const mock = await mockApi(page, { failOnce: true }); await page.goto(PAGE_URL); await fillBasic(page); await addPhoto(page, 0, 'ok.png'); await addPhoto(page, 0, 'fail.png'); await addPhoto(page, 1, 'op.png'); await addPhoto(page, 2, 'counter.png');
  await page.locator('#submitButton').click(); await expect(page.locator('#globalMessage')).toContainText('1 張照片上傳失敗'); expect(mock.calls.filter(call => call.action === 'audit_submit')).toHaveLength(0);
  await expect(page.locator('.photo-state.failed')).toHaveCount(1); await page.locator('#submitButton').click(); await expect(page.locator('#completionTitle')).toHaveText('回報完成'); await expect(page.locator('#completionCard')).toBeVisible();
  expect(mock.calls.filter(call => call.action === 'audit_upload')).toHaveLength(5); expect(mock.calls.filter(call => call.action === 'audit_upload' && call.file.name === 'ok.png')).toHaveLength(1); expect(mock.calls.filter(call => call.action === 'audit_submit')).toHaveLength(1);
  expect(mock.calls.find(call => call.action === 'audit_start').employee_id).toBe('EMP1234');
});

test('reload preserves local IndexedDB draft and basic fields without authentication state', async ({ page }) => {
  await mockApi(page); await page.goto(PAGE_URL); await fillBasic(page, 'DNB10307'); await addPhoto(page, 0, 'draft.png'); await page.reload();
  await expect(page.locator('#storeSelect')).toHaveValue('DNB10307'); await expect(page.locator('#inspectorName')).toHaveValue('王小明'); await expect(page.locator('#storeEmployeeId')).toHaveValue('EMP1234'); await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1); await expect(page.locator('.audit-item').first().locator('.photo-tile img')).toHaveAttribute('src', /^blob:/); await expect(page.locator('#storeAuthButton')).toHaveCount(0);
});

test('reload restores fifteen protected server photos as Blob URLs without Promise errors and revokes URLs', async ({ page }) => {
  const submissionId = 'submission_server_photos_123456789012345'; const editToken = 'edit_server_photos_123456789012345678901234';
  const items = ITEMS.map(item => ({ ...item, status: 'submitted', reviewer_comment: '', note: '', photo_count: 5, photos: Array.from({ length: 5 }, (_, index) => ({ client_photo_id: `server_${item.item_id}_${index}_123456`, photo_name: `${item.item_id}-${index}.png`, revision: 1, status: 'submitted' })) }));
  const initial = detail({ submission_id: submissionId, items });
  await page.addInitScript(({ submissionId, editToken }) => { localStorage.setItem('bei12b_audit_draft_v1', JSON.stringify({ batch_id: 'audit-cleaning-202608', store_id: 'DNB10307', inspector_name: '王小明', employee_id: 'EMP1234', submission_id: submissionId, edit_token: editToken, notes: {}, items: {} })); }, { submissionId, editToken });
  await page.addInitScript(() => { const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL); window.__created = []; window.__revoked = []; URL.createObjectURL = blob => { const url = create(blob); window.__created.push(url); return url; }; URL.revokeObjectURL = url => { window.__revoked.push(url); return revoke(url); }; });
  const consoleErrors = []; page.on('console', entry => { if (entry.type() === 'error') consoleErrors.push(entry.text()); }); const mock = await mockApi(page, { initialStatus: initial, editToken }); await page.goto(PAGE_URL);
  await expect(page.locator('#completionPhotos .photo-tile img')).toHaveCount(15); await expect(page.locator('#completionPhotos .photo-tile img').first()).toHaveAttribute('src', /^blob:/); expect(mock.calls.filter(call => call.action === 'audit_photo_read')).toHaveLength(15);
  await page.locator('#completionPhotos .photo-tile').first().click(); await expect(page.locator('#photoDialog')).toBeVisible(); await expect(page.locator('#dialogImage')).toHaveAttribute('src', /^blob:/); await page.locator('#closePhotoDialog').click();
  const lifecycle = await page.evaluate(() => { const created = window.__created.slice(); window.dispatchEvent(new Event('pagehide')); return { created, revoked: window.__revoked.slice() }; }); expect(lifecycle.created).toHaveLength(15); expect(lifecycle.revoked.sort()).toEqual(lifecycle.created.sort()); expect(consoleErrors).toEqual([]); expect(consoleErrors.join('\n')).not.toContain('.then is not a function');
});

test('rework unlocks only the returned item and resubmits one new photo', async ({ page }) => {
  const submissionId = 'submission_rework_ui_123456789012345'; const editToken = 'edit_rework_ui_123456789012345678901234';
  const initial = detail({ submission_id: submissionId, submission_status: 'rework', revision: 2, items: ITEMS.map(item => ({ ...item, status: item.item_id === 'op_zone' ? 'rework' : 'approved', reviewer_comment: item.item_id === 'op_zone' ? '請補拍死角' : '', note: '原備註', photo_count: 1, photos: [{ client_photo_id: `server_${item.item_id}_123456`, photo_name: 'original.png', revision: 1, status: item.item_id === 'op_zone' ? 'rework' : 'approved' }] })) });
  await page.addInitScript(({ submissionId, editToken }) => localStorage.setItem('bei12b_audit_draft_v1', JSON.stringify({ batch_id: 'audit-cleaning-202608', store_id: 'DNB10307', inspector_name: '王小明', employee_id: 'EMP1234', submission_id: submissionId, edit_token: editToken, notes: {}, items: {} })), { submissionId, editToken }); const mock = await mockApi(page, { initialStatus: initial, editToken }); await page.goto(PAGE_URL);
  await expect(page.locator('.return-reason:not([hidden])')).toContainText('請補拍死角'); await expect(page.locator('.photo-input').nth(0)).toBeDisabled(); await expect(page.locator('.photo-input').nth(1)).toBeEnabled(); await expect(page.locator('.photo-input').nth(2)).toBeDisabled(); await addPhoto(page, 1, 'rework.png'); await page.locator('#submitButton').click(); await expect(page.locator('#completionTitle')).toHaveText('回報完成'); expect(mock.calls.filter(call => call.action === 'audit_upload').map(call => call.item_id)).toEqual(['op_zone']);
});

test('supervisor overview remains PT protected and can review a private photo with a required return reason', async ({ page }) => {
  const initial = detail(); const mock = await mockApi(page, { initialStatus: initial, editToken: 'edit_test_123456789012345678901234' }); await page.goto(PAGE_URL); await page.locator('#modeSwitch').click(); await expect(page.locator('#supervisorGate')).toBeVisible(); expect(mock.calls.filter(call => call.action === 'audit_overview')).toHaveLength(0);
  await page.fill('#supervisorPasscode', 'wrong'); await page.locator('#supervisorLoginButton').click(); await expect(page.locator('#supervisorWorkspace')).toBeHidden(); await page.fill('#supervisorPasscode', 'correct-pass'); await page.locator('#supervisorLoginButton').click(); await expect(page.locator('.store-review-card')).toHaveCount(9);
  await page.locator('.review-item-button:not([disabled])').first().click(); await expect(page.locator('#reviewDialog')).toBeVisible(); await expect(page.locator('.supervisor-photo img').first()).toHaveAttribute('src', /^blob:/); expect(mock.calls.some(call => call.action === 'audit_photo_read' && call.token === 'valid-token')).toBe(true); expect(await page.locator('body').evaluate(body => body.innerHTML.includes('drive.google.com/file/d/'))).toBe(false);
  let dialogMessage = ''; page.once('dialog', async dialog => { dialogMessage = dialog.message(); await dialog.accept(); }); await page.locator('[data-review-item="island_display"] .return-button').click(); expect(dialogMessage).toContain('必須輸入原因'); await page.locator('[data-review-item="island_display"] textarea').fill('請補拍中島底部'); await page.locator('[data-review-item="island_display"] .return-button').click(); await expect.poll(() => mock.calls.filter(call => call.action === 'audit_review').length).toBe(1); expect(mock.calls.find(call => call.action === 'audit_review').comment).toBe('請補拍中島底部');
});

test('supervisor cancel preserves evidence and exposes a fresh store submission path', async ({ page }) => {
  const initial = detail(); const editToken = 'edit_test_123456789012345678901234';
  await page.addInitScript(({ initial, editToken }) => localStorage.setItem('bei12b_audit_draft_v1', JSON.stringify({ batch_id: initial.batch_id, store_id: initial.store_id, inspector_name: initial.inspector_name, employee_id: initial.employee_id, submission_id: initial.submission_id, edit_token: editToken, notes: {}, items: {} })), { initial, editToken });
  const mock = await mockApi(page, { initialStatus: initial, editToken }); await page.goto(PAGE_URL); await page.locator('#modeSwitch').click(); await page.fill('#supervisorPasscode', 'correct-pass'); await page.locator('#supervisorLoginButton').click(); await page.locator('.review-item-button:not([disabled])').first().click(); await expect(page.locator('#reviewDialog')).toBeVisible(); page.once('dialog', dialog => dialog.accept()); await page.locator('.cancel-submission-button').click(); await expect(page.locator('#reviewDetail')).toContainText('此回報已取消'); expect(mock.calls.some(call => call.action === 'audit_cancel')).toBe(true); await page.locator('#reviewForm .dialog-close').click(); await page.locator('#modeSwitch').click(); await expect(page.locator('#storeView')).toBeVisible(); await expect(page.locator('#newSubmissionButton')).toBeVisible();
});
