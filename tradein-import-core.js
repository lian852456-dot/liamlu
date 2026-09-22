(function exposeTradeInImportCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TradeInImportCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildTradeInImportCore() {
  'use strict';

  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = Object.freeze(['xlsx', 'xls', 'csv', 'tsv']);
  const PREVIEW_LIMIT = 5;
  const NORMALIZED_PREVIEW_LIMIT = 50;
  const GRADE_ORDER = Object.freeze(['S', 'A', 'B', 'C']);
  const HEADER_ALIASES = Object.freeze([
    { key:'brand', label:'品牌', aliases:['品牌', '廠牌', '品牌名稱', 'brand', 'brand name'] },
    { key:'product', label:'商品名稱', aliases:['商品名稱', '商品', '品名', '品名item', '產品名稱', 'product name', 'item'] },
    { key:'model', label:'機型／型號', aliases:['機型', '型號', '模型', '商品型號', '產品型號', 'model', 'model name', 'sku', '料號'] },
    { key:'category', label:'商品分類', aliases:['分類', '類別', '品類', '商品類別', '商品分類', 'sim卡類別', 'category'] },
    { key:'retailPrice', label:'售價', aliases:['售價', '建議售價', '定價', '零售價', '商品售價', 'price', 'msrp'] },
    { key:'tradeInPrice', label:'回收價', aliases:['回收價', '回收價格', '回收金額', '舊換新回收價', '折抵價', '估價', 'trade in price', 'tradeinprice'] },
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

  function gradeFromHeader(value) {
    const source = text(value).normalize('NFKC').toUpperCase();
    const bracket = source.match(/[\(（\[【]\s*([SABC])\s*(?:級|等級)?\s*[\)）\]】]/);
    if (bracket) return bracket[1];
    const plain = source.match(/(?:^|[\s_\-－／/])([SABC])\s*(?:級|等級)(?:$|[\s_\-－／/])/);
    return plain ? plain[1] : '';
  }

  function headerWithoutGrade(value) {
    return text(value)
      .normalize('NFKC')
      .replace(/[\(（\[【]\s*[SABC]\s*(?:級|等級)?\s*[\)）\]】]/gi, ' ')
      .replace(/(?:^|[\s_\-－／/])[SABC]\s*(?:級|等級)(?:$|[\s_\-－／/])/gi, ' ')
      .trim();
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
    const source = normalized(headerWithoutGrade(value));
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

  function firstValue(record, columns) {
    for (const column of columns || []) {
      const value = text(record && record[column.name]);
      if (value) return value;
    }
    return '';
  }

  function statusFor(kind, values, hasMapping) {
    if (!hasMapping) return 'unrecognized';
    const hasIdentity = Boolean(values.brand || values.product || values.model);
    const hasPrice = Boolean(kind === 'tradein' ? values.tradeInPrice : values.retailPrice);
    if (!hasIdentity) return 'failed';
    if (kind === 'tradein' && !hasPrice) return 'failed';
    return 'success';
  }

  function issueList(kind, values, hasMapping) {
    if (!hasMapping) return ['無可對應的標準欄位'];
    const issues = [];
    if (!values.brand && !values.product && !values.model) issues.push('缺少商品識別欄位');
    if (kind === 'tradein' && !values.tradeInPrice) issues.push('缺少回收價');
    return issues;
  }

  function makeNormalizedRow(kind, rowNumber, values, hasMapping, grade) {
    const status = statusFor(kind, values, hasMapping);
    return {
      sourceRowNumber:rowNumber,
      grade:grade || '',
      brand:values.brand || '',
      product:values.product || '',
      model:values.model || '',
      category:values.category || '',
      retailPrice:values.retailPrice || '',
      tradeInPrice:values.tradeInPrice || '',
      store:values.store || '',
      date:values.date || '',
      vendor:values.vendor || '',
      promotion:values.promotion || '',
      status,
      issues:issueList(kind, values, hasMapping)
    };
  }

  function standardizeShopping(records, fields) {
    const mapped = new Map();
    fields.forEach(field => {
      if (!field.recognized) return;
      const list = mapped.get(field.recognized.key) || [];
      list.push(field);
      mapped.set(field.recognized.key, list);
    });
    const hasMapping = mapped.size > 0;
    return records.map(record => {
      const values = {};
      HEADER_ALIASES.forEach(definition => { values[definition.key] = firstValue(record.values, mapped.get(definition.key)); });
      return makeNormalizedRow('shopping', record.rowNumber, values, hasMapping, '');
    });
  }

  function standardizeTradeIn(records, fields) {
    const common = new Map();
    const byGrade = new Map();
    fields.forEach(field => {
      if (!field.recognized) return;
      const grade = gradeFromHeader(field.sourceName);
      const target = grade ? (byGrade.get(grade) || new Map()) : common;
      const list = target.get(field.recognized.key) || [];
      list.push(field);
      target.set(field.recognized.key, list);
      if (grade) byGrade.set(grade, target);
    });
    const grades = Array.from(byGrade.keys()).sort((left, right) => {
      const leftIndex = GRADE_ORDER.indexOf(left);
      const rightIndex = GRADE_ORDER.indexOf(right);
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    });
    const hasMapping = common.size > 0 || grades.length > 0;
    const normalizedRows = [];
    records.forEach(record => {
      const rowResults = [];
      const candidates = grades.length ? grades : [''];
      candidates.forEach(grade => {
        const gradeFields = grade ? byGrade.get(grade) : new Map();
        const values = {};
        let hasContent = false;
        HEADER_ALIASES.forEach(definition => {
          const columns = (gradeFields.get(definition.key) || []).concat(common.get(definition.key) || []);
          values[definition.key] = firstValue(record.values, columns);
          if (values[definition.key]) hasContent = true;
        });
        if (hasContent) rowResults.push(makeNormalizedRow('tradein', record.rowNumber, values, hasMapping, grade));
      });
      if (rowResults.length) normalizedRows.push.apply(normalizedRows, rowResults);
      else normalizedRows.push(makeNormalizedRow('tradein', record.rowNumber, {}, hasMapping, ''));
    });
    return normalizedRows;
  }

  function buildStandardization(kind, records, fields) {
    const rows = kind === 'tradein'
      ? standardizeTradeIn(records, fields)
      : standardizeShopping(records, fields);
    const summary = { sourceRows:records.length, normalizedRows:rows.length, success:0, failed:0, unrecognized:0 };
    rows.forEach(row => { summary[row.status] += 1; });
    const mapping = fields.map(field => ({
      sourceName:field.sourceName,
      key:field.recognized ? field.recognized.key : '',
      label:field.recognized ? field.recognized.label : '',
      grade:gradeFromHeader(field.sourceName),
      status:field.recognized ? 'mapped' : 'unrecognized'
    }));
    return { mapping, rows, summary, previewRows:rows.slice(0, NORMALIZED_PREVIEW_LIMIT) };
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

    const standardization = buildStandardization(kind, records, fields);
    const standardWarnings = [];
    if (standardization.summary.failed) standardWarnings.push(String(standardization.summary.failed) + ' 筆標準化資料缺少必要值。');
    if (standardization.summary.unrecognized) standardWarnings.push(String(standardization.summary.unrecognized) + ' 筆資料沒有可對應的標準欄位。');

    return {
      errors:[],
      warnings:warnings.concat(standardWarnings),
      recordCount:records.length,
      fieldNames,
      recognizedFields,
      unknownFields,
      previewRows:records.slice(0, PREVIEW_LIMIT),
      headerRow:detected.rowIndex,
      blankRowCount,
      partialRowCount,
      overflowRowCount,
      rawRows:records,
      fieldMapping:standardization.mapping,
      standardized:standardization
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
    NORMALIZED_PREVIEW_LIMIT,
    GRADE_ORDER,
    extensionOf,
    isSupported,
    recognizeHeader,
    gradeFromHeader,
    detectHeader,
    analyseMatrix,
    parseFile
  });
});
