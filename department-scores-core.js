(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DepartmentScoresCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CONTRACT = 'north12-store-scores-v2';
  const REGIONS = ['北一二A', '北一二B', '北一二C', '北一二D'];
  const text = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  function column(index) { let out = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out; return out; }
  const address = (r, c) => column(c) + (r + 1);
  function cell(sheet, r, c) {
    const raw = sheet[address(r, c)];
    if (!raw || raw.v == null || raw.v === '') return { value:null, raw:null, status:'blank' };
    if (raw.t === 'e') return { value:null, raw:String(raw.w || raw.v), status:'error' };
    if (typeof raw.v === 'boolean') return { value:null, raw:raw.v, status:'boolean' };
    if (/^(?:N\/?A|#N\/A|不適用|無資料)$/i.test(text(raw.v))) return { value:null, raw:text(raw.v), status:'na' };
    const value = typeof raw.v === 'number' ? raw.v : Number(text(raw.v).replace(/,/g, ''));
    return Number.isFinite(value) ? { value, raw:raw.v, status:'number' } : { value:null, raw:text(raw.v), status:'text' };
  }
  function headerValue(sheet, r, c) {
    let a = address(r, c);
    const merge = (sheet['!merges'] || []).find(m => m.s.r <= r && m.e.r >= r && m.s.c <= c && m.e.c >= c);
    if (merge) a = address(merge.s.r, merge.s.c);
    return text(sheet[a]?.v);
  }
  function dimensions(sheet) {
    const end = String(sheet['!ref'] || '').split(':').pop().match(/^([A-Z]+)(\d+)$/);
    if (!end) throw new Error('工作表缺少有效範圍');
    let c = 0; for (const ch of end[1]) c = c * 26 + ch.charCodeAt(0) - 64;
    if (Number(end[2]) > 10000 || c > 200) throw new Error('工作表範圍過大');
    return { rows:Number(end[2]), cols:c };
  }
  function mapping(sheet) {
    const { cols, rows } = dimensions(sheet);
    let start = -1;
    for (let r = 0; r < Math.min(rows, 30); r++) {
      const line = Array.from({length:cols}, (_, c) => text(sheet[address(r,c)]?.v));
      if (line.some(s => /店務管理指標成績/.test(s)) && line.some(s => /轄下店數/.test(s))) { start = r; break; }
    }
    if (start < 0) throw new Error('未辨識到店務多層表頭');
    let end = start + 3;
    for (let r = start + 1; r < Math.min(start + 8, rows); r++) {
      if (Array.from({length:cols}, (_, c) => text(sheet[address(r,c)]?.v)).includes('驗證')) { end = r; break; }
    }
    const headers = Array.from({length:cols}, (_, c) => {
      const group = headerValue(sheet, start, c);
      const lower = [...new Set(Array.from({length:end-start}, (_, i) => headerValue(sheet,start+i+1,c)).filter(s => s && s !== group))];
      return { c, group, lower:lower.join('｜'), all:[group,...lower].join('｜') };
    });
    const unique = (re, name) => {
      const hits = headers.filter(h => re.test(h.group));
      if (hits.length !== 1) throw new Error(`表頭 ${name} 缺少或重複`);
      return hits[0].c;
    };
    const core = { region:unique(/^區域$/, '區域'), store:unique(/^主管$|^店點$/, '店點'), storeCount:unique(/轄下店數/, '店數'), defects:unique(/店務缺失.*總數/, '總缺失'), deduction:unique(/^缺失扣分/, '扣分'), score:unique(/店務管理指標成績/, '成績'), nationalRank:unique(/^排名$/, '全國排名') };
    const metrics = headers.filter(h => h.c > core.nationalRank && (h.group || h.lower)).map(h => {
      let kind = 'defect';
      if (/排名/.test(h.lower)) kind = 'rank';
      else if (/驗證/.test(h.all)) kind = 'verification';
      else if (/預警|不扣分/.test(h.all)) kind = 'warning';
      else if (/查核分數/.test(h.lower)) kind = 'checkScore';
      else if (/指標扣分/.test(h.lower)) kind = 'deduction';
      else if (/查核店數|缺失店數|(?:^|｜)店數(?:$|｜)/.test(h.lower)) kind = 'storeCount';
      else if (/總計|疏失數|缺失數/.test(h.lower) && /帳務|人事|庫存|TQM|資安/.test(h.group)) kind = 'total';
      const group = h.group.split(/每筆|盤差|未依規定|\(/)[0].trim();
      const label = h.lower || group;
      return { key:column(h.c), column:column(h.c), group, label, kind, unit:/缺失頁次/.test(h.lower) ? '頁次' : /店數/.test(h.lower) ? '店' : /電腦未關機/.test(h.lower) ? '台日' : kind === 'deduction' || kind === 'checkScore' ? '分' : kind === 'rank' ? '名次' : '原表單位', header:h.all };
    });
    // Version detection uses semantic bands, including the disappearing warning / CSMO store-count bands.
    const layout = metrics.some(m => m.kind === 'warning') ? (metrics.some(m => /舊機回收/.test(m.header)) ? 'warning-recycle' : 'warning-no-recycle') : 'final-recycle';
    for (const required of ['帳務','人事','庫存','TQM','店務日誌','資安','文件回送','作廢','CSMO']) {
      if (!metrics.some(m => m.header.includes(required))) throw new Error(`缺少 ${required} 分項表頭`);
    }
    return { core, metrics, start, end, layout, rows };
  }
  function canonicalStore(value) {
    const source = text(value);
    return source === '台灣大哥大數位生活台北三創' ? '台北三創' : source;
  }
  function parseMonth(sheet, sheetName, monthKey) {
    const map = mapping(sheet), expectedCounts = {}, records = [], warnings = [];
    for (let r = map.end + 1; r < map.rows; r++) {
      const region = text(sheet[address(r,map.core.region)]?.v);
      if (!REGIONS.includes(region)) continue;
      const count = cell(sheet,r,map.core.storeCount).value;
      if (count > 1 && records.length === 0) {
        if (expectedCounts[region] != null) throw new Error('部區控制店數重複');
        expectedCounts[region] = count; continue;
      }
      if (count !== 1) continue;
      if (!REGIONS.every(k => Number.isInteger(expectedCounts[k]))) throw new Error('門市明細前缺少四區控制店數');
      const sourceStore = text(sheet[address(r,map.core.store)]?.v), store = canonicalStore(sourceStore);
      if (!store || /合計|總計|主管|督導/.test(store)) throw new Error('門市明細店名無效');
      const source = {};
      for (const key of Object.keys(map.core)) { source[key] = { cell:address(r,map.core[key]), ...cell(sheet,r,map.core[key]) }; }
      if (source.score.status !== 'number' || source.score.value < 0 || source.score.value > 100) throw new Error(`${sheetName}!${source.score.cell} 原成績缺少有效快取值，該月停止更新`);
      const metrics = map.metrics.map(m => ({ ...m, cell:address(r,m.column.split('').reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1), ...cell(sheet,r,m.column.split('').reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1) }));
      for (const metric of metrics) if (metric.status === 'error') warnings.push(`${sheetName}!${metric.cell} ${metric.group} ${metric.label} 缺資料（${metric.raw}）；原成績保留`);
      for (const key of ['defects','deduction']) if (source[key].value == null) warnings.push(`${sheetName}!${source[key].cell} ${key === 'defects' ? '總缺失' : '扣分'}缺資料`);
      if (source.deduction.value != null && Math.abs(source.score.value - (100-source.deduction.value)) > 1e-7) throw new Error(`${sheetName}!${source.score.cell} 與原扣分不一致，請複核原檔`);
      records.push({ region, store, sourceStore, sourceRow:r+1, score:source.score.value, defects:source.defects.value, deduction:source.deduction.value, nationalRank:source.nationalRank.value, source, metrics });
    }
    return validateMonth({ monthKey, sheetName, layout:map.layout, expectedCounts, records, warnings });
  }
  function inferYear(workbook) {
    const years = new Set();
    for (const name of workbook.SheetNames) {
      const year = name.match(/(20\d{2})[-/.年]/)?.[1]; if (year) years.add(year);
      if (/近半年/.test(name)) {
        const s = workbook.Sheets[name];
        for (const [a,c] of Object.entries(s)) if (/^[A-Z]+1$/.test(a)) { const y = text(c.v).match(/(20\d{2})[.\/-]/)?.[1]; if (y) years.add(y); }
      }
    }
    if (years.size > 1) throw new Error('工作簿含跨年資料，請使用含年份的月份頁籤');
    return [...years][0] || '';
  }
  function parseWorkbook(workbook, options) {
    if (!workbook?.SheetNames || !workbook?.Sheets) throw new Error('無法辨識 XLSX 工作簿');
    const inferred = inferYear(workbook), year = text(options?.year || inferred);
    if (!/^20\d{2}$/.test(year)) throw new Error('原檔月份頁籤缺年份，請先填寫資料年度');
    if (inferred && year !== inferred) throw new Error('資料年度與原檔表頭不一致');
    const months = [], errors = [];
    for (const name of workbook.SheetNames) {
      const m = name.match(/^(?:(20\d{2})[-/.年])?(\d{1,2})月?$/);
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) continue;
      const monthKey = `${m[1] || year}-${m[2].padStart(2,'0')}`;
      try { months.push(parseMonth(workbook.Sheets[name], name, monthKey)); }
      catch (error) { errors.push({monthKey, sheetName:name, message:error.message}); }
    }
    if (!months.length && !errors.length) throw new Error('沒有符合固定格式的月份頁籤');
    if (new Set(months.map(m=>m.monthKey)).size !== months.length) throw new Error('同月份頁籤重複');
    return { contract:CONTRACT, months:months.sort((a,b)=>a.monthKey.localeCompare(b.monthKey)), errors, referenceNote:workbook.SheetNames.some(n=>/近半年/.test(n)) ? '近半年成績為當期店點／人員參照，未混入門市歷史統計' : '' };
  }
  function validateMonth(input) {
    const m = input || {};
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m.monthKey) || !text(m.sheetName) || text(m.sheetName).length > 80) throw new Error('月份格式不正確');
    if (!['warning-no-recycle','warning-recycle','final-recycle'].includes(m.layout)) throw new Error('店務表頭版本無效');
    const expectedCounts = {};
    for (const region of REGIONS) { const n=m.expectedCounts?.[region]; if (!Number.isInteger(n)||n<1||n>100) throw new Error('四區控制店數無效'); expectedCounts[region]=n; }
    if (!Array.isArray(m.records) || m.records.length !== Object.values(expectedCounts).reduce((a,b)=>a+b,0)) throw new Error('門市列數與四區控制店數不符，停止該月更新');
    const seen=new Set();
    function normalizeCell(s) {
      if (!s || !/^[A-Z]{1,3}\d{1,5}$/.test(s.cell) || !['number','blank','error','na','text','boolean'].includes(s.status)) throw new Error('來源儲存格無效');
      if (s.status==='number' ? typeof s.value!=='number'||!Number.isFinite(s.value)||Math.abs(s.value)>100000 : s.value!==null) throw new Error('來源值狀態不符');
      if (s.raw!=null && !['number','string','boolean'].includes(typeof s.raw)) throw new Error('原值無效');
      if (typeof s.raw==='string' && s.raw.length>300) throw new Error('原值過長');
      return {cell:s.cell,value:s.value,raw:s.raw==null?null:s.raw,status:s.status};
    }
    const records=m.records.map(r=>{
      const store=text(r.store),region=text(r.region),key=store;
      if (!REGIONS.includes(region)||!store||store.length>80||seen.has(key)||!Number.isInteger(r.sourceRow)||r.sourceRow<1) throw new Error('門市重複或店點資料無效'); seen.add(key);
      const source={}; for(const k of ['region','store','storeCount','defects','deduction','score','nationalRank']) source[k]=normalizeCell(r.source?.[k]);
      if(Object.values(source).some(s=>Number(s.cell.match(/\d+$/)[0])!==r.sourceRow)||source.region.raw!==region||source.store.raw!==text(r.sourceStore)||canonicalStore(r.sourceStore)!==store) throw new Error('門市來源定位不一致');
      if (source.score.status!=='number'||source.score.value<0||source.score.value>100||source.storeCount.value!==1) throw new Error('門市成績或店數無效');
      for(const k of ['score','defects','deduction','nationalRank']) if(r[k]!==source[k].value) throw new Error('原值與門市欄位不一致');
      if(source.deduction.value!=null&&Math.abs(source.score.value-(100-source.deduction.value))>1e-7) throw new Error('成績與扣分不一致');
      if(!Array.isArray(r.metrics)||r.metrics.length<20||r.metrics.length>100) throw new Error('缺失分項不完整');
      const keys=new Set();
      const metrics=r.metrics.map(v=>{
        if(!/^[A-Z]{1,3}$/.test(v.key)||keys.has(v.key)||v.column!==v.key||!['defect','total','rank','verification','warning','checkScore','deduction','storeCount'].includes(v.kind)) throw new Error('缺失分項欄位無效'); keys.add(v.key);
        const out={}; for(const k of ['key','column','group','label','kind','unit','header']) {out[k]=text(v[k]);if(out[k].length>700) throw new Error('分項文字過長');}
        return {...out,...normalizeCell(v)};
      });
      if(metrics.some(v=>v.cell!==v.column+r.sourceRow)) throw new Error('分項來源定位不一致');
      const recycle = metrics.find(v => /舊機回收/.test(v.header) && v.kind==='defect');
      return {region,store,sourceStore:text(r.sourceStore),sourceRow:r.sourceRow,score:r.score,defects:r.defects,deduction:r.deduction,nationalRank:r.nationalRank,recycleDefects:recycle ? recycle.value : null,source,metrics};
    // Hash ordering must be identical in the Mac, browser and Apps Script locales.
    }).sort((a,b)=>a.region===b.region?(a.store===b.store?0:a.store<b.store?-1:1):(a.region<b.region?-1:1));
    for(const region of REGIONS) if(records.filter(r=>r.region===region).length!==expectedCounts[region]) throw new Error(`${region} 明細店数不足`);
    const warnings=(m.warnings||[]).map(text); if(warnings.length>1000||warnings.some(w=>w.length>500)) throw new Error('警告資料過長');
    return {monthKey:m.monthKey,sheetName:text(m.sheetName),layout:m.layout,expectedCounts,records,warnings};
  }
  function canonical(month) { return JSON.stringify(validateMonth(month)); }
  function diff(before, after) {
    const old=new Map((before?.records||[]).map(r=>[r.store,r])); const changes=[];
    for(const k of ['layout','sheetName']) if(before&&before[k]!==after[k])changes.push({store:'月份來源',field:k,before:before[k],after:after[k]});
    for(const r of after.records){const p=old.get(r.store); if(!p){changes.push({store:r.store,field:'新增店點',before:null,after:r.score});continue;}
      for(const k of ['region','sourceStore','score','defects','deduction','nationalRank']) if(p[k]!==r[k]) changes.push({store:r.store,field:k,before:p[k],after:r[k]});
      const pm=new Map(p.metrics.map(v=>[v.key,v]));for(const v of r.metrics){const pv=pm.get(v.key);if(!pv||pv.value!==v.value||pv.status!==v.status||pv.raw!==v.raw||pv.header!==v.header)changes.push({store:r.store,field:`${v.group} ${v.label} (${v.key})`,before:pv?.value??null,after:v.value});pm.delete(v.key);}for(const pv of pm.values())changes.push({store:r.store,field:`移除分項 ${pv.group} ${pv.label} (${pv.key})`,before:pv.value,after:null});
      old.delete(r.store);
    }
    for(const r of old.values())changes.push({store:r.store,field:'移除店點',before:r.score,after:null});return changes;
  }
  function summarize(records) {
    const valid=records.filter(r=>r.score!=null),sum=k=>records.length&&records.every(r=>r[k]!=null)?records.reduce((n,r)=>n+r[k],0):null;
    return {storeMonths:records.length,mean:valid.length?valid.reduce((n,r)=>n+r.score,0)/valid.length:null,defects:sum('defects'),deduction:sum('deduction'),deductedStores:records.length?records.filter(r=>r.deduction>0).length:null,missingDeduction:records.filter(r=>r.deduction==null).length};
  }
  function rank(records) {const sorted=records.slice().sort((a,b)=>b.score-a.score||a.store.localeCompare(b.store));return sorted.map((r,i)=>({...r,departmentRank:i===0?1:sorted.findIndex(p=>p.score===r.score)+1}));}
  function quarterInfo(months) {return [...new Set(months.map(m=>`${m.monthKey.slice(0,4)}-Q${Math.ceil(Number(m.monthKey.slice(5))/3)}`))].map(q=>{const start=(Number(q.slice(-1))-1)*3+1;const required=Array.from({length:3},(_,i)=>`${q.slice(0,4)}-${String(start+i).padStart(2,'0')}`);const present=required.filter(k=>months.some(m=>m.monthKey===k&&m.available!==false));return {key:q,required,present,complete:present.length===3};});}
  function periodMonths(all, key) {
    const sorted=all.slice().sort((a,b)=>a.monthKey.localeCompare(b.monthKey));if(!sorted.length)return [];
    let keys=[];
    if(key==='half'){
      const last=sorted[sorted.length-1].monthKey,[y,m]=last.split('-').map(Number);
      keys=Array.from({length:6},(_,i)=>{const d=new Date(Date.UTC(y,m-6+i,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');});
    }else if(key.startsWith('quarter:')){const q=key.slice(8),start=(Number(q.slice(-1))-1)*3+1;keys=Array.from({length:3},(_,i)=>q.slice(0,4)+'-'+String(start+i).padStart(2,'0'));}
    else keys=[key];
    return keys.map(monthKey=>sorted.find(m=>m.monthKey===monthKey)||{monthKey,sheetName:monthKey+' 未提供',available:false,records:[],warnings:[monthKey+' 原檔未提供，缺資料不補零']});
  }
  function brief(months, filters) {
    const rows=months.flatMap(m=>m.records.filter(r=>(!filters?.region||r.region===filters.region)&&(!filters?.store||r.store===filters.store)).map(r=>({monthKey:m.monthKey,...r})));
    return {contract:'north12-scores-brief-v1',period:months.map(m=>m.monthKey),missingMonths:months.filter(m=>m.available===false).map(m=>m.monthKey),filters:filters||{},summary:summarize(rows),regions:REGIONS.map(region=>({region,...summarize(rows.filter(r=>r.region===region))})),quarters:quarterInfo(months),records:rows,limitations:['缺失不同單位不合併成案件','無個案事件文字及改善紀錄，未推論原因或改善率','成績取原始快取值，未依新規章回算','簡報模板尚未提供，本輸出為資料介面']};
  }
  return { CONTRACT, REGIONS, text, cell, column, mapping, canonicalStore, parseWorkbook, parseMonth, inferYear, validateMonth, canonical, diff, summarize, rank, quarterInfo, periodMonths, brief };
});
