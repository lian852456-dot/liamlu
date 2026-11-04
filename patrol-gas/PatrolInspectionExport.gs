// Read-only HTML export. Uses the existing supervisor session and PT_STORES
// boundary; never accepts client-supplied rows, Drive URLs, or raw file bytes.
const HALF_EXPORT_CONTRACT = 'patrol-inspection-export-v1';

function halfExportScope_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, String(body.action || 'half_export_snapshot'));
  const month = String(body.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('請選擇有效月份');
  const allowed = PT_STORES.map(function(store) { return String(store.name).replace(/^台北/, ''); });
  const selected = String(body.store || '');
  if (selected && allowed.indexOf(selected) < 0) throw new Error('匯出門市未獲授權');
  return {month:month, stores:selected ? [selected] : allowed};
}

function halfExportMedia_(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  let media;
  try { const parsed = JSON.parse(text); media = Array.isArray(parsed) ? parsed : parsed.media; } catch (error) {}
  if (!Array.isArray(media)) media = [{viewUrl:text, name:'既有私有 Drive 附件'}];
  return media.filter(function(item) { return item && typeof item === 'object'; }).map(function(item) {
    const url = String(item.viewUrl || item.url || '');
    const match = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/) || url.match(/^https:\/\/drive\.google\.com\/(?:uc|open)\?[^#]*\bid=([A-Za-z0-9_-]+)/);
    const id = String(item.id || (match && match[1]) || '');
    const safeId = /^[A-Za-z0-9_-]{10,200}$/.test(id) ? id : '';
    const mimeType = String(item.mimeType || '');
    return {id:safeId, name:String(item.name || '附件').slice(0,160), mimeType:mimeType,
      kind:/^video\//.test(mimeType) ? 'video' : /^image\//.test(mimeType) ? 'image' : 'attachment',
      viewUrl:safeId ? 'https://drive.google.com/file/d/' + safeId + '/view' : ''};
  });
}

function halfExportSnapshot_(payload) {
  const scope = halfExportScope_(payload);
  const indexed = {};
  // Scope is applied on the server before either metadata or photos leave GAS.
  readHalfCheck().forEach(function(row) {
    const date = String(row.date || '');
    const store = String(row.store || '').replace(/^台北/, '');
    const item = Number(row.item);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0,7) !== scope.month || scope.stores.indexOf(store) < 0) return;
    const max = date >= '2026-09-01' ? 9 : 18;
    if (!Number.isInteger(item) || item < 1 || item > max) return;
    const checkId = date + '|' + store + '|' + (Number(date.slice(-2)) <= 15 ? 'H1' : 'H2');
    const result = String(row.result || '');
    if (['','ok','abnormal','na'].indexOf(result) < 0) throw new Error('檢查結果格式不相容，請先核對來源');
    indexed[checkId + '|' + item] = {checkId:checkId,date:date,store:store,inspector:String(row.inspector || ''),item:item,result:result,
      note:String(row.note || ''),improvement:String(row.improvement || ''),savedAt:String(row.savedAt || ''),media:halfExportMedia_(row.evidenceNames)};
  });
  const rows = Object.keys(indexed).sort().map(function(key) { return indexed[key]; });
  return {contract:HALF_EXPORT_CONTRACT,month:scope.month,stores:scope.stores,rows:rows,
    revision:ptHashHex_(JSON.stringify({month:scope.month,stores:scope.stores,rows:rows})),readAt:new Date().toISOString()};
}

function halfExportFileInRoot_(file) {
  // Read-only: do not initialize folders or alter Drive sharing during export.
  const rootId = String(PropertiesService.getScriptProperties().getProperty('HALF_MEDIA_FOLDER_ID') || '');
  if (!rootId) return false;
  let queue = [file], seen = {};
  for (let depth=0; depth<12 && queue.length; depth++) {
    const next = [];
    for (let index=0; index<queue.length; index++) {
      const parents = queue[index].getParents();
      while (parents.hasNext()) {
        const parent = parents.next(), id = parent.getId();
        if (id === rootId) return true;
        if (!seen[id]) { seen[id] = true; next.push(parent); }
      }
    }
    queue = next;
  }
  return false;
}

function halfExportPhoto_(payload) {
  const snapshot = halfExportSnapshot_(payload); // Revalidates session + scope on every photo.
  if (!payload.revision || String(payload.revision) !== snapshot.revision) throw new Error('檢查資料已更新，請重新匯出');
  const row = snapshot.rows.find(function(row) { return row.checkId === String(payload.checkId || '') && row.item === Number(payload.item); });
  const media = row && row.media.find(function(item) { return item.id && item.id === String(payload.fileId || ''); });
  if (!media) throw new Error('照片不屬於此檢查與匯出範圍');
  const file = DriveApp.getFileById(media.id);
  if (file.isTrashed() || !halfExportFileInRoot_(file)) throw new Error('附件不在原有巡店媒體資料夾內，請重新上傳至該題');
  let mime = String(file.getMimeType());
  if (!/^image\//.test(mime)) return {contract:HALF_EXPORT_CONTRACT,kind:/^video\//.test(mime)?'video':'attachment',mimeType:mime};
  if (file.getSize() > 25*1024*1024) throw new Error('單張照片超過 25 MB，請壓縮後重新上傳');
  let blob;
  if (/^image\/(jpeg|png|webp|gif)$/.test(mime)) blob = file.getBlob();
  else { blob = file.getThumbnail(); mime = blob ? String(blob.getContentType()) : ''; }
  if (!blob || !/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw new Error('此照片格式無法離線顯示，請改用 JPG／PNG 後重新上傳');
  return {contract:HALF_EXPORT_CONTRACT,kind:'image',mimeType:mime,dataUrl:'data:' + mime + ';base64,' + Utilities.base64Encode(blob.getBytes())};
}
