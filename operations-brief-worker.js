// Company files remain in the worker. The UI sends only a local Office
// opening password when the user explicitly supplies one for a workbook.
importScripts(
  './assets/vendor/store-presentation/jszip-3.10.1.min.js',
  './assets/vendor/xlsx.full.min.js',
  './department-scores-core.js',
  './department-gold-monthly-core.js'
);
const ready = Promise.all([
  import('./operations-brief-core.mjs?v=20261125-large-marketing'),
  import('./operations-brief-package.mjs?v=20261124-operations-review'),
  import('./operations-marketing-core.mjs?v=20261125-large-marketing'),
  import('./operations-local-ocr.mjs'),
  import('./operations-report-core.mjs')
]);
let templateBytes = null;
let recognizeLocally;

self.onmessage = async ({data}) => {
  const {id, type, name, category} = data;
  let {bytes} = data;
  let decrypted = false;
  try {
    const [{validateFile, detectKind}, {sha, openPackage, inspectTemplate, buildDraft},
      {inspectMarketing, inspectMarketingImage, imageType}, {createLocalOcr}, {readReportWorkbook}] = await ready;
    if (type === 'template') {
      templateBytes = null;
      validateFile({size: bytes.byteLength});
      const result = await inspectTemplate(bytes, self.JSZip);
      templateBytes = bytes;
      self.postMessage({id, result});
      return;
    }
    if (type === 'export') {
      if (!templateBytes) throw Error('請重新讀取上月作戰範本。');
      const result = await buildDraft(templateBytes, data.meta, self.JSZip);
      self.postMessage({id, result}, [result]);
      return;
    }
    const file = data.file;
    if (file) {
      if (!(file instanceof Blob) || category !== '行銷簡報' || !/\.pptx$/i.test(name)) throw Error('請從行銷簡報入口重新選取 PPTX。');
      validateFile({name, size: file.size}, category);
    } else {
      validateFile({size: bytes.byteLength});
    }
    const header = file ? await file.slice(0, 16).arrayBuffer() : bytes;
    const result = {name, bytes: file ? file.size : bytes.byteLength, kind: detectKind(header), sheets: []};
    if (!file) result.sha256 = await sha(bytes);
    const marketing = category === '行銷簡報';
    const marketingZip = result.kind === 'zip' && (marketing || /\.pptx$/i.test(name));
    const image = !file && imageType(bytes);
    if (marketingZip || image) {
      recognizeLocally ||= createLocalOcr();
      const onProgress = progress => self.postMessage({id, progress});
      const options = {ocr: recognizeLocally, onProgress};
      result.kind = image ? 'image' : 'pptx';
      if (image) onProgress('正在本機辨識圖片文字…');
      let document;
      if (file) {
        const {inspectLocalDeck} = await import('./operations-large-deck.mjs?v=20261125-large-marketing');
        const parsed = await inspectLocalDeck(file, options);
        result.sha256 = parsed.sha256;
        document = parsed.document;
      } else if (image) {
        document = await inspectMarketingImage(bytes, name, {...options, onProgress: () => onProgress('正在本機辨識圖片文字…')});
      } else {
        document = await inspectMarketing(await openPackage(bytes, self.JSZip), options);
      }
      if (marketing) result.marketing = document;
      else result.document = document;
      result.inspection = {
        read: '內容已讀取，請對照原頁核對。',
        partial: '部分頁面需補資料。請展開查看原因。',
        unread: '尚未取得可用的頁面文字。請依頁面提示補件或補註。'
      }[document.readState];
      self.postMessage({id, result});
      return;
    }
    if (result.kind === 'pdf') throw Error('請用本機 PDF 閱讀器將相關原頁匯出為 PNG 或 JPG，檔名標明原頁碼，再重新選取。');
    if (marketing && result.kind === 'ole' && /\.pptx$/i.test(name)) throw Error('這份 PPTX 為加密或舊版 Office 格式。請在本機 PowerPoint 開啟，另存無開啟密碼的 PPTX 副本。');
    if (marketing && (result.kind === 'ole' || /\.ppt$/i.test(name))) {
      throw Error('舊版 PPT 請用 PowerPoint「檔案 → 另存新檔 → PowerPoint 簡報 (.pptx)」，再選未加密的副本。');
    }
    if (marketing) throw Error('行銷來源需為 PPTX、PNG、JPEG 或 WebP。請核對原檔格式。');

    if (result.kind === 'ole' && String(category || '').startsWith('好速')) {
      importScripts('./assets/vendor/officecrypto.bundle.min.js');
      let encrypted = false;
      try { encrypted = self.OfficeCrypto.isEncrypted(bytes); } catch {}
      if (encrypted) {
        result.encrypted = true;
        if (!data.password) {
          result.needsPassword = true;
          result.inspection = '加密 Excel 尚未讀取。請填好速 Excel 開啟密碼後重新讀取，或在 Excel 另存無開啟密碼副本。';
          self.postMessage({id, result});
          return;
        }
        try {
          const clear = await self.OfficeCrypto.decrypt(bytes, {password: data.password});
          bytes = clear instanceof ArrayBuffer ? clear : clear.buffer.slice(clear.byteOffset, clear.byteOffset + clear.byteLength);
          decrypted = true;
        } catch {
          throw Error('好速 Excel 本機解密失敗。請核對開啟密碼，或在 Excel 另存無開啟密碼 XLSX。');
        } finally { delete data.password; }
        if (detectKind(bytes) !== 'zip') throw Error('解密後不是可讀 XLSX。請在 Excel 另存 XLSX 再試。');
        result.kind = 'zip';
      }
    }
    delete data.password;

    let book;
    const spreadsheetOptions = {cellHTML: false, cellStyles: false, cellNF: false, bookVBA: false, cellFormula: true};
    const generic = category === '綜合公司原檔';
    if (result.kind === 'zip') {
      const zip = await openPackage(bytes, self.JSZip);
      if (!zip.file('xl/workbook.xml')) throw Error('這份檔案不是 XLSX 活頁簿。請選正確報表，或使用行銷簡報入口。');
      result.kind = 'xlsx';
      book = self.XLSX.read(bytes, {...spreadsheetOptions, type: 'array', sheetRows: generic ? 31 : 0});
    } else if (result.kind === 'text' && /\.csv$/i.test(name)) {
      let csv;
      try { csv = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
      catch { throw Error('CSV 編碼無法讀取。請在 Excel 另存「CSV UTF-8」後重新選取。'); }
      result.kind = 'csv';
      book = self.XLSX.read(csv, {...spreadsheetOptions, type: 'string', raw: true, sheetRows: generic ? 31 : 0});
    } else if (result.kind === 'ole') {
      throw Error('加密 Excel 或舊版 XLS。請保留原檔，在 Excel 另存無開啟密碼、無巨集的 XLSX 副本，再重新選取。');
    } else {
      throw Error('無法讀取這個格式。請選原始 XLSX、UTF-8 CSV 或清楚標示頁碼的簡報／圖片。');
    }
    result.report = readReportWorkbook(book, self.XLSX, {
      category, name, sha256: result.sha256,
      scoresCore: self.DepartmentScoresCore, goldCore: self.DepartmentGoldMonthlyCore
    });
    result.sheets = result.report.sheets;
    result.inspection = result.report.sections.length
      ? '已有可核對的工作表與來源位置。請確認期間、範圍及本次採用項目。'
      : '已讀取工作表索引。若要納入簡報，請從對應章節重新選取。';
    self.postMessage({id, result});
  } catch (error) {
    // Worker errors are handled per file; already read chapters stay available.
    self.postMessage({id, error: error.message || '讀取失敗。請在本機另存支援格式再試。'});
  } finally {
    delete data.password;
    if (decrypted) new Uint8Array(bytes).fill(0);
  }
};
