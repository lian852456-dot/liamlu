// ════════════════════════════════════
// 督導半月檢查媒體：照片與影片只存入私有 Google Drive。
// 不設公開分享，Sheet 僅保存檔案 ID／預覽連結等中繼資料。
// 第一次可執行 setupHalfMediaStorage()；若私有戰情根資料夾已設定，
// 系統會自動建立或沿用「03_半月督導檢查_照片影片」。
// ════════════════════════════════════
const HALF_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

function halfMediaAuthorized(payload) {
  return PT_KEY !== 'CHANGE_ME' && String((payload || {}).key || '') === PT_KEY;
}

function halfMediaSafeName(value, fallback) {
  const name = String(value || fallback || 'attachment').replace(/[\\/:*?"<>|]/g, '_').trim();
  return (name || fallback || 'attachment').slice(0, 160);
}

function halfMediaSubfolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function halfMediaRootFolder() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(props.getProperty('HALF_MEDIA_FOLDER_ID') || '').trim();
  if (configuredId) return DriveApp.getFolderById(configuredId);

  const dashboardRootId = String(props.getProperty('DASHBOARD_PRIVATE_FOLDER_ID') || '').trim();
  if (dashboardRootId && !/^CHANGE_ME/i.test(dashboardRootId)) {
    const root = DriveApp.getFolderById(dashboardRootId);
    const mediaRoot = halfMediaSubfolder(root, '03_半月督導檢查_照片影片');
    props.setProperty('HALF_MEDIA_FOLDER_ID', mediaRoot.getId());
    return mediaRoot;
  }
  throw new Error('尚未初始化半月檢查媒體資料夾，請在 Apps Script 執行 setupHalfMediaStorage 一次');
}

function setupHalfMediaStorage() {
  const props = PropertiesService.getScriptProperties();
  const root = DriveApp.getRootFolder();
  const folder = halfMediaSubfolder(root, '北一二B＿半月督導檢查_照片影片（私有）');
  props.setProperty('HALF_MEDIA_FOLDER_ID', folder.getId());
  return { status: 'ok', folderId: folder.getId() };
}

function uploadHalfMedia(payload) {
  if (!halfMediaAuthorized(payload)) throw new Error('unauthorized');
  const file = (payload || {}).file || {};
  const mimeType = String(file.type || '');
  const name = halfMediaSafeName(file.name, '巡店附件');
  const base64 = String(file.base64 || '');
  if (!/^(image|video)\//.test(mimeType)) throw new Error('僅允許照片或影片檔案');
  if (!base64) throw new Error('未收到檔案內容');
  if (base64.length > Math.ceil(HALF_MEDIA_MAX_BYTES * 4 / 3) + 8) throw new Error('單一檔案上限為 25 MB');
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > HALF_MEDIA_MAX_BYTES) throw new Error('單一檔案上限為 25 MB');

  const context = (payload || {}).context || {};
  const root = halfMediaRootFolder();
  const month = halfMediaSafeName(context.month || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM'), '未分類月份');
  const store = halfMediaSafeName(context.store || '未分類門市', '未分類門市');
  const check = halfMediaSafeName(context.checkId || '未分類檢查', '未分類檢查');
  const item = '項次_' + String(Number(context.item || 0) || '未分類');
  const folder = halfMediaSubfolder(halfMediaSubfolder(halfMediaSubfolder(halfMediaSubfolder(root, month), store), check), item);
  const now = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
  const savedName = `${now}_${name}`;
  const driveFile = folder.createFile(Utilities.newBlob(bytes, mimeType, savedName));
  const id = driveFile.getId();
  return {
    media: {
      id: id,
      name: driveFile.getName(),
      mimeType: driveFile.getMimeType(),
      viewUrl: `https://drive.google.com/file/d/${id}/view`,
      previewUrl: /^image\//.test(driveFile.getMimeType())
        ? `https://drive.google.com/uc?export=view&id=${id}`
        : `https://drive.google.com/file/d/${id}/preview`
    }
  };
}
