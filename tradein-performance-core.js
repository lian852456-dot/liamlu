/* Shared calculation contract. Raw transaction keys exist only during this call. */
var TradeinPerformanceCore = (function () {
  'use strict';
  const STORES = Object.freeze([
    ['DNB10062','酒泉'],['DNB10082','永吉'],['DNB10094','復興南'],
    ['DNB10146','杭州南'],['DNB10168','萬大'],['DNB10059','通化'],
    ['DNB10284','大稻埕'],['DNB10307','三創'],['DNB10440','六張犁']
  ]);
  const STORE_MAP = Object.fromEntries(STORES);
  const RULE_ID = 'monthly3-inclusive-original-month-v1';
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || isNaN(Date.parse(value+'T00:00:00Z')) ||
        new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw new Error('日期無效');
    return value;
  }
  function monthPeriod(month) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('月份無效');
    const parts=month.split('-').map(Number);
    return {start:month+'-01',end:new Date(Date.UTC(parts[0],parts[1],0)).toISOString().slice(0,10)};
  }
  function storeName(value) {
    const v=String(value || '').trim();
    if (v==='台灣大哥大數位生活台北三創' || v==='台北三創') return '三創';
    const short=v.replace(/^台北/,'');
    return STORES.some(s=>s[1]===short)?short:null;
  }
  function role(value) {
    if (value==='店長') return '店長';
    if (value==='代理店長') return '代理店長';
    if (/^(副店長|業務代表\([I]+\)|業代|銷售人員|同仁)$/.test(value || '')) return '同仁';
    return '待核';
  }
  function build(input, roster) {
    if (!input || input.rule_id!==RULE_ID || input.complete_nine_stores!==true) throw new Error('九店涵蓋或計數規則尚未確認');
    const period=monthPeriod(input.month), start=date(input.source_start), end=date(input.source_end);
    const statusAsOf=date(input.status_as_of_date || end);
    if(statusAsOf<end)throw new Error('取消核對日期不可早於報表查詢截止');
    if (start!==period.start || end>period.end || end<start) throw new Error('必須提供選定月首日起的完整九店報表');
    if (!/^[a-f0-9]{64}$/.test(input.source_sha256 || '')) throw new Error('來源雜湊無效');
    if (!Array.isArray(input.records) || input.records.length>20000 || !Array.isArray(roster)) throw new Error('來源／名冊格式無效');
    const people=[], byId={};
    roster.forEach(r=>{
      if (r.status!=='active') return;
      const store=storeName(r.store);
      if (!store) return;
      const employee=String(r.employee_id || '').toUpperCase();
      if (!/^[A-Z0-9]{5,12}$/.test(employee) || byId[employee]) throw new Error('名冊員編重複或無效');
      const p={employee_key:employee,store:store,masked_name:String(r.masked_name || '姓名未提供'),
        role:role(r.role),original_role:String(r.role || ''),identity_status:'confirmed',actual_units:0};
      people.push(p);byId[employee]=p;
    });
    const stores=STORES.map(s=>({store:s[1],store_code:s[0],total_units:0,pending_identity_units:0,
      target_staff_count:0,staff_target_units:0,target_staff_actual_units:0,met_staff_count:0,
      manager_actual_units:0,acting_manager_actual_units:0,staff_gap_units:0,pending_staff_count:0,coverage:'complete'}));
    const byStore=Object.fromEntries(stores.map(s=>[s.store,s]));
    const unique={};let duplicates=0,cancelled=0;
    input.records.forEach(r=>{
      const store=STORE_MAP[r.store_code];
      if (!store) throw new Error('來源含九店範圍以外或未知店碼');
      const trade=date(r.trade_date), cancel=r.cancel_date?date(r.cancel_date):null;
      if (trade<start || trade>end || cancel && (cancel<trade || cancel>statusAsOf)) throw new Error('交易／取消日期與來源期間衝突');
      if (!['單銷','RT','AQNP'].includes(r.project)) throw new Error('未知專案類別，停止計數');
      const seller=String(r.source_employee_id || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{5}$/.test(seller)) throw new Error('來源員編格式無效');
      const key=String(r.recycle_code || '').trim(), order=String(r.order_number || '').trim();
      if (!key || !order || key.length>100 || order.length>100) throw new Error('缺少有效回收碼／銷貨單號');
      const normalized={store:store,trade_date:trade,cancel_date:cancel,employee_key:'55'+seller,order:order,project:r.project};
      if (unique[key]) {
        const prior=unique[key];
        if (prior.store!==store || prior.trade_date!==trade || prior.employee_key!==normalized.employee_key || prior.order!==order || prior.project!==r.project) throw new Error('同回收碼的交易、人員或店點衝突');
        if (cancel && (!prior.cancel_date || cancel>prior.cancel_date)) prior.cancel_date=cancel;
        duplicates++;
      } else unique[key]=normalized;
    });
    Object.values(unique).forEach(r=>{
      const person=byId[r.employee_key];
      if(!r.cancel_date && person && person.store!==r.store)person.identity_status='conflict';
    });
    Object.values(unique).forEach(r=>{
      if (r.cancel_date) {cancelled++;return;}
      const store=byStore[r.store];store.total_units++;
      const person=byId[r.employee_key];
      if (!person || person.store!==r.store || person.identity_status==='conflict') {store.pending_identity_units++;store.coverage='partial_identity';return;}
      person.actual_units++;
    });
    people.forEach(p=>{
      const s=byStore[p.store], exempt=['店長','代理店長'].includes(p.role);
      if(p.identity_status==='conflict'){p.actual_units=null;s.coverage='partial_identity';}
      p.target_units=p.role==='同仁'?3:null;
      p.remaining_units=p.target_units===null||p.actual_units===null?null:Math.max(3-p.actual_units,0);
      p.attainment_status=exempt?'exempt':p.role==='同仁'&&p.actual_units!==null?(p.actual_units>=3?'met':'in_progress'):'pending';
      if (p.role==='同仁') {
        s.target_staff_count++;s.staff_target_units+=3;s.target_staff_actual_units+=p.actual_units;
        s.staff_gap_units+=p.remaining_units;if(p.actual_units>=3)s.met_staff_count++;if(p.actual_units===null)s.pending_staff_count++;
      } else if(p.role==='店長') s.manager_actual_units=p.actual_units===null||s.manager_actual_units===null?null:s.manager_actual_units+p.actual_units;
      else if(p.role==='代理店長') s.acting_manager_actual_units=p.actual_units===null||s.acting_manager_actual_units===null?null:s.acting_manager_actual_units+p.actual_units;
      else s.coverage='partial_roster';
    });
    const sum=key=>stores.reduce((n,s)=>n+s[key],0);
    const summary={total_units:sum('total_units'),assigned_units:people.reduce((n,p)=>n+p.actual_units,0),
      pending_identity_units:sum('pending_identity_units'),target_staff_count:sum('target_staff_count'),
      staff_target_units:sum('staff_target_units'),met_staff_count:sum('met_staff_count'),staff_gap_units:sum('staff_gap_units'),
      mobilized_stores:stores.filter(s=>s.total_units>0).length,pending_staff_count:sum('pending_staff_count'),store_count:9,duplicate_rows:duplicates,cancelled_units:cancelled};
    if (summary.assigned_units+summary.pending_identity_units!==summary.total_units) throw new Error('店、人員與未分配台數對帳失敗');
    return {schema_version:'tradein-performance/v1',period_key:input.month,rule_id:RULE_ID,target_period:period,
      source_period:{start:start,end:end},source_cutoff_date:end,cutoff_precision:'date',timezone:'Asia/Taipei',
      source_sha256:input.source_sha256,status_as_of_date:statusAsOf,printed_at:String(input.printed_at || ''),people:people,stores:stores,summary:summary};
  }
  function csv(text) {
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell.length)cell+='"';else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted)throw new Error('CSV 引號未完整結束');
    if(cell||row.length){row.push(cell);rows.push(row);}return rows;
  }
  function unwrap(v){return String(v || '').trim().replace(/^="(.*)"$/,'$1');}
  function roc(v){const s=unwrap(v).replace(/[\/\-]/g,'');if(!/^\d{7}$/.test(s))throw new Error('SAR74 日期格式無效');return date(String(Number(s.slice(0,3))+1911)+'-'+s.slice(3,5)+'-'+s.slice(5,7));}
  function parseSar74(text) {
    const rows=csv(String(text).replace(/^\uFEFF/,'')), h=rows.findIndex(r=>r[0]==='序號'&&r[1]==='店點代碼');
    if(h<0 || rows[h].length!==30 || rows[h][3]!=='區域別' || rows[h][4]!=='日期' || rows[h][6]!=='專案類別' || rows[h][11]!=='回收代碼/IMEI' || rows[h][18]!=='銷貨單號' || rows[h][24]!=='員工編號' || rows[h][27]!=='取消交易日期')throw new Error('無法辨識 SAR74 欄位');
    const header=rows.slice(0,h).flat().join(' '),range=header.match(/(\d{3}\/\d{2}\/\d{2})\s*-\s*(\d{3}\/\d{2}\/\d{2})/);
    if(!range)throw new Error('SAR74 查詢期間缺漏');
    const start=roc(range[1]),end=roc(range[2]);
    const records=[];
    rows.slice(h+1).forEach(r=>{
      if(r.every(c=>!String(c).trim()))return;
      if(r[13]==='主管:' && r[19]==='製表:' && r.every((c,i)=>i===13||i===19||!String(c).trim()))return;
      if(!/^\d+$/.test(r[0]))throw new Error('SAR74 存在無法辨識的資料列');
      if(r.length!==30 || r[3]!=='北一二B')throw new Error('SAR74 欄位或區域範圍衝突');
      records.push({store_code:r[1],trade_date:roc(r[4]),project:r[6],source_employee_id:unwrap(r[24]),
        recycle_code:unwrap(r[11]),order_number:unwrap(r[18]),cancel_date:r[27]?roc(r[27]):null});
    });
    const printed=header.match(/(\d{2})年(\d{2})月(\d{2})日\s+\d{2}:\d{2}/);
    return {month:start.slice(0,7),source_start:start,source_end:end,status_as_of_date:printed?'20'+printed[1]+'-'+printed[2]+'-'+printed[3]:end,rule_id:RULE_ID,complete_nine_stores:false,
      printed_at:(header.match(/\d{2}年\d{2}月\d{2}日\s+\d{2}:\d{2}/)||[''])[0],records:records};
  }
  return Object.freeze({STORES:STORES,RULE_ID:RULE_ID,monthPeriod:monthPeriod,storeName:storeName,build:build,parseSar74:parseSar74});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TradeinPerformanceCore;
