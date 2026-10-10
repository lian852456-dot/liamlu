// Daily owner only. Reuses the approved KPI folder, Drive conversion, date
// parser and privateDashboardSyncRoster; never publishes reports or snapshots.
const PRIVATE_DASHBOARD_ROSTER_SYNC_KEY_ = 'DASHBOARD_ROSTER_SYNC_V1';
const PRIVATE_DASHBOARD_ROSTER_TRIGGER_ = 'refreshNorth12BRoster';

function privateDashboardRosterSyncStatus_() {
  const raw = privateDashboardProperties().getProperty(PRIVATE_DASHBOARD_ROSTER_SYNC_KEY_);
  const state = raw ? JSON.parse(raw) : {};
  return { automatic: ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === PRIVATE_DASHBOARD_ROSTER_TRIGGER_; }),
    lastAttempt: state.lastAttempt || null, lastSuccess: state.lastSuccess || null,
    result: state.result || 'not-run', errorCode: state.errorCode || null, sourceDate: state.sourceDate || null };
}

function privateDashboardRosterSourceMembers_(ss, fileName, today) {
  const storeSheet = ss.getSheetByName('上線數KPI_店點達成率_明細');
  if (!storeSheet) throw new Error('ROSTER_SOURCE_SCHEMA');
  const meta = kpiCalcParseMeta(storeSheet.getRange(1,1,10,12).getValues(), fileName);
  const cutoff = meta.month + '-' + ('0' + meta.snapshotDay).slice(-2);
  const yesterday = Utilities.formatDate(new Date(new Date(today + 'T12:00:00+08:00').getTime() - 86400000), 'Asia/Taipei', 'yyyy-MM-dd');
  if (cutoff !== yesterday) throw new Error('ROSTER_SOURCE_DATE');
  const detail = ss.getSheetByName('上線數KPI_個人達成率_明細');
  const byStore = detail ? null : ss.getSheetByName('上線數KPI_個人達成率_店點');
  const sheet = detail || byStore;
  if (!sheet || sheet.getLastRow() > 10000) throw new Error('ROSTER_SOURCE_SCHEMA');
  const rows = sheet.getDataRange().getValues(), members = [], seen = Object.create(null);
  let currentStore = '';
  function add(id, name, store, role) {
    id = String(id || '').trim(); name = String(name || '').trim();
    store = String(store || '').trim().replace(/\s+/g,'').replace(/^台灣大哥大數位生活台北/,'').replace(/^台灣大哥大台北/,'').replace(/^台北/,'');
    if (privateDashboardCleanEmployeeId(id) !== id || !name || seen[id] || PRIVATE_DASHBOARD_B_STORES_.indexOf(store) < 0) throw new Error('ROSTER_SOURCE_MEMBER');
    seen[id] = true;
    members.push({employeeId:id, maskedName:name.length<2?name:name[0]+'＊'+(name.length>2?name.slice(-1):''),store:store,role:String(role||''),status:'active'});
  }
  rows.forEach(function(row, i) {
    if (detail) {
      if (i >= 9 && String(row[1] || '').trim() === '北一二B') {
        const role = String(row[4] || '').trim();
        if (!/副店|店長|代理|業務代表|^業代$|銷售人員/.test(role)) throw new Error('ROSTER_SOURCE_ROLE');
        add(row[5],row[6],row[3],role);
      }
    } else {
      const first = String(row[0] || '').trim(), name = String(row[1] || '').trim();
      if (first.indexOf(' / ') >= 0) { currentStore = first.indexOf(' / 北一二B / ') >= 0 ? first.split('/').pop().trim() : ''; return; }
      if (!currentStore || !first || !name || name === '合計') return;
      // Same employee-ID/name columns as build_private_dashboard_roster.py.
      // Role is display metadata only and does not grant supervisor access.
      if (row[2] === '' || !Number.isFinite(Number(row[2]))) {
        if (/^[A-Z0-9]{5,12}$/.test(first)) throw new Error('ROSTER_SOURCE_MEMBER');
        return;
      }
      add(first,name,currentStore,'');
    }
  });
  if (members.length < 9 || members.length > 64 || PRIVATE_DASHBOARD_B_STORES_.some(function(s) { return !members.some(function(m) { return m.store === s; }); })) throw new Error('B_COMPLETE_ROSTER_REQUIRED');
  return members;
}

function privateDashboardRefreshRoster_(payload) {
  privateDashboardRequireAuthOwner_();
  privateDashboardAdminAuthorized(payload);
  if (PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ !== true || PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ !== true) throw new Error('ROSTER_NOT_ENABLED');
  const props = privateDashboardProperties(), today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const name = today.slice(5,7) + today.slice(8,10) + '.xlsx';
  // Pin the approved production parent, rather than accepting a caller/file URL.
  const folderId = '1zs4flckF4uysz55tXkAxojM5-yB6a9sH';
  let converted = null;
  try {
    if (KPICALC_SOURCE_FOLDER_ID_DEFAULT !== folderId || props.getProperty('KPICALC_SOURCE_FOLDER_ID') && props.getProperty('KPICALC_SOURCE_FOLDER_ID') !== folderId) throw new Error('ROSTER_SOURCE_PARENT');
    const files = DriveApp.getFolderById(folderId).getFilesByName(name);
    if (!files.hasNext()) throw new Error('ROSTER_SOURCE_MISSING');
    const file = files.next();
    if (files.hasNext() || file.isTrashed() || file.getMimeType() !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.getSize()<1000 || file.getSize()>20000000) throw new Error('ROSTER_SOURCE_IDENTITY');
    const modified = file.getLastUpdated().getTime(), now = Date.now();
    if (Utilities.formatDate(new Date(modified),'Asia/Taipei','yyyy-MM-dd') !== today || modified > now + 300000) throw new Error('ROSTER_SOURCE_DATE');
    const blob = file.getBlob(), bytes = blob.getBytes();
    if (bytes.length !== file.getSize() || bytes[0] !== 80 || bytes[1] !== 75) throw new Error('ROSTER_SOURCE_BYTES');
    const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(b) { return ('0'+((b+256)%256).toString(16)).slice(-2); }).join('');
    converted = Drive.Files.create({name:'roster-tmp-'+name,mimeType:'application/vnd.google-apps.spreadsheet'},blob);
    const members = privateDashboardRosterSourceMembers_(SpreadsheetApp.openById(converted.id),name,today);
    DriveApp.getFileById(converted.id).setTrashed(true);
    converted = null;
    return privateDashboardRosterTransaction_(function() {
      const currentToday = Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
      const fresh = DriveApp.getFileById(file.getId()), parents = fresh.getParents();
      let correctParent = false;
      while (parents.hasNext()) { if (parents.next().getId() === folderId) correctParent = true; }
      if (!correctParent || fresh.getName() !== name || fresh.getLastUpdated().getTime() !== modified || fresh.isTrashed() || currentToday !== today) throw new Error('ROSTER_SOURCE_CHANGED');
      const prior = JSON.parse(props.getProperty(PRIVATE_DASHBOARD_ROSTER_SYNC_KEY_) || '{}');
      const config = privateDashboardCreateGasBStore_({}).config();
      const native = privateDashboardRows(privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET,PRIVATE_DASHBOARD_USERS_HEADERS),PRIVATE_DASHBOARD_USERS_HEADERS);
      const activeCount = native.filter(function(u) { return u.status === 'active' && PRIVATE_DASHBOARD_B_STORES_.indexOf(String(u.store).replace(/^台北/,'')) >= 0; }).length;
      if (members.length < activeCount * 0.8) throw new Error('ROSTER_SOURCE_COUNT');
      // Preserve explicitly managed supervisor accounts outside the KPI source.
      native.forEach(function(u) { if (privateDashboardIsTrustedEmployee(u.employee_id) && !members.some(function(m) { return m.employeeId === u.employee_id; })) members.push({employeeId:u.employee_id,maskedName:u.masked_name,store:u.store,role:u.role,status:u.status==='active'?'active':'inactive'}); });
      let result = 'up-to-date';
      if (prior.fileId !== file.getId() || prior.sha256 !== hash || config.authority.validUntil-Date.now() < 24*60*60*1000) {
        privateDashboardSyncRoster({adminSecret:payload.adminSecret,members:members});
        result = 'updated';
      }
      const updated = privateDashboardCreateGasBStore_({}).config();
      if (updated.authority.validUntil <= Date.now()) throw new Error('ROSTER_RENEWAL_FAILED');
      const text = JSON.stringify({lastAttempt:Date.now(),lastSuccess:Date.now(),result:result,sourceDate:today,fileId:file.getId(),sha256:hash});
      props.setProperty(PRIVATE_DASHBOARD_ROSTER_SYNC_KEY_,text);
      if (props.getProperty(PRIVATE_DASHBOARD_ROSTER_SYNC_KEY_) !== text) throw new Error('B_PERSISTENCE_FAILED');
      const triggers = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === PRIVATE_DASHBOARD_ROSTER_TRIGGER_; });
      if (!triggers.length) ScriptApp.newTrigger(PRIVATE_DASHBOARD_ROSTER_TRIGGER_).timeBased().everyHours(6).create();
      return {status:'ok',result:result,validUntil:updated.authority.validUntil,automatic:true};
    });
  } catch (err) {
    privateDashboardRosterTransaction_(function() {
      const state = JSON.parse(props.getProperty(PRIVATE_DASHBOARD_ROSTER_SYNC_KEY_) || '{}');
      state.lastAttempt = Date.now(); state.result = 'failed';
      state.errorCode = /^(ROSTER_[A-Z_]+|B_COMPLETE_ROSTER_REQUIRED|B_PERSISTENCE_FAILED)$/.test(String(err.message)) ? err.message : 'SERVICE_PERMISSION_OR_UNAVAILABLE';
      props.setProperty(PRIVATE_DASHBOARD_ROSTER_SYNC_KEY_,JSON.stringify(state));
    });
    throw new Error('ROSTER_REFRESH_FAILED');
  } finally {
    if (converted) DriveApp.getFileById(converted.id).setTrashed(true);
  }
}

function refreshNorth12BRoster() {
  // Time trigger runs as the same Daily owner using its existing admin secret.
  return privateDashboardRefreshRoster_({adminSecret:privateDashboardProperties().getProperty('DASHBOARD_ADMIN_SECRET')});
}
