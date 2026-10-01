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
  const PARSER_VERSION = '2026.10.01-source-format-4';
  const PROVIDERS = Object.freeze(['點子行動','FutureDial（FDI）','愛鋒派']);
  const UNGRADED = '未分級';
  function providerGrades(provider){return provider==='愛鋒派'?GRADE_ORDER.concat(UNGRADED):GRADE_ORDER.slice();}
  const HEADER_ALIASES = Object.freeze([
    { key:'brand', label:'品牌', aliases:['品牌', '廠牌', '品牌名稱', 'brand', 'brand name'] },
    { key:'code', label:'商品代碼／料號', aliases:['代碼', '商品代碼', '產品代碼', 'code', 'item code'] },
    { key:'sku', label:'料號', aliases:['料號', 'sku', 'item no', 'item number'] },
    { key:'product', label:'商品名稱', aliases:['商品名稱', '商品', '品名', '品名item', '產品名稱', 'product name', 'item'] },
    { key:'model', label:'機型／型號', aliases:['機型', '型號', '模型', '商品型號', '產品型號', 'model', 'model name'] },
    { key:'sourceModel', label:'原始機型', aliases:['機款', '原始機型'] },
    { key:'category', label:'商品分類', aliases:['分類', '類別', '品類', '商品類別', '商品分類', '商品別', 'sim卡類別', 'SIM 卡類別', 'category'] },
    { key:'priceBand', label:'價格帶', aliases:['價格帶', '價位帶', 'price band'] },
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

  function numericPlanHeader(value) {
    return /^\d{3,4}(?:H(?:$|[^A-Za-z0-9])|專案|型|元|\s*[(（]\d+[)）])/i.test(text(value).normalize('NFKC'));
  }

  function recognizeHeader(value) {
    if(numericPlanHeader(value))return null;
    const source = normalized(headerWithoutGrade(value));
    if (!source) return null;
    for (const definition of HEADER_ALIASES) {
      if (definition.aliases.some(alias => source === normalized(alias))) return definition;
    }
    for (const definition of HEADER_ALIASES) {
      if (definition.aliases.some(alias => {
        const expected = normalized(alias);
        return definition.key !== 'code' && definition.key !== 'sourceModel' && expected.length >= 2 && source.includes(expected);
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
    return /^(?:NA|N\/A)$/i.test(text(value)) ? '' : text(value);
  }

  function isCurrency(value) {
    const source = text(value);
    return !source || /^(?:NA|N\/A)$/i.test(source) || /^-?[\d,]+(?:\.\d+)?$/.test(source.replace(/\s/g, ''));
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
        const priceHeaders=(gradeFields.get('tradeInPrice')||[]).concat(common.get('tradeInPrice')||[]);
        const ranges=Array.from(new Set(priceHeaders.map(field=>text(field.sourceName).match(/\d{1,2}[/.]\d{1,2}\s*[-~～至]\s*\d{1,2}[/.]\d{1,2}/)?.[0]).filter(Boolean)));
        if(!values.date&&ranges.length===1)values.date=ranges[0];
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
    return numericPlanHeader(value) || /(?:\d{3,4}H|\dG\)?|\b[45]G\b|榮耀|全開|iPhone|智能|專案|新復原者(?:年|月)繳型|預付卡平板加掛案|^(?:Entry\s+SD|中低階SD|中高階SD|高階SD|加碼機款)$)/i.test(text(value));
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
    const headerNames=fields.map(field=>normalized(field.sourceName));
    const catalogHeaders=['OP專案別','品牌','料號組合料號','品名','上架下架','是否搭專案'].map(normalized);
    const catalogSchemas=[catalogHeaders,['OP專案別','品牌','料號組合料號','品名','上架日','下架日','是否搭專案'].map(normalized)];
    const catalog=catalogSchemas.some(schema=>schema.length===headerNames.length&&schema.every(name=>headerNames.includes(name)));
    if(catalog){
      return Object.assign({},base,{sheetName:sheetName||'',rowType:'catalog',catalogRowCount:base.rawRows.length,catalogIssueCount:base.rawRows.filter(record=>['料號組合料號','品名'].some(header=>!firstValue(record.values,fields.filter(field=>normalized(field.sourceName)===normalized(header))))).length,unmappedNumericColumns:[],standardized:{mapping:base.fieldMapping,rows:[],summary:summaryForRows(base.rawRows.length,[]),previewRows:[]},acceptance:{rawDataRows:base.rawRows.length,validDataRows:0,success:0,partial:0,unrecognized:0,ignoredBlankRows:base.blankRowCount,duplicateRows:base.duplicateRowCount,invalidCurrencyCount:0}});
    }
    const unmappedNumericColumns=fields.filter(field=>!field.recognized&&!looksLikeProjectPriceField(field.sourceName)&&base.rawRows.some(record=>text(record.values[field.name])&&isCurrency(record.values[field.name]))).map(field=>field.sourceName);
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
        category:firstFieldValue(record, fields, 'category'), priceBand:firstFieldValue(record, fields, 'priceBand'), retailPrice:priceText(firstFieldValue(record, fields, 'retailPrice')), note:firstFieldValue(record, fields, 'note'), date:firstFieldValue(record, fields, 'date')
      };
      const projectPrices = {};
      fields.forEach(field => {
        if (field.recognized || !looksLikeProjectPriceField(field.sourceName)) return;
        const rawValue = text(record.values[field.name]);
        const group = planGroupName(matrix, base.headerRow, field.columnIndex);
        // field.name appends a duplicate-column ordinal. It is a display
        // identifier, not a tariff/contract condition, and changes on reorder.
        const key = (group ? group + '／' : '') + field.sourceName;
        const price = priceText(rawValue);
        if (Object.prototype.hasOwnProperty.call(projectPrices, key) && projectPrices[key] !== price) {
          throw new Error('相同完整方案條件有不同報價：' + key + '，請核對來源合併標題。');
        }
        projectPrices[key] = price;
        if (rawValue && !isCurrency(rawValue)) invalidCurrencyCount += 1;
      });
      if (values.retailPrice && !isCurrency(values.retailPrice)) invalidCurrencyCount += 1;
      const hasProjectPrice = Object.keys(projectPrices).some(name => text(projectPrices[name]));
      if (!values.retailPrice) missingRetailPriceCount += 1;
      if (!values.code && !values.model && !values.product && !values.retailPrice && !hasProjectPrice) {
        ignoredRows.push({ sourceRowNumber:record.rowNumber, reason:'缺少代碼、機型與商品名稱，保留原始列但未建立商品資料。' });
        return;
      }
      const issues = [];
      let status = 'success';
      if (!values.code || !values.model) { status = 'partial'; issues.push('缺少商品代碼或機型'); }
      if (!values.retailPrice && !hasProjectPrice) { status = 'partial'; issues.push('缺少單機價與所有專案價'); }
      normalizedRows.push({
        sourceRowNumber:record.rowNumber, sourceSheet:sheetName || '', grade:'', vendor:'', brand:values.brand, code:values.code, sku:'', sourceModel:values.model,
        model:values.model, colorlessModel:colorlessModel(values.model), product:values.product, category:values.category, priceBand:values.priceBand, retailPrice:priceText(values.retailPrice), tradeInPrice:'', note:values.note,
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
      sheetName:sheetName || '', rowType:'price', catalogRowCount:0, unmappedNumericColumns, recordCount:base.rawRows.length, unknownFields:fields.filter(field => !field.recognized && !looksLikeProjectPriceField(field.sourceName)).map(field => field.sourceName), fieldMapping:mapping, standardized:{ mapping, rows:normalizedRows, summary, previewRows:normalizedRows.slice(0, NORMALIZED_PREVIEW_LIMIT) }, warnings, ignoredRows, invalidCurrencyCount, missingRetailPriceCount,
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

  // The four-column source is a different layout from the legacy vendor matrix.
  // Product suffixes supply explicit identities; no grade/provider is guessed.
  function analyseTradeInFlat(matrix,sheetName){
    const base=analyseMatrix(matrix,'tradein');
    if(base.errors.length||base.fields.length!==4)return null;
    const fields=base.fields,sku=fields.find(field=>field.recognized?.key==='sku'),product=fields.find(field=>field.recognized?.key==='product'),price=fields.find(field=>field.recognized?.key==='tradeInPrice');
    const range=price&&text(price.sourceName).match(/\d{1,2}[/.]\d{1,2}\s*[-~～至]\s*\d{1,2}[/.]\d{1,2}/)?.[0];
    if(!sku||!product||!range)return null;
    const extra=fields.find(field=>![sku,product,price].includes(field));
    const noteColumn=extra&&(!text(extra.sourceName)||extra.recognized?.key==='note'||/未命名欄位/.test(extra.sourceName))&&base.rawRows.every(record=>!text(record.values[extra.name])||/^\d{1,2}[/.]\d{1,2}新增$/.test(text(record.values[extra.name])));
    const mapped=base.fieldMapping.map(field=>({...field}));
    mapped.push({sourceName:product.sourceName,key:'sourceModel',label:'原始機型（品名明確尾綴拆分）',grade:'',status:'mapped'});
    if(noteColumn){const field=mapped.find(field=>field.sourceName===extra.sourceName);Object.assign(field,{key:'note',label:'來源異動備註（無表頭欄）',status:'mapped'});}
    let invalidCurrencyCount=0;
    const rows=base.rawRows.map(record=>{
      const rawProduct=text(record.values[product.name]),rawPrice=text(record.values[price.name]);
      // A source typo can omit the closing old-device marker. Provider and
      // grade still require their complete, explicit suffix; raw text is kept.
      const graded=rawProduct.match(/^\(舊機\)?(.+?)_?\((點子|FDI|愛鋒派)\)_([SABC])等$/);
      const ungraded=rawProduct.match(/^\(舊機\)(.+)\(愛鋒派\)$/);
      const identity=graded?graded[1]:ungraded?ungraded[1]:'';
      const provider=graded?graded[2]:ungraded?'愛鋒派':'';
      const vendor=provider==='點子'?'點子行動':provider==='FDI'?'FutureDial（FDI）':provider;
      const grade=graded?graded[3]:ungraded?UNGRADED:'';
      const issues=[];
      if(!identity)issues.push('品名不符合已確認的機型尾綴格式');
      if(!PROVIDERS.includes(vendor))issues.push(vendor?'原檔回收商尚未納入既有正式查詢契約：'+vendor:'缺少明確回收商');
      if(!grade)issues.push('原檔未標示 S/A/B/C 等級，不自動補等級');
      if(!text(record.values[sku.name]))issues.push('缺少料號');
      if(!priceText(rawPrice))issues.push('缺少回收價');
      if(!isCurrency(rawPrice)){invalidCurrencyCount++;issues.push('非法回收價');}
      const brand=identity.match(/^([^\s_]+)\s+/)?.[1]||'';
      return {sourceRowNumber:record.rowNumber,sourceSheet:sheetName||'',grade,sourceGrade:graded?graded[3]:'',vendor,brand,code:'',sku:text(record.values[sku.name]),sourceModel:identity,model:identity,colorlessModel:colorlessModel(identity),product:rawProduct,category:'',retailPrice:'',tradeInPrice:priceText(rawPrice),note:noteColumn?text(record.values[extra.name]):'',store:'',date:range,promotion:'',sourceSyntaxWarnings:graded&&!rawProduct.startsWith('(舊機)')?['舊機前綴缺少右括號；依完整回收商與等級尾綴解析，原品名保留。']:[],status:issues.length?'partial':'success',issues,rawValues:record.values};
    });
    const summary=summaryForRows(base.rawRows.length,rows);
    return Object.assign({},base,{errors:noteColumn?base.errors:base.errors.concat('四欄來源的補充欄尚未確認為日期新增備註，保留原值並阻擋發布。'),sheetName:sheetName||'',rowType:'flat-product-quotes',fieldMapping:mapped,unknownFields:noteColumn?[]:[extra.sourceName],invalidCurrencyCount,sourceProviders:Array.from(new Set(rows.map(row=>row.vendor).filter(Boolean))),unmappedQuoteRows:rows.filter(row=>row.status!=='success').length,sourceNoteColumn:noteColumn?extra.name:null,standardized:{mapping:mapped,rows,summary,previewRows:rows.slice(0,NORMALIZED_PREVIEW_LIMIT)},acceptance:{rawModelRows:base.rawRows.length,expandedGradeRows:rows.length,invalidCurrencyCount,unrecognized:summary.unrecognized}});
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
        if (group.skuColumn >= 0 && !sku) missingSkuCount += 1;
        if (group.productColumn >= 0 && !product) missingProductCount += 1;
        if (!quote) missingQuoteCount += 1;
        if (quote && !isCurrency(quote)) invalidCurrencyCount += 1;
        const productGrade = gradeFromHeader(product);
        if (productGrade && productGrade !== group.grade) gradeMismatchCount += 1;
        if (/\bFDI\b/i.test(product) && !/FDI/i.test(group.vendor)) providerMismatchCount += 1;
        const issues = [];
        if (!originalModel) issues.push('缺少原始機型');
        if (!group.vendor) issues.push('無法辨識回收商');
        if (group.skuColumn >= 0 && !sku) issues.push('缺料號');
        if (group.productColumn >= 0 && !product) issues.push('缺品名');
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
    return { errors:[], warnings, sheetName:sheetName || '', recordCount:rawRows.length, fieldNames, fields, recognizedFields, unknownFields:fields.filter(field => !field.recognized).map(field => field.sourceName), previewRows:rawRows.slice(0, PREVIEW_LIMIT), rawRows, headerRow:layout.gradeHeaderRow, blankRowCount, partialRowCount:missingProductCount + missingSkuCount + missingQuoteCount, overflowRowCount:0, duplicateRowCount:duplicateRows, ignoredRows, invalidCurrencyCount, fieldMapping:mapping, standardized:{ mapping, rows:normalizedRows, summary, previewRows:normalizedRows.slice(0, NORMALIZED_PREVIEW_LIMIT) }, acceptance:{ rawModelRows:rawRows.length, expandedGradeRows:normalizedRows.length, gradeCounts, missingQuoteCount, missingSkuCount, missingProductCount, absentSkuColumnGroupCount:gradeGroups.filter(group => group.skuColumn < 0).length, absentProductColumnGroupCount:gradeGroups.filter(group => group.productColumn < 0).length, unrecognized:summary.unrecognized, skippedEmptyGradeCount, invalidCurrencyCount, gradeMismatchCount, providerMismatchCount, duplicateRows } };
  }

  function combineShoppingAnalyses(analyses) {
    const usable = analyses.filter(analysis => !analysis.errors.length && (analysis.standardized.rows.length || analysis.rowType==='catalog'));
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
      sheetSummaries.push({
        name:analysis.sheetName,
        rowType:analysis.rowType||'price',
        catalogRowCount:Number(analysis.catalogRowCount||0),
        rawDataRows:analysis.acceptance.rawDataRows,
        validDataRows:analysis.acceptance.validDataRows,
        success:analysis.acceptance.success,
        partial:analysis.acceptance.partial,
        invalidCurrencyCount:analysis.acceptance.invalidCurrencyCount,
        headerRow:analysis.headerRow,
        columnCount:analysis.sheetStructure && analysis.sheetStructure.columnCount || analysis.fieldNames.length,
        mergedRangeCount:analysis.sheetStructure && analysis.sheetStructure.mergedRangeCount || 0,
        mergedRangeSamples:analysis.sheetStructure && analysis.sheetStructure.mergedRangeSamples || []
      });
    });
    fieldNames.unshift('來源工作表');
    const summary = summaryForRows(rawRows.length, normalizedRows);
    acceptance.uniqueColorlessModels = new Set(normalizedRows.map(row => row.colorlessModel).filter(Boolean)).size;
    return Object.assign({}, usable[0], { sheetName:String(usable.length) + ' 個可解析工作表', sheetNames:usable.map(analysis => analysis.sheetName), sheetSummaries, catalogIssueCount:usable.reduce((sum,analysis)=>sum+Number(analysis.catalogIssueCount||0),0), catalogRowCount:usable.reduce((sum,analysis)=>sum+Number(analysis.catalogRowCount||0),0), unmappedNumericColumns:usable.flatMap(analysis=>(analysis.unmappedNumericColumns||[]).map(name=>analysis.sheetName+'／'+name)), fieldNames, rawRows, previewRows:rawRows.slice(0, PREVIEW_LIMIT), recordCount:rawRows.length, fieldMapping:mapping, standardized:{ mapping, rows:normalizedRows, summary, previewRows:normalizedRows.slice(0, NORMALIZED_PREVIEW_LIMIT) }, warnings, blankRowCount:acceptance.ignoredBlankRows, partialRowCount:acceptance.partial, duplicateRowCount:acceptance.duplicateRows, invalidCurrencyCount:acceptance.invalidCurrencyCount, acceptance });
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

  function columnName(columnIndex) {
    let index = columnIndex + 1;
    let name = '';
    while (index > 0) {
      const remainder = (index - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      index = Math.floor((index - 1) / 26);
    }
    return name;
  }

  function mergeRangeLabel(range) {
    if (!range || !range.s || !range.e) return '';
    const start = columnName(range.s.c) + String(range.s.r + 1);
    const end = columnName(range.e.c) + String(range.e.r + 1);
    return start === end ? start : start + ':' + end;
  }

  function sheetMetadata(sheet) {
    const rows = sheet.rows || [];
    const columnCount = rows.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0), 0);
    return {
      name:sheet.name,
      rowCount:rows.length,
      columnCount,
      mergedRangeCount:(sheet.mergedRanges || []).length,
      mergedRangeSamples:(sheet.mergedRanges || []).slice(0, 40)
    };
  }

  function workbookSheets(workbook, XLSX) {
    return (workbook.SheetNames || []).map(name => {
      const worksheet = workbook.Sheets[name] || {};
      return {
        name,
        rows:XLSX.utils.sheet_to_json(worksheet, { header:1, raw:false, defval:'', blankrows:true }),
        mergedRanges:(worksheet['!merges'] || []).map(mergeRangeLabel).filter(Boolean)
      };
    });
  }

  async function sha256Hex(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const browserCrypto = typeof globalThis !== 'undefined' && globalThis.crypto;
    if (browserCrypto && browserCrypto.subtle && typeof browserCrypto.subtle.digest === 'function') {
      const digest = await browserCrypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
    }
    if (typeof require === 'function') {
      return require('node:crypto').createHash('sha256').update(Buffer.from(bytes)).digest('hex');
    }
    return 'unavailable';
  }

  // Version newness comes only from one complete YYYYMMDD token in the chosen
  // source filename. Spreadsheet cell dates remain informational. Missing,
  // invalid, or competing tokens fail closed rather than being guessed.
  function sourceVersionDateFromFileName(value) {
    const tokens = Array.from(new Set(Array.from(text(value).matchAll(/(^|\D)(\d{8})(?=\D|$)/g), match => match[2])));
    if (tokens.length !== 1) return '';
    const token = tokens[0];
    const year = Number(token.slice(0, 4));
    const month = Number(token.slice(4, 6));
    const day = Number(token.slice(6, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 2000 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}` : '';
  }

  function chooseSheet(sheets, kind) {
    const candidates = [];
    (sheets || []).forEach(sheet => {
      const analysis = kind === 'tradein' ? (analyseTradeInComparison(sheet.rows, sheet.name) || analyseTradeInFlat(sheet.rows,sheet.name) || analyseMatrix(sheet.rows, kind)) : analyseShoppingMatrix(sheet.rows, sheet.name);
      if (!analysis.errors.length || analysis.rowType==='flat-product-quotes') candidates.push({ name:sheet.name, analysis });
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

  function present(value) {
    return Boolean(text(value));
  }

  function projectPricePresent(row) {
    return Object.keys(row && row.projectPrices || {}).some(key => present(row.projectPrices[key]));
  }

  function outcomeSummary(rows) {
    const summary = { success:0, partial:0, failed:0, unrecognized:0 };
    (rows || []).forEach(row => { summary[row.status] = (summary[row.status] || 0) + 1; });
    return summary;
  }

  function numberStats(values) {
    const result = {};
    Object.keys(values).forEach(key => { result[key] = Number(values[key] || 0); });
    return result;
  }

  function reportSchema(kind) {
    if (kind === 'tradein') {
      return {
        required:[
          { key:'sourceModel', label:'原始機型' },
          { key:'tradeInPrice', label:'回收價' }
        ],
        optional:[
          { key:'brand', label:'品牌' },
          { key:'sku', label:'料號' },
          { key:'product', label:'品名' },
          { key:'date', label:'資料日期' }
        ]
      };
    }
    return {
      required:[
        { key:'brand', label:'廠牌' },
        { key:'code', label:'商品代碼' },
        { key:'model', label:'機型' },
        { key:'retailOrProjectPrice', label:'單機價或至少一個專案價' }
      ],
      optional:[
        { key:'product', label:'商品／品名' },
        { key:'category', label:'SIM 卡類別／商品別' },
        { key:'priceBand', label:'價格帶' },
        { key:'note', label:'異動／備註' }
      ]
    };
  }

  function fieldPresent(row, key) {
    return key === 'retailOrProjectPrice'
      ? present(row && row.retailPrice) || projectPricePresent(row)
      : present(row && row[key]);
  }

  function mappingKeys(result) {
    return new Set((result.fieldMapping || []).map(field => field.key).filter(Boolean));
  }

  function missingMappings(kind, result, schema) {
    const keys = mappingKeys(result);
    return schema.required.filter(field => {
      if (field.key === 'retailOrProjectPrice') return !keys.has('retailPrice') && !keys.has('projectPrice');
      return !keys.has(field.key);
    }).map(field => field.label);
  }

  function fieldBlankStats(rows, fields) {
    const stats = {};
    fields.forEach(field => {
      stats[field.label] = (rows || []).filter(row => !fieldPresent(row, field.key)).length;
    });
    return stats;
  }

  function maskedExamples(rows, fields) {
    return (rows || []).filter(row => row.status !== 'success' || (row.issues || []).length).slice(0, 3).map(row => ({
      sourceRow:row.sourceRowNumber,
      result:row.status,
      issueCategories:(row.issues || []).slice(0, 4),
      fieldPresence:Object.fromEntries(fields.map(field => [field.label, fieldPresent(row, field.key) ? '有值' : '空白']))
    }));
  }

  function structuralFlags(result) {
    const names = (result.fieldNames || []).map(text);
    const duplicateGradeColumns = names.filter(name => /(?:[SABC](?:等級|級|等)?|[SABC]級)\s*[\)）]?\s*\(\d+\)$/i.test(name) || /[\(（][SABC](?:等級|級|等)?[\)）]\s*\(\d+\)$/i.test(name));
    const unnamedColumns = names.filter(name => /未命名欄位|原始補充欄位/.test(name) && name!==result.sourceNoteColumn);
    return {
      duplicateGradeColumnLabels:duplicateGradeColumns,
      unnamedColumnLabels:unnamedColumns,
      hasDuplicateGradeColumns:duplicateGradeColumns.length > 0,
      hasUnnamedColumns:unnamedColumns.length > 0
    };
  }

  function selectedStructures(result) {
    const selectedNames = result.selectedSourceSheets || result.sheetNames || (result.sheetName ? [result.sheetName] : []);
    const all = result.sheetMetadata || [];
    return all.filter(sheet => selectedNames.includes(sheet.name));
  }

  function reportSheets(result) {
    return (result.sheetMetadata || []).map(sheet => ({
      name:sheet.name,
      rowCount:Number(sheet.rowCount || 0),
      columnCount:Number(sheet.columnCount || 0),
      mergedRangeCount:Number(sheet.mergedRangeCount || 0),
      mergedRangeSamples:(sheet.mergedRangeSamples || []).slice(0, 40)
    }));
  }

  function shoppingNoPricePresentation(result) {
    const rows = result && result.standardized && result.standardized.rows || [];
    const excludedRows = rows.filter(row =>
      !(result && result.unmappedNumericColumns || []).length &&
      row.status === 'partial' &&
      present(row.brand) &&
      present(row.code) &&
      present(row.model) &&
      !present(row.retailPrice) &&
      !projectPricePresent(row)
    );
    const bySheet = new Map();
    excludedRows.forEach(row => {
      const name = text(row.sourceSheet) || '未提供工作表';
      const entry = bySheet.get(name) || { sheet:name, count:0, firstSourceRow:row.sourceRowNumber, lastSourceRow:row.sourceRowNumber };
      entry.count += 1;
      entry.firstSourceRow = Math.min(entry.firstSourceRow, row.sourceRowNumber);
      entry.lastSourceRow = Math.max(entry.lastSourceRow, row.sourceRowNumber);
      bySheet.set(name, entry);
    });
    return {
      sourceRows:Number(result && result.acceptance && result.acceptance.rawDataRows || rows.length),
      normalizedRows:rows.length,
      presentedRows:rows.filter(row => row.status === 'success').length,
      excludedNoPriceRows:excludedRows.length,
      excludedNoPriceBySheet:Array.from(bySheet.values()).sort((left, right) => left.sheet.localeCompare(right.sheet, 'zh-Hant')),
      excludedRows
    };
  }

  function shoppingPartialReady(result) {
    const presentation = shoppingNoPricePresentation(result);
    const remaining = (result && result.standardized && result.standardized.rows || []).filter(row => !presentation.excludedRows.includes(row));
    const remainingOutcomes = outcomeSummary(remaining);
    const schema = reportSchema('shopping');
    const missingRequiredMappings = missingMappings('shopping', result || {}, schema);
    const invalidCurrencyCount = Number(result && result.invalidCurrencyCount || 0);
    const duplicateRowCount = Number(result && result.duplicateRowCount || 0);
    const errors = result && result.errors || [];
    const ready = presentation.excludedNoPriceRows > 0 &&
      errors.length === 0 &&
      missingRequiredMappings.length === 0 &&
      remainingOutcomes.partial === 0 &&
      remainingOutcomes.failed === 0 &&
      remainingOutcomes.unrecognized === 0 &&
      invalidCurrencyCount === 0 &&
      !(result && result.unmappedNumericColumns || []).length &&
      !Number(result&&result.catalogIssueCount||0) &&
      duplicateRowCount === 0;
    return { ready, presentation, remainingOutcomes, missingRequiredMappings, invalidCurrencyCount, duplicateRowCount };
  }

  function buildAcceptanceReport(kind, result) {
    const rows = result && result.standardized && result.standardized.rows || [];
    const schema = reportSchema(kind);
    const requiredBlankCounts = fieldBlankStats(rows, schema.required);
    const optionalBlankCounts = fieldBlankStats(rows, schema.optional);
    const missingRequiredMappings = missingMappings(kind, result || {}, schema);
    const missingRequiredValues = Object.keys(requiredBlankCounts).filter(label => requiredBlankCounts[label] > 0);
    const outcomes = outcomeSummary(rows);
    const selectedSheets = selectedStructures(result || {});
    const sheetSummaries = result && result.sheetSummaries || [];
    const detectedHeaderRows = sheetSummaries.length
      ? sheetSummaries.map(sheet => ({ sheet:sheet.name, row:Number(sheet.headerRow || 0) + 1 }))
      : (result && result.sheetName ? [{ sheet:result.sheetName, row:Number(result.headerRow || 0) + 1 }] : []);
    const mergedRangeCount = selectedSheets.reduce((total, sheet) => total + Number(sheet.mergedRangeCount || 0), 0);
    const acceptance = result && result.acceptance || {};
    const flags = structuralFlags(result || {});
    const blockers = [];
    (result && result.errors || []).forEach(message => blockers.push(message));
    if (Number(result&&result.catalogIssueCount||0)) blockers.push('目錄列缺少料號或品名，需核對原始列。');
    if ((result && result.unmappedNumericColumns || []).length) blockers.push('仍有未對應的數值欄位，不能確認價格覆蓋：'+result.unmappedNumericColumns.join('、'));
    if (kind === 'tradein' && rows.some(row=>present(row.tradeInPrice)&&(!PROVIDERS.includes(row.vendor)||!providerGrades(row.vendor).includes(row.grade)||!present(row.sourceModel||row.model)))) blockers.push('原表報價尚未能完整對應機型、回收商與 S/A/B/C 等級；已保留原值，禁止產生空報價快照。');
    if (missingRequiredMappings.length) blockers.push('缺少必要欄位映射：' + missingRequiredMappings.join('、'));
    if (missingRequiredValues.length) blockers.push('必要欄位仍有空值：' + missingRequiredValues.join('、'));
    if (outcomes.partial) blockers.push('仍有 '+outcomes.partial+' 筆部分成功資料，需核對來源。');
    if (Number(result&&result.invalidCurrencyCount||0) || kind==='tradein'&&rows.some(row=>present(row.tradeInPrice)&&!isCurrency(row.tradeInPrice))) blockers.push('仍有非法價格值，禁止發布。');
    if (Number(result&&result.duplicateRowCount||0)) blockers.push('仍有重複來源列，需核對來源。');
    if (outcomes.failed) blockers.push('存在 ' + String(outcomes.failed) + ' 筆標準化失敗資料。');
    if (outcomes.unrecognized) blockers.push('存在 ' + String(outcomes.unrecognized) + ' 筆無法辨識資料。');
    if (kind === 'tradein' && Number(acceptance.unrecognized || 0)) blockers.push('至少一筆舊換新資料無法辨識回收商或原始機型。');
    if (kind === 'tradein' && flags.hasDuplicateGradeColumns) blockers.push('仍有 A／B／C／S 重複欄位標籤，需先確認欄位群組。');
    if (kind === 'tradein' && flags.hasUnnamedColumns) blockers.push('仍有未命名欄位，需先確認多列表頭結構。');
    const shoppingReadiness = kind === 'shopping' ? shoppingPartialReady(result) : null;
    const warnings = [];
    if (outcomes.partial) warnings.push('部分成功資料已保留在本機預覽；請依必要欄位統計判斷是否需要補檔。');
    if(kind==='tradein'&&result&&result.rowType==='flat-product-quotes'){
      const outside=rows.filter(row=>row.vendor&&!PROVIDERS.includes(row.vendor));
      const ungraded=rows.filter(row=>row.grade===UNGRADED);
      const syntax=rows.filter(row=>(row.sourceSyntaxWarnings||[]).length);
      if(outside.length)warnings.push(outside.length+' 筆原檔明確標示 '+Array.from(new Set(outside.map(row=>row.vendor))).join('、')+'，既有正式查詢尚未支援；原價保留，整份發布停用。');
      if(ungraded.length)warnings.push(ungraded.length+' 筆原品名未標示 S/A/B/C 等級，保留未分級且不自動補值。');
      if(syntax.length)warnings.push(syntax.length+' 筆舊機前綴缺少右括號，依完整回收商／等級尾綴解析；原品名與警示保留。');
    }
    if (Object.values(optionalBlankCounts).some(value => value > 0)) warnings.push('選填欄位空白只供檢查，不單獨視為阻擋。');
    if (Number(result && result.duplicateRowCount || 0)) warnings.push('偵測到重複資料列，未自動刪除。');
    if (shoppingReadiness && shoppingReadiness.presentation.excludedNoPriceRows) warnings.push('依目前不呈現規則，' + String(shoppingReadiness.presentation.excludedNoPriceRows) + ' 筆品牌、代碼與機型完整但所有價格皆空的資料不會出現在查詢結果。');
    const passed = blockers.length === 0;
    const partialReady = !passed && Boolean(shoppingReadiness && shoppingReadiness.ready);
    const acceptanceStatus = passed ? 'PASS' : (partialReady ? 'PARTIAL_READY' : 'BLOCKED');
    const base = {
      reportVersion:'local-import-acceptance/v1',
      generatedAt:new Date().toISOString(),
      parserVersion:PARSER_VERSION,
      source:{
        type:kind === 'tradein' ? '舊換新回收價資料' : '3C 購物通資料',
        file:{
          format:result && result.fileType || '未知',
          byteSize:Number(result && result.fileSize || 0),
          sha256:result && result.fileSha256 || 'unavailable'
        },
        workbookSheets:reportSheets(result || {}),
        selectedSourceSheets:result && (result.selectedSourceSheets || result.sheetNames) || (result && result.sheetName ? [result.sheetName] : []),
        detectedHeaderRows,
        selectedMergedCells:{ count:mergedRangeCount, ranges:selectedSheets.flatMap(sheet => sheet.mergedRangeSamples || []).slice(0, 40) }
      },
      fieldRecognition:{
        originalFieldNames:(result && result.fieldNames || []).slice(),
        mapping:(result && result.fieldMapping || []).map(field => ({ originalField:field.sourceName, normalizedField:field.label || null, key:field.key || null, vendor:field.vendor || null, grade:field.grade || null, result:field.status })),
        missingRequiredMappings,
        requiredValueBlankCounts:requiredBlankCounts,
        optionalValueBlankCounts:optionalBlankCounts
      },
      rowOutcomes:outcomes,
      dataQuality:{
        catalogRows:Number(result&&result.catalogRowCount||0),
        unmappedNumericColumns:(result&&result.unmappedNumericColumns||[]).slice(),
        fullyBlankRows:Number(result && result.blankRowCount || 0),
        duplicateRows:Number(result && result.duplicateRowCount || 0),
        invalidCurrencyValues:Number(result && result.invalidCurrencyCount || 0),
        ignoredRows:Number(result && result.ignoredRows && result.ignoredRows.length || 0),
        maskedExamples:maskedExamples(rows, schema.required.concat(schema.optional))
      },
      acceptance:{
        passed,
        status:acceptanceStatus,
        publishEligible:passed || partialReady,
        blockers:partialReady ? [] : blockers,
        warnings,
        nextStep:passed ? '可複製本去識別化報告回傳進行下一步 review；原始檔仍只留在本機瀏覽器。' : (partialReady ? '有價格資料可依不呈現規則進入候選發布 review；無價格資料仍保留在稽核統計中。' : '保留原始檔，先核對未辨識欄位與報價對應；不要改欄名或補猜價格。')
      },
      presentation:kind === 'shopping' ? {
        rule:'單機價與所有專案價皆空時，不納入門市查詢；0 視為有效價格。',
        sourceRows:shoppingReadiness.presentation.sourceRows,
        normalizedRows:shoppingReadiness.presentation.normalizedRows,
        presentedRows:shoppingReadiness.presentation.presentedRows,
        excludedNoPriceRows:shoppingReadiness.presentation.excludedNoPriceRows,
        excludedNoPriceBySheet:shoppingReadiness.presentation.excludedNoPriceBySheet.map(entry => ({ sheet:entry.sheet, count:entry.count, firstSourceRow:entry.firstSourceRow, lastSourceRow:entry.lastSourceRow }))
      } : null,
      privacyBoundary:{
        processing:'僅在目前瀏覽器記憶體內解析；重新整理後消失。',
        included:'檔案格式、大小與 SHA-256、工作表結構、表頭與欄位 mapping、彙總計數、來源列號與遮罩範例。',
        excluded:'檔名、原始資料列、完整商品名稱、料號、精確價格、完整價格表，以及任何自動上傳、追蹤或瀏覽器持久化資料。'
      }
    };
    if (kind === 'shopping') {
      base.shopping = {
        sheetRecordCounts:(result && result.sheetSummaries || []).map(sheet => ({ sheet:sheet.name, rawDataRows:Number(sheet.rawDataRows || 0), validDataRows:Number(sheet.validDataRows || 0) })),
        recognizedFields:(result && result.recognizedFields || []).map(field => field.label),
        standardizationSuccess:Number(acceptance.success || outcomes.success),
        partial:Number(acceptance.partial || outcomes.partial),
        missingRetailPrice:Number(acceptance.missingRetailPriceCount || 0),
        uniqueColorlessModels:Number(acceptance.uniqueColorlessModels || 0)
      };
    } else {
      const knownProviders = Array.from(new Set(rows.map(row => row.vendor).filter(provider => PROVIDERS.includes(provider))));
      base.tradeIn = {
        sourceProviders:(result&&result.sourceProviders||knownProviders).slice(),
        unmappedQuoteRows:Number(result&&result.unmappedQuoteRows||0),
        providerCount:knownProviders.length,
        providers:knownProviders,
        rawModelRows:Number(acceptance.rawModelRows || result && result.recordCount || 0),
        longFormatRows:Number(acceptance.expandedGradeRows || rows.length),
        gradeCounts:numberStats(rows.reduce((counts,row)=>{if(row.grade)counts[row.grade]=(counts[row.grade]||0)+1;return counts;},{})),
        missingSku:Number(acceptance.missingSkuCount || 0),
        missingQuote:Number(acceptance.missingQuoteCount || 0),
        missingProduct:Number(acceptance.missingProductCount || 0),
        absentSkuColumnGroups:Number(acceptance.absentSkuColumnGroupCount || 0),
        absentProductColumnGroups:Number(acceptance.absentProductColumnGroupCount || 0),
        unrecognized:Number(acceptance.unrecognized || outcomes.unrecognized),
        columnStructureFlags:flags
      };
    }
    return base;
  }

  function candidateVersion(result) {
    const hash = text(result && result.fileSha256);
    return hash && hash !== 'unavailable' ? 'local-candidate-' + hash.slice(0, 12) : 'local-candidate-unhashed';
  }

  function candidateSourceDates(rows) {
    return Array.from(new Set((rows || []).map(row => text(row.date)).filter(Boolean))).sort();
  }

  function candidateMetadata(kind, result) {
    const report = buildAcceptanceReport(kind, result);
    const internalSourceDates = candidateSourceDates(result && result.standardized && result.standardized.rows);
    const sourceVersionDate = text(result && result.sourceVersionDate) || sourceVersionDateFromFileName(result && result.fileName);
    const metadata = {
      version:candidateVersion(result),
      sourceVersionDate,
      sourceDateLabel:sourceVersionDate || '來源檔名日期無效',
      internalSourceDates,
      parsedAt:text(result && result.parsedAt),
      acceptanceStatus:report.acceptance.status,
      blockers:report.acceptance.blockers.slice(),
      warnings:report.acceptance.warnings.slice(),
      presentation:report.presentation,
      publication:{
        disabled:!report.acceptance.publishEligible,
        status:report.acceptance.publishEligible ? report.acceptance.status : 'BLOCKED',
        reason:report.acceptance.publishEligible ? (report.acceptance.status === 'PARTIAL_READY' ? '有價格資料可候選發布；無任何價格的商品不會呈現。' : '完整驗收通過，可進入候選發布 review。') : '驗收未通過，正式發布已停用。'
      }
    };
    if (!sourceVersionDate) {
      metadata.acceptanceStatus = 'BLOCKED';
      metadata.blockers.unshift('來源檔名必須且只能包含一個有效 YYYYMMDD 版本日期。');
      metadata.publication = { disabled:true, status:'BLOCKED', reason:'來源檔名日期缺失、無效或不唯一，正式發布已停用。' };
    }
    return metadata;
  }

  function buildPublishSnapshot(kind, result) {
    const candidate = buildPrepublishCandidate(kind, result);
    const metadata = candidate.metadata || {};
    if (metadata.publication && metadata.publication.disabled) throw new Error('候選未通過發布 gate。');
    if (!metadata.sourceVersionDate) throw new Error('來源檔名版本日期無效。');
    const standardizedRows = result && result.standardized && result.standardized.rows || [];
    const presentation = kind === 'shopping' ? shoppingNoPricePresentation(result) : null;
    const rows = kind === 'tradein'
      ? candidate.rows.map(row => ({ source_sheet:text(row.sourceSheet), brand:text(row.brand), model:text(row.model), quotes:row.quotes || {} }))
      : standardizedRows.filter(row => row.status === 'success').map(row => ({
          source_sheet:text(row.sourceSheet),
          source_row_number:Number(row.sourceRowNumber || 0),
          brand:text(row.brand),
          code:text(row.code),
          model:text(row.model),
          colorless_model:text(row.colorlessModel),
          retail_price:text(row.retailPrice),
          project_prices:sortedObject(row.projectPrices || {})
        }));
    return {
      schema_version:'threec-normalized-snapshot/v1',
      kind:kind === 'tradein' ? 'tradein' : 'shopping',
      source_version_date:metadata.sourceVersionDate,
      source_file_name:text(result && result.fileName),
      source_file_sha256:text(result && result.fileSha256),
      parser_version:PARSER_VERSION,
      internal_source_dates:metadata.internalSourceDates || [],
      source_row_count:Number(result && result.recordCount || standardizedRows.length),
      row_count:rows.length,
      excluded_no_price_count:presentation ? Number(presentation.excludedNoPriceRows || 0) : 0,
      query_model_count:kind === 'shopping' ? candidate.rows.filter(row => !row.priceMatrixConflict).length : candidate.rows.length,
      quote_conflict_count:kind === 'tradein' ? Number(candidate.quoteConflictCount || 0) : 0,
      ...(kind==='shopping'&&result.catalogRowCount?{catalog_row_count:Number(result.catalogRowCount)}:{}),
      rows
    };
  }

  function priceMatrixSignature(row) {
    const projectPrices = row && row.projectPrices || {};
    return JSON.stringify({
      retailPrice:text(row && row.retailPrice),
      projectPrices:Object.keys(projectPrices).sort().map(key => [key, text(projectPrices[key])])
    });
  }

  function sortedObject(values) {
    return Object.fromEntries(Object.keys(values || {}).sort((left, right) => left.localeCompare(right, 'zh-Hant')).map(key => [key, values[key]]));
  }

  function buildShoppingCandidate(result) {
    const rows = result && result.standardized && result.standardized.rows || [];
    const groups = new Map();
    rows.filter(row => row.status === 'success' && row.brand && row.colorlessModel).forEach(row => {
      const key = [row.sourceSheet, row.brand, row.colorlessModel].join('\u0001');
      const entry = groups.get(key) || {
        sourceSheet:row.sourceSheet,
        brand:row.brand,
        model:row.colorlessModel,
        variants:new Set(),
        matrices:new Map()
      };
      entry.variants.add(text(row.model));
      const signature = priceMatrixSignature(row);
      if (!entry.matrices.has(signature)) {
        entry.matrices.set(signature, {
          retailPrice:text(row.retailPrice),
          projectPrices:sortedObject(row.projectPrices || {})
        });
      }
      groups.set(key, entry);
    });
    const candidateRows = Array.from(groups.values()).map(entry => {
      const matrices = Array.from(entry.matrices.values());
      const conflict = matrices.length > 1;
      const matrix = conflict ? null : (matrices[0] || { retailPrice:'', projectPrices:{} });
      return {
        sourceSheet:entry.sourceSheet,
        brand:entry.brand,
        model:entry.model,
        colorVariantCount:entry.variants.size,
        priceMatrixConflict:conflict,
        retailPrice:matrix ? matrix.retailPrice : '',
        projectPrices:matrix ? matrix.projectPrices : {}
      };
    }).sort((left, right) => left.brand.localeCompare(right.brand, 'zh-Hant') || left.model.localeCompare(right.model, 'zh-Hant') || left.sourceSheet.localeCompare(right.sourceSheet, 'zh-Hant'));
    const usableRows = candidateRows.filter(row => !row.priceMatrixConflict);
    const plans = Array.from(new Set(usableRows.flatMap(row => Object.keys(row.projectPrices)))).sort((left, right) => left.localeCompare(right, 'zh-Hant'));
    const metadata = candidateMetadata('shopping', result);
    const priceMatrixConflictCount = candidateRows.filter(row => row.priceMatrixConflict).length;
    if (priceMatrixConflictCount) {
      metadata.acceptanceStatus = 'BLOCKED';
      metadata.blockers.push('去色後存在 ' + String(priceMatrixConflictCount) + ' 組價格矩陣不一致。');
      metadata.publication = { disabled:true, status:'BLOCKED', reason:'價格矩陣不一致，正式發布已停用。' };
    }
    return {
      kind:'shopping',
      metadata,
      rows:candidateRows,
      brands:Array.from(new Set(candidateRows.map(row => row.brand))).sort((left, right) => left.localeCompare(right, 'zh-Hant')),
      sourceSheets:Array.from(new Set(candidateRows.map(row => row.sourceSheet))).sort((left, right) => left.localeCompare(right, 'zh-Hant')),
      plans,
      priceMatrixConflictCount,
      eligibleRowCount:rows.filter(row => row.status === 'success').length
    };
  }

  function candidateSearchText(row) {
    return [row.brand, row.model, row.sourceSheet].map(value => text(value).toLocaleLowerCase('zh-Hant')).join('\u0001');
  }

  function filterShoppingCandidate(candidate, filters) {
    const criteria = filters || {};
    const query = text(criteria.query).toLocaleLowerCase('zh-Hant');
    const brand = text(criteria.brand);
    const sourceSheet = text(criteria.sourceSheet);
    const plan = text(criteria.plan);
    return (candidate && candidate.rows || []).filter(row =>
      !row.priceMatrixConflict &&
      (!brand || row.brand === brand) &&
      (!sourceSheet || row.sourceSheet === sourceSheet) &&
      (!query || candidateSearchText(row).includes(query)) &&
      (!plan || Object.prototype.hasOwnProperty.call(row.projectPrices, plan))
    ).map(row => Object.assign({}, row, {
      selectedPlan:plan,
      selectedPlanPrice:plan ? text(row.projectPrices[plan]) : ''
    }));
  }

  function emptyQuotes(providers) {
    return Object.fromEntries(providers.map(vendor => [vendor, Object.fromEntries(providerGrades(vendor).map(grade => [grade, null]))]));
  }

  function buildTradeInCandidate(result) {
    const rows = result && result.standardized && result.standardized.rows || [];
    const groups = new Map();
    const providers=PROVIDERS.filter(provider=>provider!=='愛鋒派'||rows.some(row=>row.vendor===provider));
    rows.filter(row => row.status === 'success' && (row.sourceModel || row.model)).forEach(row => {
      const model = row.colorlessModel || row.sourceModel || row.model;
      const key = [row.sourceSheet, row.brand, model].join('\u0001');
      const entry = groups.get(key) || { sourceSheet:row.sourceSheet, brand:row.brand, model, quotes:emptyQuotes(providers), quoteConflicts:[] };
      if (entry.quotes[row.vendor] && providerGrades(row.vendor).includes(row.grade)) {
        const current = entry.quotes[row.vendor][row.grade];
        const quote = text(row.tradeInPrice);
        if (current != null && current !== quote) entry.quoteConflicts.push(row.vendor + '／' + row.grade);
        else entry.quotes[row.vendor][row.grade] = quote;
      }
      groups.set(key, entry);
    });
    const candidateRows = Array.from(groups.values()).map(entry => ({
      sourceSheet:entry.sourceSheet,
      brand:entry.brand,
      model:entry.model,
      quotes:entry.quotes,
      quoteConflicts:Array.from(new Set(entry.quoteConflicts)).sort()
    })).sort((left, right) => left.brand.localeCompare(right.brand, 'zh-Hant') || left.model.localeCompare(right.model, 'zh-Hant') || left.sourceSheet.localeCompare(right.sourceSheet, 'zh-Hant'));
    const metadata=candidateMetadata('tradein',result);
    const quoteConflictCount=candidateRows.filter(row=>row.quoteConflicts.length).length;
    if(quoteConflictCount){
      metadata.acceptanceStatus='BLOCKED';
      metadata.blockers.push('同機型、回收商與等級存在 '+quoteConflictCount+' 組不同報價，需核對來源。');
      metadata.publication={disabled:true,status:'BLOCKED',reason:'同條件報價衝突，正式發布已停用。'};
    }
    return {
      kind:'tradein',
      metadata,
      rows:candidateRows,
      brands:Array.from(new Set(candidateRows.map(row => row.brand).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'zh-Hant')),
      sourceSheets:Array.from(new Set(candidateRows.map(row => row.sourceSheet))).sort((left, right) => left.localeCompare(right, 'zh-Hant')),
      providers,
      eligibleRowCount:rows.filter(row => row.status === 'success').length,
      quoteConflictCount
    };
  }

  function filterTradeInCandidate(candidate, filters) {
    const criteria = filters || {};
    const query = text(criteria.query).toLocaleLowerCase('zh-Hant');
    const brand = text(criteria.brand);
    const sourceSheet = text(criteria.sourceSheet);
    return (candidate && candidate.rows || []).filter(row =>
      (!brand || row.brand === brand) &&
      (!sourceSheet || row.sourceSheet === sourceSheet) &&
      (!query || candidateSearchText(row).includes(query)) &&
      (!criteria.provider || Object.values(row.quotes[criteria.provider]||{}).some(value=>value!=null&&text(value)!=='')) &&
      (!criteria.grade || (criteria.provider?[criteria.provider]:candidate.providers).some(provider=>row.quotes[provider]&&row.quotes[provider][criteria.grade]!=null&&text(row.quotes[provider][criteria.grade])!==''))
    );
  }

  function buildPrepublishCandidate(kind, result) {
    return kind === 'tradein' ? buildTradeInCandidate(result) : buildShoppingCandidate(result);
  }

  async function parseFile(file, XLSX, kind) {
    if (!XLSX || typeof XLSX.read !== 'function') throw new Error('本機 SheetJS 解析器未載入，請重新整理後再試。');
    const extension = extensionOf(file);
    if (!isSupported(file)) throw new Error('只支援 XLSX、XLS、CSV 或 TSV 檔案。');
    if (!file.size) throw new Error('檔案是空的，請重新匯出後再試。');
    if (file.size > MAX_FILE_BYTES) throw new Error('檔案超過 20 MB，請先縮小範圍後再試。');
    const buffer = await file.arrayBuffer();
    const loaded = readWorkbook(buffer, extension, XLSX);
    const fileSha256 = await sha256Hex(buffer);
    const sheets = workbookSheets(loaded.workbook, XLSX);
    const shoppingAnalyses = kind === 'shopping' ? sheets.map(sheet => Object.assign(analyseShoppingMatrix(sheet.rows, sheet.name), { sheetStructure:sheetMetadata(sheet) })) : [];
    const selected = kind === 'tradein' ? chooseSheet(sheets, kind) : null;
    const analysis = kind === 'shopping'
      ? combineShoppingAnalyses(shoppingAnalyses)
      : selected && selected.analysis;
    if (!analysis) throw new Error('所有工作表都找不到可辨識的欄位列。');
    const selectedSourceSheets = kind === 'shopping'
      ? shoppingAnalyses.filter(item => !item.errors.length && item.standardized && (item.standardized.rows.length||item.rowType==='catalog')).map(item => item.sheetName)
      : [selected.name];
    const sheetSummaries = analysis.sheetSummaries || [{
      name:analysis.sheetName,
      headerRow:analysis.headerRow,
      columnCount:(analysis.sheetStructure || {}).columnCount || analysis.fieldNames.length,
      mergedRangeCount:(analysis.sheetStructure || {}).mergedRangeCount || 0,
      mergedRangeSamples:(analysis.sheetStructure || {}).mergedRangeSamples || []
    }];
    return Object.assign({}, analysis, {
      fileName:String(file.name || ''),
      sourceVersionDate:sourceVersionDateFromFileName(file && file.name),
      fileType:fileType(extension, loaded.encoding),
      fileSize:Number(file.size || 0),
      fileSha256,
      parsedAt:new Date().toISOString(),
      encoding:loaded.encoding,
      sheetName:analysis.sheetName || '',
      sheetCount:sheets.length,
      sheetMetadata:sheets.map(sheetMetadata),
      selectedSourceSheets,
      sheetSummaries
    });
  }

  return Object.freeze({ MAX_FILE_BYTES, SUPPORTED_EXTENSIONS, PREVIEW_LIMIT, NORMALIZED_PREVIEW_LIMIT, GRADE_ORDER, PROVIDERS, UNGRADED, providerGrades, PARSER_VERSION, extensionOf, isSupported, recognizeHeader, gradeFromHeader, detectHeader, analyseMatrix, parseFile, buildAcceptanceReport, buildPrepublishCandidate, buildPublishSnapshot, buildShoppingPresentation:shoppingNoPricePresentation, buildShoppingCandidate, filterShoppingCandidate, buildTradeInCandidate, filterTradeInCandidate, sourceVersionDateFromFileName, colorlessModel });
});
