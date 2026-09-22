(function exposeTradeInImportCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TradeInImportCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildTradeInImportCore() {
  'use strict';

  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = Object.freeze(['xlsx', 'xls', 'csv', 'tsv']);
  const PREVIEW_LIMIT = 5;
  const HEADER_ALIASES = Object.freeze([
    { key:'brand', label:'品牌', aliases:['品牌', '廠牌', 'brand'] },
    { key:'product', label:'商品名稱', aliases:['商品名稱', '商品', '品名', '產品名稱', 'product name'] },
    { key:'model', label:'機型／型號', aliases:['機型', '型號', '商品型號', '產品型號', 'model', 'sku', '料號'] },
    { key:'category', label:'商品分類', aliases:['分類', '類別', '品類', '商品類別', 'category'] },
    { key:'retailPrice', label:'售價', aliases:['售價', '建議售價', '定價', '零售價', 'price', 'msrp'] },
    { key:'tradeInPrice', label:'回收價', aliases:['回收價', '回收價格', '回收金額', '舊換新回收價', '折抵價', '估價', 'trade in price'] },
    { key:'condition', label:'機況／等級', aliases:['機況', '成色', '狀態', '等級', '品況', 'condition', 'grade'] },
    { key:'store', label:'店點／通路', aliases:['店點', '門市', '通路', '營業點', '據點', 'store', 'channel'] },
    { key:'date', label:'資料日期', aliases:['日期', '生效日期', '更新日期', '資料日期', '期間', 'date', 'effective date'] },
    { key:'vendor', label:'供應商／廠商', aliases:['供應商', '廠商', '供應品牌', 'vendor', 'supplier'] },
    { key:'promotion', label:'活動／專案', aliases:['活動', '專案', '促銷', '優惠', 'promotion', 'campaign'] }
  ]);
  const EXPECTED_FIELDS = Object.freeze({
    shopping:['brand', 'product', 'model', 'category', 'retailPrice'],
    tradein:['brand', 'product', 'model', 'tradeInPrice', 'condition']
  });

  function text(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '').trim();
  }

  function normalized(value) {
    return text(value)
      .normalize('NFKC')
      .replace(/[\s　_\-－／/()（）【】[\]：:．.]/g, '')
      .toLowerCase();
  }

  function extensionOf(file) {
    const name = String(file && file.name || '');
    const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function fileType(extension, encoding) {
    const labels = { xlsx:'XLSX', xls:'XLS', csv:'CSV', tsv:'TSV' };
    const base = labels[extension] || extension.toUpperCase();
    return encoding ? base + '（' + encoding + '）' : base;
  }

  function isSupported(file) {
    const extension = extensionOf(file);
    return Boolean(file && SUPPORTED_EXTENSIONS.includes(extension));
  }

  function valueLooksLikeText(value) {
    return /[A-Za-z\u3400-\u9fff]/.test(text(value));
  }

  function recognizeHeader(value) {
    const source = normalized(value);
    if (!source) return null;
    for (const definition of HEADER_ALIASES) {
      for (const alias of definition.aliases) {
        const expected = normalized(alias);
        if (source === expected) return definition;
      }
    }
    for (const definition of HEADER_ALIASES) {
      for (const alias of definition.aliases) {
        const expected = normalized(alias);
        if (expected.length >= 2 && source.includes(expected)) return definition;
      }
    }
    return null;
  }

  function rowCells(row) {
    return (Array.isArray(row) ? row : []).map(text);
  }

  function hasContent(row) {
    return rowCells(row).some(Boolean);
  }

  function scoreHeaderRow(rows, rowIndex) {
    const cells = rowCells(rows[rowIndex]).filter(Boolean);
    if (cells.length < 2) return null;
    const unique = new Set(cells.map(normalized)).size;
    const recognized = cells.map(recognizeHeader).filter(Boolean);
    const nearbyRows = rows.slice(rowIndex + 1, rowIndex + 7).filter(hasContent);
    const structuredRows = nearbyRows.filter(row => rowCells(row).filter(Boolean).length >= 2).length;
    const textCells = cells.filter(valueLooksLikeText).length;
    const score = recognized.length * 100 + Math.min(cells.length, 20) * 5 +
      Math.min(unique, 20) * 2 + structuredRows * 4 + textCells;
    return { rowIndex, score, recognizedCount:recognized.length };
  }

  function detectHeader(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    let best = null;
    for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
      const candidate = scoreHeaderRow(rows, index);
      if (!candidate) continue;
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best;
  }

  function uniqueFieldNames(cells) {
    const seen = new Map();
    return cells.map((value, index) => {
      const base = text(value) || '未命名欄位 ' + String(index + 1);
      const count = (seen.get(base) || 0) + 1;
      seen.set(base, count);
      return count === 1 ? base : base + ' (' + String(count) + ')';
    });
  }

  function analyseMatrix(matrix, kind) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const detected = detectHeader(rows);
    if (!detected) {
      return {
        errors:['找不到可辨識的欄位列；請確認檔案至少有兩個欄位名稱。'],
        warnings:[],
        recordCount:0,
        fieldNames:[],
        recognizedFields:[],
        unknownFields:[],
        previewRows:[],
        headerRow:-1,
        blankRowCount:0,
        partialRowCount:0,
        overflowRowCount:0
      };
    }

    const headerCells = rowCells(rows[detected.rowIndex]);
    const fieldNames = uniqueFieldNames(headerCells);
    const fields = fieldNames.map((name, index) => ({
      name,
      sourceName:text(headerCells[index]) || '未命名欄位',
      recognized:recognizeHeader(headerCells[index])
    }));
    const records = [];
    let blankRowCount = 0;
    let partialRowCount = 0;
    let overflowRowCount = 0;
    for (let index = detected.rowIndex + 1; index < rows.length; index += 1) {
      const source = Array.isArray(rows[index]) ? rows[index] : [];
      if (!hasContent(source)) {
        blankRowCount += 1;
        continue;
      }
      const values = rowCells(source);
      const visibleValues = values.slice(0, fields.length);
      if (visibleValues.some(value => !value)) partialRowCount += 1;
      if (values.slice(fields.length).some(Boolean)) overflowRowCount += 1;
      const record = {};
      fields.forEach((field, columnIndex) => { record[field.name] = visibleValues[columnIndex] || ''; });
      records.push({ rowNumber:index + 1, values:record });
    }

    const recognizedByKey = new Map();
    fields.forEach(field => {
      if (field.recognized && !recognizedByKey.has(field.recognized.key)) {
        recognizedByKey.set(field.recognized.key, {
          key:field.recognized.key,
          label:field.recognized.label,
          sourceName:field.sourceName
        });
      }
    });
    const recognizedFields = Array.from(recognizedByKey.values());
    const unknownFields = fields.filter(field => !field.recognized).map(field => field.sourceName);
    const warnings = [];
    const expected = EXPECTED_FIELDS[kind] || [];
    const matchedExpected = expected.filter(key => recognizedByKey.has(key));
    if (!matchedExpected.length) {
      warnings.push('尚未偵測到此類資料常見欄位；目前僅保留原始欄位與資料預覽，未套用正式 schema。');
    }
    if (unknownFields.length) warnings.push('未分類欄位：' + unknownFields.join('、') + '。');
    if (partialRowCount) warnings.push(String(partialRowCount) + ' 筆資料含空白欄位，已原樣保留在預覽中。');
    if (overflowRowCount) warnings.push(String(overflowRowCount) + ' 筆資料欄數多於偵測表頭，超出欄位未納入預覽。');
    if (!records.length) warnings.push('已辨識欄位，但沒有可預覽的資料列。');

    return {
      errors:[],
      warnings,
      recordCount:records.length,
      fieldNames,
      recognizedFields,
      unknownFields,
      previewRows:records.slice(0, PREVIEW_LIMIT),
      headerRow:detected.rowIndex,
      blankRowCount,
      partialRowCount,
      overflowRowCount
    };
  }

  function csvScore(value) {
    const source = String(value || '');
    return (source.match(/[\u3400-\u9fff]/g) || []).length * 2 +
      (source.match(/品牌|商品|機型|回收|價格|日期|分類|店點/g) || []).length * 12 -
      (source.match(/\uFFFD/g) || []).length * 100;
  }

  function readWorkbook(buffer, extension, XLSX) {
    if (extension !== 'csv' && extension !== 'tsv') {
      return { workbook:XLSX.read(buffer, { type:'array', cellDates:true }), encoding:'' };
    }
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const utf8 = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    let content = utf8;
    let encoding = 'UTF-8';
    try {
      const big5 = new TextDecoder('big5').decode(bytes).replace(/^\uFEFF/, '');
      if (csvScore(big5) > csvScore(utf8)) {
        content = big5;
        encoding = 'Big5';
      }
    } catch (_) {
      // Browsers without Big5 support keep the UTF-8 result.
    }
    return {
      workbook:XLSX.read(content, { type:'string', cellDates:true, FS:extension === 'tsv' ? '\t' : ',' }),
      encoding
    };
  }

  function workbookSheets(workbook, XLSX) {
    return (workbook.SheetNames || []).map(name => ({
      name,
      rows:XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header:1,
        raw:true,
        defval:'',
        blankrows:true
      })
    }));
  }

  function chooseSheet(sheets, kind) {
    const candidates = [];
    (sheets || []).forEach(sheet => {
      const analysis = analyseMatrix(sheet.rows, kind);
      if (analysis.errors.length) return;
      candidates.push({ name:sheet.name, analysis });
    });
    const recognized = candidates.filter(candidate => candidate.analysis.recognizedFields.length);
    const pool = recognized.length ? recognized : candidates;
    let best = null;
    pool.forEach(candidate => {
      const score = candidate.analysis.recordCount * 1000 + candidate.analysis.recognizedFields.length * 100 - candidate.analysis.headerRow;
      if (!best || score > best.score) best = Object.assign({}, candidate, { score });
    });
    return best;
  }

  async function parseFile(file, XLSX, kind) {
    if (!XLSX || typeof XLSX.read !== 'function') throw new Error('本機 SheetJS 解析器未載入，請重新整理後再試。');
    const extension = extensionOf(file);
    if (!isSupported(file)) throw new Error('只支援 XLSX、XLS、CSV 或 TSV 檔案。');
    if (!file.size) throw new Error('檔案是空的，請重新匯出後再試。');
    if (file.size > MAX_FILE_BYTES) throw new Error('檔案超過 20 MB，請先縮小範圍後再試。');
    const buffer = await file.arrayBuffer();
    const loaded = readWorkbook(buffer, extension, XLSX);
    const sheets = workbookSheets(loaded.workbook, XLSX);
    const selected = chooseSheet(sheets, kind);
    if (!selected) throw new Error('所有工作表都找不到可辨識的欄位列。');
    return Object.assign({}, selected.analysis, {
      fileName:String(file.name || ''),
      fileType:fileType(extension, loaded.encoding),
      encoding:loaded.encoding,
      sheetName:selected.name,
      sheetCount:sheets.length
    });
  }

  return Object.freeze({
    MAX_FILE_BYTES,
    SUPPORTED_EXTENSIONS,
    PREVIEW_LIMIT,
    extensionOf,
    isSupported,
    recognizeHeader,
    detectHeader,
    analyseMatrix,
    parseFile
  });
});
