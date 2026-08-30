const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('智慧營運中心督導專區新增行進間戰報，既有兩入口保留', () => {
  const home = read('home.html');
  const supervisor = home.slice(home.indexOf('aria-label="督導專區"'), home.indexOf('</nav>', home.indexOf('aria-label="督導專區"')));
  assert.match(supervisor, /href="patrol\.html"/);
  assert.match(supervisor, /戰報快速更新/);
  assert.match(supervisor, /href="live-battle\.html"[\s\S]*行進間戰報/);
});

test('行進間戰報可先選檔；正式目標維持唯讀選用且僅督導 isTrusted 可用', () => {
  const js = read('live-battle.js');
  assert.doesNotMatch(js, /if \(!state\.targets\) throw new Error\('請先載入正式/);
  assert.match(js, /disabled = !\(state\.aq && state\.rt\)/);
  assert.match(js, /action: 'private_access'/);
  assert.match(js, /action: 'kpicalc_access'/);
  assert.match(js, /profile\.isTrusted !== true/);
  assert.doesNotMatch(js, /report_upload|kpicalc_publish|private_admin|ptwrite|hwrite|fetch\([^)]*file/i);
});

test('辨識失敗保留本機檔並只顯示安全欄位診斷', () => {
  const js = read('live-battle.js');
  const html = read('live-battle.html');
  assert.match(js, /Core\.inspectMatrix/);
  assert.match(js, /僅包含檔案結構、欄位名稱與業務分類值，不含姓名、門號或案件資料/);
  assert.doesNotMatch(js, /input\.value = ''[\s\S]{0,120}解析失敗/);
  assert.match(html, /安全辨識資訊/);
});

test('今日目標採正式昨日實績與剩餘天數動態分配，且不阻擋檔案辨識', () => {
  const core = read('live-battle-core.js');
  const html = read('live-battle.html');
  assert.match(core, /Math\.ceil\(\(Math\.max\(0, Number\(monthTarget\) - Number\(officialActual\)\) \/ Number\(remainingDays\)\) \/ step\) \* step/);
  assert.match(core, /不是昨日.*停止計算今日目標/);
  assert.match(html, /STEP 2 · 選用/);
  assert.match(html, /未載入也不影響檔案辨識/);
});

test('戰報主畫面改以五項指標、實際商品與影音漏搭呈現', () => {
  const core = read('live-battle-core.js');
  const html = read('live-battle.html');
  const js = read('live-battle.js');
  for (const label of ['A999', 'A1399', 'R999', 'R1399', '好速']) assert.match(html, new RegExp(label));
  assert.match(html, /目前上線商品/);
  assert.match(html, /KKBOX／MyVideo 漏搭提醒/);
  assert.match(core, /商品型號/);
  assert.match(core, /提前續約/);
  assert.match(core, /企客/);
  assert.match(js, /renderProducts/);
  assert.match(js, /renderGiftAudit/);
});

test('AQ／RT 明細不寫入 storage、IndexedDB、cookie 或正式後端', () => {
  const files = ['live-battle.html', 'live-battle.js', 'live-battle-core.js'].map(read).join('\n');
  assert.doesNotMatch(files, /indexedDB|document\.cookie|FileReader\.readAsDataURL|fileBase64|dataBase64/);
  assert.doesNotMatch(files, /localStorage\.setItem\([^,]+,\s*(?:file|state\.(?:aq|rt)|JSON\.stringify\(state)/);
  assert.match(read('live-battle.html'), /檔案只在這台裝置的瀏覽器記憶體解析，不上傳、不寫回 KPI/);
});

test('XLSX 使用既有固定 vendor，不新增 CDN 或套件', () => {
  const js = read('live-battle.js');
  assert.match(js, /assets\/vendor\/xlsx\.full\.min\.js/);
  assert.doesNotMatch(js, /https?:\/\/.*xlsx|cdn|unpkg|jsdelivr/);
});

test('分析完成後可分開下載四張本機產生的 PNG 戰報', () => {
  const html = read('live-battle.html');
  const js = read('live-battle.js');
  for (const id of ['downloadSummaryBtn', 'downloadStoresBtn', 'downloadProductsBtn', 'downloadGiftsBtn']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(js, new RegExp(`\\$\\('${id}'\\)\\.addEventListener\\('click'`));
  }
  for (const builder of ['createSummaryPng', 'createStoresPng', 'createProductsPng', 'createGiftsPng']) {
    assert.match(js, new RegExp(`function ${builder}\\(`));
  }
  assert.match(js, /canvas\.toBlob\([\s\S]*'image\/png'/);
  assert.match(js, /URL\.createObjectURL/);
  assert.match(js, /link\.download = `行進間戰報_/);
  assert.doesNotMatch(`${html}\n${js}`, /html2canvas|dom-to-image|cdnjs|unpkg|jsdelivr/i);
});

test('PNG 戰報由 Canvas 在本機生成，不新增 AQ／RT 上傳或留存', () => {
  const files = ['live-battle.html', 'live-battle.js', 'live-battle-core.js'].map(read).join('\n');
  assert.match(files, /document\.createElement\('canvas'\)/);
  assert.doesNotMatch(files, /FileReader\.readAsDataURL|fetch\([^)]*(?:aq|rt|file)|XMLHttpRequest|navigator\.sendBeacon/i);
  assert.doesNotMatch(files, /localStorage\.setItem\([^,]+,\s*(?:file|state\.(?:aq|rt)|JSON\.stringify\(state)/);
});
