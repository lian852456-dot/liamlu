/* Read-only daily-report projection. No storage, transport, credentials or writes. */
(function (scope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.DailyReportSummaryModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const core = [['aq999','A999','筆'],['aq1399','A1399','筆'],['haosu','好速','點'],['rt999','R999','筆'],['rt1399','R1399','筆']];
  const main = [['kpi','KPI 達成率','%'],['rank','公司排名','名'],['early_renew','提前續約','件'],['rt_close_num','RT 締結分子',''],['rt_close_den','RT 締結分母',''],['rt_close_pct','RT 締結率','%'],['insurance_num','保險分子',''],['insurance_den','保險分母',''],['insurance_pct','保險搭售率','%'],['5g','5G 銷售','筆'],['aq_ttl','AQ 上線','筆'],['aq999','A999','筆'],['aq1399','A1399','筆'],['rt_pts','RT 上線','筆'],['special_renew','特殊維繫','筆'],['premium_renew','高高特維','筆'],['rt999','R999','筆'],['rt1399','R1399','筆'],['haosu','好速','點']];
  const addon = [['acc','配件','元'],['film','包膜保貼','筆'],['insurance','手機保險','筆'],['myvideo','MyVideo','筆'],['apple_google','Google服務及雜誌週刊開通數','筆'],['hbo','HBO','筆'],['netflix','Netflix','筆']];
  const management = [['op_online','OP 上線','筆'],['op_accum','OP 累積','筆'],['op_target','OP 目標','筆'],['mycharge_clicked','MyCharge 已點選','筆'],['mycharge_tagged','今日貼標數','筆'],['mycharge_pct','MyCharge 點選率','%']];
  const fields = [...main,...addon,...management];
  const ratios = {insurance_pct:['insurance_num','insurance_den'],rt_close_pct:['rt_close_num','rt_close_den'],mycharge_pct:['mycharge_clicked','mycharge_tagged']};
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  function number(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function managementData(record) {
    try { const value = typeof record.management_focus_json === 'string' ? JSON.parse(record.management_focus_json) : record.management_focus_json; return object(value) ? value : {}; }
    catch (_) { return {}; }
  }
  function pair(record, keys) {
    const n = number(record[keys[0]]), d = number(record[keys[1]]);
    const valid = n !== null && d !== null && n <= d;
    return { n, d, valid, rate:valid && d > 0 ? n / d * 100 : null, notApplicable:valid && n === 0 && d === 0 };
  }
  function values(record) {
    const managementSource = managementData(record);
    const managementKeys = new Set(management.map(([key])=>key));
    const result = Object.fromEntries(fields.map(([key]) => [key,number(managementKeys.has(key) ? managementSource[key] : record[key])]));
    for (const [key,keys] of Object.entries(ratios)) result[key] = pair(result,keys).rate;
    return result;
  }
  function matches(record, date, seg, store) {
    return object(record) && record.date === date && Number(record.seg) === seg && record.store === store;
  }
  function project(response, date, seg, stores) {
    if (!response || response.status !== 'ok' || !object(response.data)) throw new Error('回報資料未取得或格式不符');
    if (response.summary && (response.summary.date !== date || Number(response.summary.segment) !== seg)) throw new Error('回報來源日期或時段不符');
    return stores.map(name => {
      if (!Object.hasOwn(response.data,name)) return {name,status:'missing',record:null,values:{}};
      const record = response.data[name];
      if (!matches(record,date,seg,name)) return {name,status:'unknown',record:null,values:{}};
      const normalized = values(record);
      const required = [...core.map(([key])=>key),'insurance_num','insurance_den',...(seg === 21 ? management.slice(0,5).map(([key])=>key) : [])];
      return {name,status:'reported',record,values:normalized,missingFields:required.filter(key=>normalized[key] === null),managementMissing:seg === 21 && management.slice(0,5).some(([key])=>normalized[key] === null)};
    });
  }
  function attention(row) {
    return row.status !== 'reported' || row.missingFields.length > 0 || !pair(row.values,ratios.insurance_pct).valid || Number(row.record.seg) === 21 && !pair(row.values,ratios.mycharge_pct).valid;
  }
  function select(rows, store, status) {
    return rows.filter(row => (store === 'all' || row.name === store) && (status === 'all' || status === 'reported' && row.status === 'reported' || status === 'attention' && attention(row)));
  }
  function sum(rows, key) {
    const vals = rows.filter(row=>row.status === 'reported' && number(row.values[key]) !== null).map(row=>number(row.values[key]));
    return {value:vals.length ? vals.reduce((a,b)=>a+b,0) : null,coverage:vals.length,total:rows.length};
  }
  function ratio(rows, key) {
    const pairs = rows.filter(row=>row.status === 'reported').map(row=>pair(row.values,ratios[key])).filter(value=>value.valid);
    const n = pairs.length ? pairs.reduce((a,p)=>a+p.n,0) : null, d = pairs.length ? pairs.reduce((a,p)=>a+p.d,0) : null;
    return {n,d,rate:d !== null && d > 0 ? n/d*100 : null,coverage:pairs.length,total:rows.length,notApplicable:pairs.length > 0 && d === 0};
  }
  function latest(rows) {
    const times = rows.filter(row=>row.status === 'reported').map(row=>String(row.record.savedAt || '')).map(text=>{
      const match = text.trim().match(/^(?:(上午|下午)\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!match) return null;
      let h=Number(match[2]);const m=Number(match[3]),s=Number(match[4]||0);
      if (match[1]) {if(h<1||h>12)return null;h=h%12+(match[1]==='下午'?12:0);}
      if(h>23||m>59||s>59)return null;
      return {seconds:h*3600+m*60+s,text};
    }).filter(Boolean).sort((a,b)=>a.seconds-b.seconds);
    return times.length ? times[times.length-1].text : null;
  }
  function personal(response, date, seg, stores, local) {
    if (!response || response.status !== 'ok' || !object(response.data)) throw new Error('個人明細未取得');
    const result = {};
    for (const store of stores) {
      const cloud = object(response.data[store]) ? response.data[store] : {};
      const localRows = object(local?.[store]) ? local[store] : {};
      result[store] = [...new Set([...Object.keys(cloud),...Object.keys(localRows)])].map(name=>{
        const record = matches(localRows[name],date,seg,store) ? localRows[name] : cloud[name];
        return {name,record};
      }).filter(({record})=>matches(record,date,seg,store));
    }
    return result;
  }
  return Object.freeze({core,main,addon,management,fields,ratios,number,pair,values,matches,project,attention,select,sum,ratio,latest,personal});
});
