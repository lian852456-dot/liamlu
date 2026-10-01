(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DepartmentGoldMonthlyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const SCHEMA = 'north12-department-gold-month/v2';
  const REGIONS = ['北一二A', '北一二B', '北一二C', '北一二D'];
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, '').trim();
  const label = v => String(v == null ? '' : v).trim();
  const fail = code => { throw new Error(code); };
  function date(value) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value || '')) fail('DATE_INVALID');
    const d = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail('DATE_INVALID');
    return value;
  }
  function dateRange(value) {
    const m = label(value).match(/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\s*[~～至–-]\s*(?:(20\d{2})[/-])?(\d{1,2})[/-](\d{1,2})/);
    if (!m) fail('SOURCE_DATE_MISSING');
    const iso = (y, mo, d) => date(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    const start = iso(m[1], m[2], m[3]), end = iso(m[4] || m[1], m[5], m[6]);
    if (start > end || start.slice(0, 7) !== end.slice(0, 7)) fail('SOURCE_MONTH_CONFLICT');
    return { start, end, cutoff: end };
  }
  function numeric(v) {
    if (v === '' || v == null || typeof v === 'boolean') fail('GOLD_VALUE_MISSING');
    const n = Number(typeof v === 'string' ? v.replace(/,/g, '') : v);
    if (!Number.isFinite(n) || Math.abs(n) > 10000) fail('GOLD_VALUE_INVALID');
    return n;
  }
  function quarter(key) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(key || '')) fail('MONTH_INVALID');
    return `${key.slice(0, 4)}-Q${Math.ceil(Number(key.slice(5)) / 3)}`;
  }
  function quarterMonths(q) {
    const m = String(q).match(/^(20\d{2})-Q([1-4])$/);
    if (!m) fail('QUARTER_INVALID');
    return Array.from({length:3}, (_, i) => `${m[1]}-${String((Number(m[2]) - 1) * 3 + i + 1).padStart(2,'0')}`);
  }
  function summarize(records) {
    const regions = Object.fromEntries(REGIONS.map(r => [r, {people:0, stores:0, total:0}]));
    const stores = new Map();
    for (const r of records) {
      const s = stores.get(r.storeCode) || {region:r.region, store:r.store, storeCode:r.storeCode, people:0, total:0};
      if (s.region !== r.region || s.store !== r.store) fail('STORE_REGION_CONFLICT');
      s.people++; s.total += r.medal; stores.set(r.storeCode, s);
      regions[r.region].people++; regions[r.region].total += r.medal;
    }
    for (const s of stores.values()) regions[s.region].stores++;
    return {people:records.length, stores:stores.size, total:records.reduce((s,r)=>s+r.medal,0), regions, storeRows:Array.from(stores.values())};
  }
  function validateMonth(m) {
    if (!m || m.schema !== SCHEMA) fail('MONTH_SCHEMA_INVALID');
    quarter(m.monthKey);
    const dr = m.dateRange || {};
    date(dr.start); date(dr.end); date(dr.cutoff);
    if (dr.start > dr.end || dr.end !== dr.cutoff || dr.start.slice(0,7) !== m.monthKey || dr.end.slice(0,7) !== m.monthKey) fail('SOURCE_MONTH_CONFLICT');
    if (!['provisional','final'].includes(m.settlementStatus)) fail('SETTLEMENT_INVALID');
    if (m.settlementStatus === 'final' && m.finalConfirmed !== true) fail('FINAL_CONFIRMATION_REQUIRED');
    if (!/^[a-f0-9]{64}$/.test(m.sourceHash || '')) fail('SOURCE_HASH_INVALID');
    if (!Array.isArray(m.records) || !m.records.length || m.records.length > 1000) fail('RECORD_COUNT_INVALID');
    const seen = new Set();
    const records = m.records.map(r => {
      const employeeId = label(r.employeeId).toUpperCase();
      if (!/^[A-Z0-9]{5,12}$/.test(employeeId)) fail('EMPLOYEE_ID_INVALID');
      if (seen.has(employeeId)) fail('EMPLOYEE_DUPLICATE');
      seen.add(employeeId);
      if (!REGIONS.includes(r.region) || !label(r.storeCode) || !label(r.store) || !label(r.employeeName)) fail('IDENTITY_MISSING');
      for (const k of ['storeCode','store','employeeName','role']) if (label(r[k]).length > 80) fail('TEXT_TOO_LONG');
      if (!Number.isFinite(Number(r.sourceRow)) || r.sourceRow < 1) fail('SOURCE_ROW_INVALID');
      const sourceFields = r.sourceFields || [];
      if (!Array.isArray(sourceFields) || sourceFields.length > 256 || JSON.stringify(sourceFields).length > 30000) fail('SOURCE_FIELDS_INVALID');
      return {employeeId, employeeName:label(r.employeeName), region:r.region, storeCode:label(r.storeCode), store:label(r.store), role:label(r.role), medal:numeric(r.medal), sourceRow:r.sourceRow, sourceFields};
    });
    const summary = summarize(records), sourceTotal = Number(m.validation && m.validation.sourceTotal);
    if ((m.validation?.sourceTotal == null || m.validation?.sourceTotal === '') || !Number.isFinite(sourceTotal)) fail('SOURCE_TOTAL_MISSING');
    if (Math.abs(sourceTotal - summary.total) > 1e-8) fail('SOURCE_TOTAL_MISMATCH');
    if (!label(m.sheetName) || label(m.sheetName).length > 80 || label(m.sourceName).length > 180) fail('SOURCE_LABEL_INVALID');
    return {schema:SCHEMA, monthKey:m.monthKey, sheetName:label(m.sheetName), sourceName:label(m.sourceName), sourceHash:m.sourceHash, dateRange:{...dr}, settlementStatus:m.settlementStatus, finalConfirmed:m.finalConfirmed === true, templateId:label(m.templateId || 'staff-mobilization-v1'), mapping:m.mapping || {}, warnings:Array.isArray(m.warnings)?m.warnings.slice(0,30).map(label):[], records, validation:{sourceTotal, ...summary}};
  }
  function parseSheet(sheet, sheetName, XLSX, options) {
    const rows = XLSX.utils.sheet_to_json(sheet,{header:1, raw:true, defval:null});
    const header = rows.findIndex((r,i)=>i<30 && r.some(v=>clean(v)==='員編') && r.some(v=>clean(v)==='督導區') && r.some(v=>clean(v)==='員工姓名'));
    if (header < 0) return null;
    const unique = title => {
      const cols = rows[header].flatMap((v,i)=>clean(v)===title?[i]:[]);
      if (cols.length !== 1) fail('HEADER_AMBIGUOUS');
      return cols[0];
    };
    const mapping = {region:unique('督導區'), storeCode:unique('營業店點代碼'), store:unique('服務中心'), role:unique('店內職稱'), employeeId:unique('員編'), employeeName:unique('員工姓名')};
    const dates = rows.slice(0,header+1).flatMap((r,i)=>r.flatMap((v,c)=>typeof v==='string' && /資料日期/.test(v)?[{i,c,value:v}]:[]));
    if (dates.length !== 1) fail('SOURCE_DATE_AMBIGUOUS');
    const dr = dateRange(dates[0].value), top = dates[0].i;
    const candidates = rows[top].flatMap((v,c)=>clean(v)==='SPE加分總計' && clean(rows[top][c+1])==='金牌'?[c+1]:[]);
    if (candidates.length !== 1) fail('PRIMARY_GOLD_AMBIGUOUS');
    mapping.medal = candidates[0];
    // The main gold header shares the identity block's top row. Activity columns
    // and the copied totals on the right are evidence only, never summed.
    if (mapping.medal <= Math.max(...Object.values(mapping).filter(v=>v!==mapping.medal))) fail('PRIMARY_GOLD_AMBIGUOUS');
    const title = rows.slice(0,header+1).flat().map(label).find(v=>/Y\d{2}\/\d{1,2}_北一二/.test(v));
    if (title) {const match=title.match(/Y(\d{2})\/(\d{1,2})/);if (`20${match[1]}-${match[2].padStart(2,'0')}`!==dr.start.slice(0,7)) fail('SOURCE_MONTH_CONFLICT');}
    const keyCols = new Set(Object.values(mapping));
    const headerPath = c => Array.from(new Set(rows.slice(top,header+1).map(r=>label(r[c])).filter(Boolean))).join('／');
    const records = [], totals = [];
    for (let i=header+1;i<rows.length;i++) {
      const row=rows[i], region=clean(row[mapping.region]);
      if (region==='北一二' && !label(row[mapping.employeeId]) && !label(row[mapping.storeCode]) && row[mapping.medal]!=null) totals.push(numeric(row[mapping.medal]));
      if (!REGIONS.includes(region)) {if (label(row[mapping.employeeId])) fail('UNKNOWN_REGION');continue;}
      const cell=sheet[XLSX.utils.encode_cell({r:i,c:mapping.medal})];
      if (cell && cell.f) fail('PRIMARY_GOLD_FORMULA');
      records.push({region, storeCode:label(row[mapping.storeCode]),store:label(row[mapping.store]),role:label(row[mapping.role]),employeeId:label(row[mapping.employeeId]),employeeName:label(row[mapping.employeeName]),medal:numeric(row[mapping.medal]),sourceRow:i+1,sourceFields:row.flatMap((v,c)=>!keyCols.has(c)&&v!=null&&v!==''?[{column:XLSX.utils.encode_col(c),header:headerPath(c),value:v}]:[])});
    }
    if (totals.length!==1) fail('SOURCE_TOTAL_AMBIGUOUS');
    return validateMonth({schema:SCHEMA,monthKey:dr.start.slice(0,7),sheetName,sourceName:options.sourceName,sourceHash:options.sourceHash,dateRange:dr,settlementStatus:'provisional',finalConfirmed:false,templateId:'staff-mobilization-v1',mapping:Object.fromEntries(Object.entries(mapping).map(([k,c])=>[k,XLSX.utils.encode_col(c)])),records,validation:{sourceTotal:totals[0]},warnings:['僅採全員主表淨金牌；活動欄、PK與SPE保留來源，不額外計算。']});
  }
  function parseWorkbook(wb, XLSX, options) {
    if (!wb || !Array.isArray(wb.SheetNames)) fail('WORKBOOK_INVALID');
    const months=wb.SheetNames.filter(n=>/全員/.test(n)).map(n=>parseSheet(wb.Sheets[n],n,XLSX,options)).filter(Boolean);
    if (!months.length) fail('STAFF_SHEET_MISSING');
    const seen=new Set(); for(const m of months){if(seen.has(m.monthKey))fail('MONTH_DUPLICATE');seen.add(m.monthKey);}
    return months.sort((a,b)=>a.monthKey.localeCompare(b.monthKey));
  }
  function diff(before, after) {
    const a=new Map((before?.records||[]).map(r=>[r.employeeId,r])), b=new Map((after?.records||[]).map(r=>[r.employeeId,r]));
    return Array.from(new Set([...a.keys(),...b.keys()])).flatMap(id=>{
      const prev=a.get(id), next=b.get(id);
      const changed=!prev||!next||['medal','region','storeCode','store','employeeName','role'].some(k=>prev[k]!==next[k]);
      return changed?[{employeeId:id,employeeName:(next||prev).employeeName,type:!prev?'added':!next?'removed':'changed',before:prev||null,after:next||null,delta:prev&&next?next.medal-prev.medal:null}]:[];
    });
  }
  function aggregate(months, expectedMonths, filters) {
    const seen=new Set(), map=new Map();
    for(const m of months){if(seen.has(m.monthKey))fail('MONTH_DUPLICATE');seen.add(m.monthKey);for(const r of m.records){
      const p=map.get(r.employeeId)||{employeeId:r.employeeId,employeeName:r.employeeName,total:0,months:Object.fromEntries(expectedMonths.map(k=>[k,null])),placements:{},sourceMonths:0};
      if(p.months[m.monthKey]!==null && Object.prototype.hasOwnProperty.call(p.placements,m.monthKey)) fail('EMPLOYEE_DUPLICATE');
      p.months[m.monthKey]=r.medal;p.placements[m.monthKey]={region:r.region,storeCode:r.storeCode,store:r.store,role:r.role};p.total+=r.medal;p.sourceMonths++;p.employeeName=r.employeeName;map.set(r.employeeId,p);
    }}
    return Array.from(map.values()).filter(p=>!filters||(!filters.employee||p.employeeId===filters.employee)&&(!filters.region||Object.values(p.placements).some(x=>x.region===filters.region))&&(!filters.store||Object.values(p.placements).some(x=>x.storeCode===filters.store&&(!filters.region||x.region===filters.region)))).sort((a,b)=>b.total-a.total||a.employeeId.localeCompare(b.employeeId));
  }
  function quarterStatus(months, expected) {
    return expected.every(k=>months.some(m=>m.monthKey===k&&m.settlementStatus==='final'))?'final':'provisional';
  }
  function contentKey(m) {return JSON.stringify({monthKey:m.monthKey,dateRange:m.dateRange,records:m.records.slice().sort((a,b)=>a.employeeId.localeCompare(b.employeeId))});}
  return {SCHEMA,REGIONS,date,dateRange,quarter,quarterMonths,validateMonth,parseWorkbook,summarize,diff,aggregate,quarterStatus,contentKey};
});
