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
    { key:'code', label:'商品代碼／料號', aliases:['代碼', '商品代碼', '產品代碼', 'code', 'item code'] },
    { key:'sku', label:'料號', aliases:['料號', 'sku', 'item no', 'item number'] },
    { key:'product', label:'商品名稱', aliases:['商品名稱', '商品', '品名', '品名item', '產品名稱', 'product name', 'item'] },
    { key:'model', label:'機型／型號', aliases:['機型', '型號', '模型', '商品型號', '產品型號', 'model', 'model name'] },
    { key:'sourceModel', label:'原始機型', aliases:['機款', '原始機型'] },
    { key:'category', label:'商品分類', aliases:['分類', '類別', '品類', '商品類別', '商品分類', 'sim卡類別', 'category'] },
    { key:'retailPrice', label:'單機價／售價', aliases:['單機價', '售價', '建議售價', '定價', '零售價', '商品售價', 'price', 'msrp'] },
    { key:'tradeInPrice', label:'回收價', aliases:['回收價', '回收價格', '回收金額', '舊換新回收價', '折抵價', '估價', '報價', 'trade in price', 'tradeinprice'] },
    { key:'condition', label:'機況／等級', aliases:['機況', '成色', '狀態', '等級', '品況', 'condition', 'grade'] },
    { key:'store', label:'店點／通路', aliases:['店點', '門市', '通路', '營業點', '據點', 'store', 'channel'] },
    { key:'date', label:'資料日期', aliases:['日期', '生效日期', '更新日期', '資料日期', '期間', 'date', 'effective date'] },
    { key:'vendor', label:'回收商／供應商', aliases:['回收商', '供應商', '廠商', '供應品牌', 'vendor', 'supplier'] },
    { key:'note', label:'備註', aliases:['備註', '異動', '說明', 'note', 'remark'] },
    { key:'promotion', label:'活動／專案', aliases:['活動', '專案', '促銷', '優惠', 'promotion', 'campaign'] }
  ]);
  const EXPECTED_FIELDS = Object.freeze({
    shopping:['brand', 'code', 'model', 'retailPrice'],
    tradein:['brand', 'sourceModel', 'sku', 'product', 'tradeInPrice', 'condition']
  });

  function text(value) {
    return String(value == null ? '' : value).replace(/^\uFEFF/, '').trim();
  }

  function normalized(value) {
    return text(value).normalize('NFKC').replace(/[\s　_\-－／/()（）【】[\]：:．.]/g, '').toLowerCase();
  }

  function gradeFromHeader(value) {
    const source = text(value).normalize('NFKC').toUpperCase();
    const bracket = source.match(/[\(（\[【]\s*([SABC])\s*(?:級|等級|等)?\s*[\)）\]】]/);
    if (bracket) return bracket[1];
    const plain = source.match(/(?:^|[\s_\-－／/])([SABC])\s*(?:級|等級|等)(?:$|[\s_\-－／/])/);
    return plain ? plain[1] : '';
  }

  function headerWithoutGrade(value) {
    return text(value).normalize('NFKC')
      .replace(/[\(（\[【]\s*[SABC]\s*(?:級|等級|等)?\s*[\)）\]】]/gi, ' ')
      .replace(/(?:^|[\s_\-－／/])[SABC]\s*(?:級|等級|等)(?:$|[\s_\-－／/])/gi, ' ').trim();
  }

  function extensionOf(file) {
    const match = String(file && file.name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function fileType(extension, encoding) {
    const labels = { xlsx:'XLSX', xls:'XLS', csv:'CSV', tsv:'TSV' };
    const base = labels[extension] || extension.toUpperCase();
    return encoding ? base + '（' + encoding + '）' : base;
  }

  function isSupported(file) {
    return Boolean(file && SUPPORTED_EXTENSIONS.includes(extensionOf(file)));
  }

  function valueLooksLikeText(value) {
    return /[A-Za-z\u3400-\u9fff]/.test(text(value));
  }

  function recognizeHeader(value) {
    const source = normalized(headerWithoutGrade(value));
    if (!source) return null;
    for (const definition of HEADER_ALIASES) {
      if (definition.aliases.some(alias => source === normalized(alias))) return definition;
    }
    for (const definition of HEADER_ALIASES) {
      if (definition.aliases.some(alias => {
        const expected = normalized(alias);
        return definition.key !== 'code' && expected.length >= 2 && source.includes(expected);
      })) return definition;
    }
    return null;
  }

  function rowCells(row) { return (Array.isArray(row) ? row : []).map(text); }
  function hasContent(row) { return rowCells(row).some(Boolean); }

  function scoreHeaderRow(rows, rowIndex) {
    const cells = rowCells(rows[rowIndex]).filter(Boolean);
    if (cells.length < 2) return null;
    const unique = new Set(cells.map(normalized)).size;
    const recognized = cells.map(recognizeHeader).filter(Boolean);
    const nearbyRows = rows.slice(rowIndex + 1, rowIndex + 7).filter(hasContent);
    const structuredRows = nearbyRows.filter(row => rowCells(row).filter(Boolean).length >= 2).length;
    return {
      rowIndex,
      score:recognized.length * 100 + Math.min(cells.length, 20) * 5 + Math.min(unique, 20) * 2 + structuredRows * 4 + cells.filter(valueLooksLikeText).length,
      recognizedCount:recognized.length
    };
  }

  function detectHeader(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    let best = null;
    for (let index = 0; index < Math.min(rows.length, 50); index += 1) {
      const candidate = scoreHeaderRow(rows, index);
      if (candidate && (!best || candidate.score > best.score)) best = candidate;
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

  function priceText(value) {
    return text(value);
  }

  function isCurrency(value) {
    const source = text(value);
    return !source || /^-?[\d,]+(?:\.\d+)?$/.test(source.replace(/\s/g, ''));
  }

  function colorlessModel(value) {
    return text(value)
      .replace(/[\-_－\s]*[（(](?:黑|白|粉|藍|綠|紫|金|銀|灰|鈦金屬原色|沙漠鈦金屬|天然鈦金屬|深鈦金屬|藍鈦金屬|太空黑|星光色|午夜色|珊瑚色|橄欖綠|霧藍|霧紫|霧灰|霧銀|極光色|曜石黑|冰川藍)[）)]/gi, '')
      .replace(/\s{2,}/g, ' ').trim();
  }

  function statusFor(kind, values, hasMapping) {
    if (!hasMapping) return 'unrecognized';
    const hasIdentity = Boolean(values.brand || values.product || values.model || values.sourceModel || values.sku || values.code);
    const hasPrice = Boolean(kind === 'tradein' ? values.tradeInPrice : values.retailPrice);
    if (!hasIdentity || (kind === 'tradein' && !hasPrice)) return 'failed';
    return 'success';
  }

  function issueList(kind, values, hasMapping) {
    if (!hasMapping) return ['無可對應的標準欄位'];
    const issues = [];
    if (!values.brand && !values.product && !values.model && !values.sourceModel && !values.sku && !values.code) issues.push('缺少商品識別欄位');
    if (kind === 'tradein' && !values.tradeInPrice) issues.push('缺少回收價');
    return issues;
  }

  function makeNormalizedRow(kind, rowNumber, values, hasMapping, grade, details) {
    const options = details || {};
    const model = values.model || values.sourceModel || '';
    return {
      sourceRowNumber:rowNumber, sourceSheet:options.sourceSheet || '', grade:grade || '', vendor:values.vendor || '',
      brand:values.brand || '', code:values.code || '', sku:values.sku || '', sourceModel:values.sourceModel || model,
      model, colorlessModel:colorlessModel(model), product:values.product || '', category:values.category || '',
      retailPrice:priceText(values.retailPrice), tradeInPrice:priceText(values.tradeInPrice), note:values.note || '',
      store:values.store || '', date:values.date || '', promotion:values.promotion || '',
      status:statusFor(kind, values, hasMapping), issues:issueList(kind, values, hasMapping), rawValues:options.rawValues || {}
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
      return makeNormalizedRow('shopping', record.rowNumber, values, hasMapping, '', { rawValues:record.values });
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
      (grades.length ? grades : ['']).forEach(grade => {
        const gradeFields = grade ? byGrade.get(grade) : new Map();
        const values = {};
        let hasAnyValue = false;
        HEADER_ALIASES.forEach(definition => {
          const columns = (gradeFields.get(definition.key) || []).concat(common.get(definition.key) || []);
          values[definition.key] = firstValue(record.values, columns);
          if (values[definition.key]) hasAnyValue = true;
        });
        if (hasAnyValue) rowResults.push(makeNormalizedRow('tradein', record.rowNumber, values, hasMapping, grade, { rawValues:record.values }));
      });
      if (rowResults.length) normalizedRows.push.apply(normalizedRows, rowResults);
      else normalizedRows.push(makeNormalizedRow('tradein', record.rowNumber, {}, hasMapping, '', { rawValues:record.values }));
    });
    return normalizedRows;
  }

  function summaryForRows(sourceRows, rows) {
    const summary = { sourceRows, normalizedRows:rows.length, success:0, partial:0, failed:0, unrecognized:0 };
    rows.forEach(row => { summary[row.status] = (summary[row.status] || 0) + 1; });
    return summary;
  }

  function buildStandardization(kind, records, fields) {
    const rows = kind === 'tradein' ? standardizeTradeIn(records, fields) : standardizeShopping(records, fields);
    const mapping = fields.map(field => ({
      sourceName:field.sourceName, key:field.recognized ? field.recognized.key : '', label:field.recognized ? field.recognized.label : '',
      grade:gradeFromHeader(field.sourceName), status:field.recognized ? 'mapped' : 'unrecognized'
    }));
    return { mapping, rows, summary:summaryForRows(records.length, rows), previewRows:rows.slice(0, NORMALIZED_PREVIEW_LIMIT) };
  }

  function duplicateCount(records, fieldNames) {
    const seen = new Set();
    let duplicates = 0;
    records.forEach(record => {
      const key = fieldNames.map(name => text(record.values[name])).join('\u0001');
      if (seen.has(key)) duplicates += 1;
      else seen.add(key);
    });
    return duplicates;
  }

  function analyseMatrix(matrix, kind) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const detected = detectHeader(rows);
    if (!detected) {
      return { errors:['找不到可辨識的欄位列；請確認檔案至少有兩個欄位名稱。'], warnings:[], recordCount:0, fieldNames:[], fields:[], recognizedFields:[], unknownFields:[], previewRows:[], rawRows:[], headerRow:-1, blankRowCount:0, partialRowCount:0, overflowRowCount:0, duplicateRowCount:0 };
    }
    const headerCells = rowCells(rows[detected.rowIndex]);
    const fieldNames = uniqueFieldNames(headerCells);
    const fields = fieldNames.map((name, index) => ({ name, sourceName:text(headerCells[index]) || '未命名欄位', columnIndex:index, recognized:recognizeHeader(headerCells[index]) }));
    const records = [];
    let blankRowCount = 0;
    let partialRowCount = 0;
    let overflowRowCount = 0;
    for (let index = detected.rowIndex + 1; index < rows.length; index += 1) {
      const source = Array.isArray(rows[index]) ? rows[index] : [];
      if (!hasContent(source)) { blankRowCount += 1; continue; }
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
      if (field.recognized && !recognizedByKey.has(field.recognized.key)) recognizedByKey.set(field.recognized.key, { key:field.recognized.key, label:field.recognized.label, sourceName:field.sourceName });
    });
    const recognizedFields = Array.from(recognizedByKey.values());
    const unknownFields = fields.filter(field => !field.recognized).map(field => field.sourceName);
    const warnings = [];
    if (!(EXPECTED_FIELDS[kind] || []).some(key => recognizedByKey.has(key))) warnings.push('尚未偵測到此類資料常見欄位；目前僅保留原始欄位與資料預覽，未套用正式 schema。');
    if (unknownFields.length) warnings.push('未分類欄位：' + unknownFields.join('、') + '。');
    if (partialRowCount) warnings.push(String(partialRowCount) + ' 筆資料含空白欄位，已原樣保留在預覽中。');
    if (overflowRowCount) warnings.push(String(overflowRowCount) + ' 筆資料欄數多於偵測表頭，超出欄位未納入預覽。');
    if (!records.length) warnings.push('已辨識欄位，但沒有可預覽的資料列。');
    const standardization = buildStandardization(kind, records, fields);
    if (standardization.summary.failed) warnings.push(String(standardization.summary.failed) + ' 筆標準化資料缺少必要值。');
    if (standardization.summary.unrecognized) warnings.push(String(standardization.summary.unrecognized) + ' 筆資料沒有可對應的標準欄位。');
    return { errors:[], warnings, recordCount:records.length, fieldNames, fields, recognizedFields, unknownFields, previewRows:records.slice(0, PREVIEW_LIMIT), rawRows:records, headerRow:detected.rowIndex, blankRowCount, partialRowCount, overflowRowCount, duplicateRowCount:duplicateCount(records, fieldNames), fieldMapping:standardization.mapping, standardized:standardization };
  }

  function looksLikeProjectPriceField(value) {
    return /(?:\d{3,4}H|\dG\)?|\b[45]G\b|榮耀|全開|iPhone|智能|專案)/i.test(text(value));
  }

  function valuesForFields(record, fields) {
    const result = {};
    fields.forEach(field => { result[field.name] = text(record.values[field.name]); });
    return result;
  }

  function fieldByKey(fields, key) { return fields.filter(field => field.recognized && field.recognized.key === key); }
  function firstFieldValue(record, fields, key) { return firstValue(record.values, fieldByKey(fields, key)); }

  function planGroupName(matrix, headerRow, columnIndex) {
    let group = '';
    for (let rowIndex = 0; rowIndex < headerRow; rowIndex += 1) {
      let carried = '';
      for (let index = 0; index <= columnIndex; index += 1) {
        const value = text(matrix[rowIndex] && matrix[rowIndex][index]);
        if (value) carried = value;
      }
      if (carried) group = carried;
    }
    return group;
  }

  function analyseShoppingMatrix(matrix, sheetName) {
    const base = analyseMatrix(matrix, 'shopping');
    if (base.errors.length) return base;
    const fields = base.fields || [];
    let lastBrand = '';
    const normalizedRows = [];
    const ignoredRows = [];
    let invalidCurrencyCount = 0;
    let missingRetailPriceCount = 0;
    base.rawRows.forEach(record => {
      const original = valuesForFields(record, fields);
      const suppliedBrand = firstFieldValue(record, fields, 'brand');
      if (suppliedBrand) lastBrand = suppliedBrand;
      const values = {
        brand:suppliedBrand || lastBrand, code:firstFieldValue(record, fields, 'code'),
        model:firstFieldValue(record, fields, 'model') || firstFieldValue(record, fields, 'sourceModel'), product:firstFieldValue(record, fields, 'product'),
        category:firstFieldValue(record, fields, 'category'), retailPrice:firstFieldValue(record, fields, 'retailPrice'), note:firstFieldValue(record, fields, 'note'), date:firstFieldValue(record, fields, 'date')
      };
      const projectPrices = {};
      fields.forEach(field => {
        if (field.recognized || !looksLikeProjectPriceField(field.sourceName)) return;
        const rawValue = text(record.values[field.name]);
        const group = planGroupName(matrix, base.headerRow, field.columnIndex);
        const key = (group ? group + '／' : '') + field.name;
        projectPrices[key] = priceText(rawValue);
        if (rawValue && !isCurrency(rawValue)) invalidCurrencyCount += 1;
      });
      if (values.retailPrice && !isCurrency(values.retailPrice)) invalidCurrencyCount += 1;
      const hasProjectPrice = Object.keys(projectPrices).some(name => text(projectPrices[name]));
      if (!values.retailPrice) missingRetailPriceCount += 1;
      if (!values.code && !values.model && !values.product) {
        ignoredRows.push({ sourceRowNumber:record.rowNumber, reason:'缺少代碼、機型與商品名稱，保留原始列但未建立商品資料。' });
        return;
      }
      const issues = [];
      let status = 'success';
      if (!values.code || !values.model) { status = 'partial'; issues.push('缺少商品代碼或機型'); }
      if (!values.retailPrice && !hasProjectPrice) { status = 'partial'; issues.push('缺少單機價與所有專案價'); }
      normalizedRows.push({
        sourceRowNumber:record.rowNumber, sourceSheet:sheetName || '', grade:'', vendor:'', brand:values.brand, code:values.code, sku:'', sourceModel:values.model,
        model:values.model, colorlessModel:colorlessModel(values.model), product:values.product, category:values.category, retailPrice:priceText(values.retailPrice), tradeInPrice:'', note:values.note,
        store:'', date:values.date, promotion:'', projectPrices, status, issues, rawValues:original
      });
    });
    const mapping = fields.map(field => {
      const priceField = !field.recognized && looksLikeProjectPriceField(field.sourceName);
      const group = priceField ? planGroupName(matrix, base.headerRow, field.columnIndex) : '';
      return { sourceName:field.sourceName, key:field.recognized ? field.recognized.key : (priceField ? 'projectPrice' : ''), label:field.recognized ? field.recognized.label : (priceField ? '專案價欄位（' + (group || '未命名方案') + '）' : ''), grade:'', status:field.recognized ? 'mapped' : (priceField ? 'preserved' : 'unrecognized') };
    });
    const summary = summaryForRows(base.rawRows.length, normalizedRows);
    const warnings = base.warnings.filter(message => !/^未分類欄位：/.test(message));
    if (ignoredRows.length) warnings.push(String(ignoredRows.length) + ' 列不具商品識別值，已標記原因且未建立標準化商品。');
    return Object.assign({}, base, {
      sheetName:sheetName || '', recordCount:base.rawRows.length, unknownFields:fields.filter(field => !field.recognized && !looksLikeProjectPriceField(field.sourceName)).map(field => field.sourceName), fieldMapping:mapping, standardized:{ mapping, rows:normalizedRows, summary, previewRows:normalizedRows.slice(0, NORMALIZED_PREVIEW_LIMIT) }, warnings, ignoredRows, invalidCurrencyCount, missingRetailPriceCount,
      acceptance:{ rawDataRows:base.rawRows.length, validDataRows:normalizedRows.length, success:summary.success, partial:summary.partial, unrecognized:summary.unrecognized, ignoredBlankRows:base.blankRowCount, duplicateRows:base.duplicateRowCount, invalidCurrencyCount, missingRetailPriceCount }
    });
  }

  function headerType(value) {
    const source = normalized(headerWithoutGrade(value));
    if (/料號|sku|itemno/.test(source)) return 'sku';
    if (/品名|商品名稱|productname|item/.test(source)) return 'product';
    if (/報價|回收價|tradeinprice/.test(source)) return 'price';
    return '';
  }

  function providerLabel(value) {
    const source = text(value);
    if (/FutureDial|FDI/i.test(source)) return 'FutureDial（FDI）';
    if (/點子行動/.test(source)) return '點子行動';
    return '';
  }

  function providerAtColumn(matrix, columnIndex, headerRow) {
    for (let rowIndex = 0; rowIndex < headerRow; rowIndex += 1) {
      let current = '';
      for (let index = 0; index <= columnIndex; index += 1) {
        const label = providerLabel(matrix[rowIndex] && matrix[rowIndex][index]);
        if (label) current = label;
      }
      if (current) return current;
    }
    return '';
  }

  function findTradeInComparisonLayout(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 20); rowIndex += 1) {
      const cells = rowCells(rows[rowIndex]);
      const priceHeaders = cells.reduce((count, cell) => count + (gradeFromHeader(cell) && headerType(cell) === 'price' ? 1 : 0), 0);
      if (priceHeaders < 4) continue;
      let identityRow = -1;
      for (let candidate = rowIndex - 1; candidate >= 0; candidate -= 1) {
        const previous = rowCells(rows[candidate]);
        if (previous.some(cell => recognizeHeader(cell) && recognizeHeader(cell).key === 'brand') && previous.some(cell => recognizeHeader(cell) && recognizeHeader(cell).key === 'sourceModel')) { identityRow = candidate; break; }
      }
      if (identityRow >= 0) return { gradeHeaderRow:rowIndex, identityRow };
    }
    return null;
  }

  function sourceColumnName(columnIndex) {
    let index = columnIndex + 1;
    let name = '';
    while (index > 0) {
      const remainder = (index - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      index = Math.floor((index - 1) / 26);
    }
    return name;
  }

  function analyseTradeInComparison(matrix, sheetName) {
    const layout = findTradeInComparisonLayout(matrix);
    if (!layout) return null;
    const rows = Array.isArray(matrix) ? matrix : [];
    const identityCells = rowCells(rows[layout.identityRow]);
    const gradeCells = rowCells(rows[layout.gradeHeaderRow]);
    const width = Math.max(identityCells.length, gradeCells.length, ...rows.map(row => Array.isArray(row) ? row.length : 0));
    const brandColumn = identityCells.findIndex(cell => recognizeHeader(cell) && recognizeHeader(cell).key === 'brand');
    const modelColumn = identityCells.findIndex(cell => recognizeHeader(cell) && recognizeHeader(cell).key === 'sourceModel');
    const fields = [];
    const gradeGroups = [];
    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      const header = gradeCells[columnIndex] || identityCells[columnIndex] || '';
      const grade = gradeFromHeader(gradeCells[columnIndex]);
      const type = headerType(gradeCells[columnIndex]);
      const vendor = providerAtColumn(rows, columnIndex, layout.gradeHeaderRow);
      const common = columnIndex === brandColumn ? { key:'brand', label:'品牌' } : (columnIndex === modelColumn ? { key:'sourceModel', label:'原始機型' } : null);
      const sourceName = text(header) || '原始補充欄位 ' + sourceColumnName(columnIndex);
      fields.push({ name:(vendor && grade ? vendor + ' · ' : '') + sourceName, sourceName, columnIndex, grade, vendor, type, recognized:common || (type === 'sku' ? { key:'sku', label:'料號' } : type === 'product' ? { key:'product', label:'商品名稱' } : type === 'price' ? { key:'tradeInPrice', label:'回收價' } : null) });
      if (type === 'price' && grade) {
        let skuColumn = -1;
        let productColumn = -1;
        for (let previous = Math.max(0, columnIndex - 3); previous < columnIndex; previous += 1) {
          if (gradeFromHeader(gradeCells[previous]) !== grade) continue;
          if (headerType(gradeCells[previous]) === 'sku') skuColumn = previous;
          if (headerType(gradeCells[previous]) === 'product') productColumn = previous;
        }
        gradeGroups.push({ grade, vendor, priceColumn:columnIndex, skuColumn, productColumn, date:text(rows[layout.gradeHeaderRow - 1] && rows[layout.gradeHeaderRow - 1][columnIndex]) });
      }
    }
    gradeGroups.forEach(group => {
      [group.skuColumn, group.productColumn, group.priceColumn].forEach(columnIndex => {
        if (columnIndex < 0 || !fields[columnIndex]) return;
        const field = fields[columnIndex];
        field.vendor = group.vendor;
        field.name = (group.vendor ? group.vendor + ' · ' : '') + field.sourceName;
      });
    });
    const fieldNames = fields.map(field => field.name);
    const rawRows = [];
    const normalizedRows = [];
    const ignoredRows = [];
    let blankRowCount = 0;
    let skippedEmptyGradeCount = 0;
    let invalidCurrencyCount = 0;
    let gradeMismatchCount = 0;
    let providerMismatchCount = 0;
    let missingSkuCount = 0;
    let missingQuoteCount = 0;
    let missingProductCount = 0;
    for (let rowIndex = layout.gradeHeaderRow + 1; rowIndex < rows.length; rowIndex += 1) {
      const source = rows[rowIndex] || [];
      if (!hasContent(source)) { blankRowCount += 1; continue; }
      const brand = text(source[brandColumn]);
      const originalModel = text(source[modelColumn]);
      const rawValues = {};
      fields.forEach(field => { rawValues[field.name] = text(source[field.columnIndex]); });
      if (!brand && !originalModel) {
        ignoredRows.push({ sourceRowNumber:rowIndex + 1, reason:'說明、條件或非機型資料列；未展開為回收價。', rawValues });
        continue;
      }
      rawRows.push({ rowNumber:rowIndex + 1, values:rawValues });
      gradeGroups.forEach(group => {
        const sku = group.skuColumn < 0 ? '' : text(source[group.skuColumn]);
        const product = group.productColumn < 0 ? '' : text(source[group.productColumn]);
        const quote = text(source[group.priceColumn]);
        if (!sku && !product && !quote) { skippedEmptyGradeCount += 1; return; }
        if (!sku) missingSkuCount += 1;
        if (!product) missingProductCount += 1;
        if (!quote) missingQuoteCount += 1;
        if (quote && !isCurrency(quote)) invalidCurrencyCount += 1;
        const productGrade = gradeFromHeader(product);
        if (productGrade && productGrade !== group.grade) gradeMismatchCount += 1;
        if (/\bFDI\b/i.test(product) && !/FDI/i.test(group.vendor)) providerMismatchCount += 1;
        const issues = [];
        if (!originalModel) issues.push('缺少原始機型');
        if (!group.vendor) issues.push('無法辨識回收商');
        if (!sku) issues.push('缺料號');
        if (!product) issues.push('缺品名');
        if (!quote) issues.push('缺報價');
        if (productGrade && productGrade !== group.grade) issues.push('品名等級與欄位等級不一致');
        if (/\bFDI\b/i.test(product) && !/FDI/i.test(group.vendor)) issues.push('品名回收商與欄位回收商不一致');
        const status = !originalModel || !group.vendor ? 'unrecognized' : (issues.length ? 'partial' : 'success');
        normalizedRows.push({ sourceRowNumber:rowIndex + 1, sourceSheet:sheetName || '', grade:group.grade, vendor:group.vendor, brand, code:'', sku, sourceModel:originalModel, model:originalModel, colorlessModel:colorlessModel(originalModel), product, category:'', retailPrice:'', tradeInPrice:priceText(quote), note:'', store:'', date:group.date, promotion:'', status, issues, rawValues });
      });
    }
    const summary = summaryForRows(rawRows.length, normalizedRows);
    const recognizedFields = fields.filter(field => field.recognized).map(field => ({ key:field.recognized.key, label:field.recognized.label, sourceName:field.sourceName }));
    const mapping = fields.map(field => ({ sourceName:field.sourceName, key:field.recognized ? field.recognized.key : '', label:field.recognized ? field.recognized.label : '原始補充欄位（保留）', grade:field.grade, vendor:field.vendor, status:field.recognized ? 'mapped' : 'preserved' }));
    const gradeCounts = { S:0, A:0, B:0, C:0 };
    normalizedRows.forEach(row => { gradeCounts[row.grade] = (gradeCounts[row.grade] || 0) + 1; });
    const warnings = [];
    if (ignoredRows.length) warnings.push(String(ignoredRows.length) + ' 列條件說明／非機型列未展開；已保留來源列與原因。');
    if (skippedEmptyGradeCount) warnings.push(String(skippedEmptyGradeCount) + ' 個空白等級組未產生假資料。');
    if (missingProductCount) warnings.push(String(missingProductCount) + ' 筆已有料號與報價但缺品名，標記為部分成功。');
    if (gradeMismatchCount) warnings.push(String(gradeMismatchCount) + ' 筆品名等級與欄位等級不一致。');
    if (providerMismatchCount) warnings.push(String(providerMismatchCount) + ' 筆品名回收商與欄位回收商不一致。');
    const duplicateRows = duplicateCount(rawRows, fieldNames);
    return { errors:[], warnings, sheetName:sheetName || '', recordCount:rawRows.length, fieldNames, fields, recognizedFields, unknownFields:fields.filter(field => !field.recognized).map(field => field.sourceName), previewRows:rawRows.slice(0, PREVIEW_LIMIT), rawRows, headerRow:layout.gradeHeaderRow, blankRowCount, partialRowCount:missingProductCount + missingSkuCount + missingQuoteCount, overflowRowCount:0, duplicateRowCount:duplicateRows, ignoredRows, invalidCurrencyCount, fieldMapping:mapping, standardized:{ mapping, rows:normalizedRows, summary, previewRows:normalizedRows.slice(0, NORMALIZED_PREVIEW_LIMIT) }, acceptance:{ rawModelRows:rawRows.length, expandedGradeRows:normalizedRows.length, gradeCounts, missingQuoteCount, missingSkuCount, missingProductCount, unrecognized:summary.unrecognized, skippedEmptyGradeCount, invalidCurrencyCount, gradeMismatchCount, providerMismatchCount, duplicateRows } };
  }

  function combineShoppingAnalyses(analyses) {
    const usable = analyses.filter(analysis => !analysis.errors.length && analysis.standardized.rows.length);
    if (!usable.length) return null;
    if (usable.length === 1) return usable[0];
    const fieldNames = [];
    const seenFields = new Set();
    const mapping = [];
    const seenMapping = new Set();
    const rawRows = [];
    const normalizedRows = [];
    const warnings = ['已解析 ' + String(usable.length) + ' 個資料工作表；相同代碼出現在不同專案工作表時，視為不同價格情境，不計入重複資料。'];
    const acceptance = { rawDataRows:0, validDataRows:0, success:0, partial:0, unrecognized:0, ignoredBlankRows:0, duplicateRows:0, invalidCurrencyCount:0, missingRetailPriceCount:0 };
    const sheetSummaries = [];
    usable.forEach(analysis => {
      analysis.fieldNames.forEach(name => { if (!seenFields.has(name)) { seenFields.add(name); fieldNames.push(name); } });
      analysis.fieldMapping.forEach(item => {
        const key = [item.sourceName, item.key, item.status].join('|');
        if (!seenMapping.has(key)) { seenMapping.add(key); mapping.push(item); }
      });
      rawRows.push.apply(rawRows, analysis.rawRows.map(row => Object.assign({}, row, { values:Object.assign({ '來源工作表':analysis.sheetName }, row.values) })));
      normalizedRows.push.apply(normalizedRows, analysis.standardized.rows);
      Object.keys(acceptance).forEach(key => { if (typeof analysis.acceptance[key] === 'number') acceptance[key] += analysis.acceptance[key]; });
      sheetSummaries.push({ name:analysis.sheetName, rawDataRows:analysis.acceptance.rawDataRows, validDataRows:analysis.acceptance.validDataRows, success:analysis.acceptance.success, partial:analysis.acceptance.partial, invalidCurrencyCount:analysis.acceptance.invalidCurrencyCount });
    });
    fieldNames.unshift('來源工作表');
    const summary = summaryForRows(rawRows.length, normalizedRows);
    acceptance.uniqueColorlessModels = new Set(normalizedRows.map(row => row.colorlessModel).filter(Boolean)).size;
    return Object.assign({}, usable[0], { sheetName:String(usable.length) + ' 個可解析工作表', sheetNames:usable.map(analysis => analysis.sheetName), sheetSummaries, fieldNames, rawRows, previewRows:rawRows.slice(0, PREVIEW_LIMIT), recordCount:rawRows.length, fieldMapping:mapping, standardized:{ mapping, rows:normalizedRows, summary, previewRows:normalizedRows.slice(0, NORMALIZED_PREVIEW_LIMIT) }, warnings, blankRowCount:acceptance.ignoredBlankRows, partialRowCount:acceptance.partial, duplicateRowCount:acceptance.duplicateRows, invalidCurrencyCount:acceptance.invalidCurrencyCount, acceptance });
  }

  function csvScore(value) {
    const source = String(value || '');
    return (source.match(/[\u3400-\u9fff]/g) || []).length * 2 + (source.match(/品牌|商品|機型|回收|價格|日期|分類|店點/g) || []).length * 12 - (source.match(/\uFFFD/g) || []).length * 100;
  }

  function readWorkbook(buffer, extension, XLSX) {
    if (extension !== 'csv' && extension !== 'tsv') return { workbook:XLSX.read(buffer, { type:'array', cellDates:true }), encoding:'' };
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const utf8 = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    let content = utf8;
    let encoding = 'UTF-8';
    try {
      const big5 = new TextDecoder('big5').decode(bytes).replace(/^\uFEFF/, '');
      if (csvScore(big5) > csvScore(utf8)) { content = big5; encoding = 'Big5'; }
    } catch (_) {
      // Browsers without Big5 support keep the UTF-8 result.
    }
    return { workbook:XLSX.read(content, { type:'string', cellDates:true, FS:extension === 'tsv' ? '\t' : ',' }), encoding };
  }

  function workbookSheets(workbook, XLSX) {
    return (workbook.SheetNames || []).map(name => ({ name, rows:XLSX.utils.sheet_to_json(workbook.Sheets[name], { header:1, raw:false, defval:'', blankrows:true }) }));
  }

  function chooseSheet(sheets, kind) {
    const candidates = [];
    (sheets || []).forEach(sheet => {
      const analysis = kind === 'tradein' ? (analyseTradeInComparison(sheet.rows, sheet.name) || analyseMatrix(sheet.rows, kind)) : analyseShoppingMatrix(sheet.rows, sheet.name);
      if (!analysis.errors.length) candidates.push({ name:sheet.name, analysis });
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
    const analysis = kind === 'shopping'
      ? combineShoppingAnalyses(sheets.map(sheet => analyseShoppingMatrix(sheet.rows, sheet.name)))
      : (chooseSheet(sheets, kind) || {}).analysis;
    if (!analysis) throw new Error('所有工作表都找不到可辨識的欄位列。');
    return Object.assign({}, analysis, { fileName:String(file.name || ''), fileType:fileType(extension, loaded.encoding), encoding:loaded.encoding, sheetName:analysis.sheetName || '', sheetCount:sheets.length });
  }

  return Object.freeze({ MAX_FILE_BYTES, SUPPORTED_EXTENSIONS, PREVIEW_LIMIT, NORMALIZED_PREVIEW_LIMIT, GRADE_ORDER, extensionOf, isSupported, recognizeHeader, gradeFromHeader, detectHeader, analyseMatrix, parseFile, colorlessModel });
});
