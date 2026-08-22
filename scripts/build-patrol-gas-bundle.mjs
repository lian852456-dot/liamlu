import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'gas', 'Code.gs');
const halfMediaPath = path.join(root, 'gas', 'HalfMedia.gs');
const outputDir = path.join(root, 'patrol-gas');

function range(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0 || to <= from) throw new Error(`Patrol bundle source marker missing: ${start} -> ${end}`);
  return source.slice(from, to).trim();
}

function functionBlock(source, name) {
  const marker = `function ${name}(`;
  const from = source.indexOf(marker);
  if (from < 0) throw new Error(`Patrol bundle dependency missing from source: ${name}`);
  const open = source.indexOf('{', from);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(from, index + 1).trim();
  }
  throw new Error(`Patrol bundle dependency is unterminated: ${name}`);
}

const responseHelpers = String.raw`
const SPREADSHEET_ID = '10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA';

function patrolJsonResponse_(body, callback) {
  const json = JSON.stringify(body || {});
  const cb = String(callback || '');
  if (cb && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function patrolPostPayload_(e) {
  const raw = String(e && e.postData && e.postData.contents || '');
  if (!raw) throw new Error('missing request body');
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid request body');
  return payload;
}

function patrolHealth_() {
  return {
    status: 'ok',
    app: 'patrol',
    configured: Boolean(ptConfiguredKey_()),
    contract: 'patrol-auth-v3',
    sessionContract: PATROL_SESSION_CONTRACT,
    authDeployment: PATROL_AUTH_DEPLOYMENT
  };
}

function patrolGetRoute_(action, params) {
  const query = params || {};
  if (action === 'ping') return {status: 'ok', app: 'patrol'};
  if (action === 'pthealth') return patrolHealth_();
  if (action === 'ptread') {
    ptRequireSession_(query.token, action);
    return {status: 'ok', rows: readPatrol(), stores: PT_STORES, title: PT_TITLE};
  }
  if (action === 'ptsummary') {
    ptRequireSession_(query.token, action);
    const month = patrolSummaryMonth_(query.month);
    return {status: 'ok', summary: readPatrolSummary_(month), stores: PT_STORES, title: PT_TITLE};
  }
  if (action === 'ptdetail') {
    ptRequireSession_(query.token, action);
    return readPatrolDetail_({month: patrolSummaryMonth_(query.month), store: query.store, page: query.page, limit: query.limit});
  }
  if (action === 'ptmileage') {
    ptRequireSession_(query.token, action);
    return readPatrolMileageMonth_({month: patrolSummaryMonth_(query.month), page: query.page, limit: query.limit});
  }
  if (action === 'ptvisit_read') {
    ptRequireSession_(query.token, action);
    const state = patrolVisitState_(query.date || '');
    return {status: 'ok', events: state.events, openVisit: state.openVisit, staleOpenVisit: state.staleOpenVisit};
  }
  if (action === 'hread') {
    ptRequireSession_(query.token, action);
    return {status: 'ok', rows: readHalfCheck()};
  }
  if (action === 'sread') {
    ptRequireSession_(query.token, action);
    return {status: 'ok', schedule: readSchedule(query.month || '')};
  }
  if (action === 'ptwrite') {
    ptRequireSession_(query.token, action);
    const result = writePatrol(JSON.parse(String(query.payload || '[]')));
    return {status: 'ok', written: result.written, updated: result.updated};
  }
  if (action === 'hwrite') {
    ptRequireSession_(query.token, action);
    return {status: 'ok', written: writeHalfCheck(JSON.parse(String(query.payload || '[]')))};
  }
  throw new Error('unknown patrol action');
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || '');
  try {
    return patrolJsonResponse_(patrolGetRoute_(action, params), params.callback);
  } catch (error) {
    return patrolJsonResponse_(ptRouteErrorPayload_(error, action, params.token), params.callback);
  }
}

function doPost(e) {
  let action = '';
  let payload = {};
  try {
    payload = patrolPostPayload_(e);
    action = String(payload.action || '');
    let result;
    if (action === 'ptauth') result = ptAuthenticatePayload(payload);
    else if (action === 'ptlogout') result = ptLogoutPayload(payload);
    else if (action === 'ptsummary') result = ptSummaryPostPayload_(payload);
    else if (action === 'ptdetail') result = ptDetailPostPayload_(payload);
    else if (action === 'ptmileage') result = ptMileageMonthPostPayload_(payload);
    else if (action === 'ptvisit_write') result = writePatrolVisitEvent_(payload);
    else if (action === 'ptvisit_read') {
      ptRequireSession_(payload.token, action);
      const state = patrolVisitState_(payload.date || '');
      result = {events: state.events, openVisit: state.openVisit, staleOpenVisit: state.staleOpenVisit};
    }
    else if (action === 'hwrite') result = writeHalfCheckPostPayload_(payload, e);
    else if (action === 'hread') {
      ptRequireSession_(payload.token, action);
      result = {rows: readHalfCheck()};
    }
    else if (action === 'sread') {
      ptRequireSession_(payload.token, action);
      result = {schedule: readSchedule(payload.month || '')};
    }
    else if (action === 'half_media_upload') result = uploadHalfMedia(payload);
    else throw new Error('unknown patrol action');
    return patrolJsonResponse_({status: 'ok', ...result});
  } catch (error) {
    return patrolJsonResponse_(ptRouteErrorPayload_(error, action, payload && payload.token));
  }
}
`;

const source = fs.readFileSync(sourcePath, 'utf8');
const patrolDependencyClosure = [
  // patrolSummaryContract_ and patrolSummaryHalfDashboard_ use these legacy
  // helpers, which intentionally live outside the main Patrol source ranges.
  'ptWinMonths',
  'ptDayOf',
  'ptItemDone',
  'ptStoreRows'
].map(name => functionBlock(source, name));
const patrolCode = [
  responseHelpers.trim(),
  range(source, 'const PATROL_SESSION_TTL_SECONDS', 'const PATROL_VISIT_SHEET'),
  range(source, 'const PATROL_VISIT_SHEET', 'const HALF_CHECK_SHEET'),
  range(source, 'const HALF_CHECK_SHEET', 'const PT_ITEM_TEXT'),
  ...patrolDependencyClosure
].join('\n\n')
  .replace("const PATROL_AUTH_DEPLOYMENT = 'patrol-auth-stateless-20260821';", "const PATROL_AUTH_DEPLOYMENT = 'patrol-isolated-v1';");

if (/audit_|auditReport|AuditReport|privateDashboard|reportUpload/i.test(patrolCode)) {
  throw new Error('Patrol bundle unexpectedly includes a non-Patrol route or dependency');
}

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, 'PatrolCode.gs'), patrolCode + '\n');
fs.copyFileSync(halfMediaPath, path.join(outputDir, 'HalfMedia.gs'));
console.log('Built patrol-only GAS bundle');
