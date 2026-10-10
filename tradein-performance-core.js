/* Shared calculation contract. Raw transaction keys exist only during this call. */
var TradeinPerformanceCore = (function () {
  'use strict';
  const STORES = Object.freeze([
    ['DNB10062','酒泉'],['DNB10082','永吉'],['DNB10094','復興南'],
    ['DNB10146','杭州南'],['DNB10168','萬大'],['DNB10174','通化'],
    ['DNB10284','大稻埕'],['DNB10307','三創'],['DNB10440','六張犁']
  ]);
  const RULE_ID = 'monthly3-inclusive-original-month-v1';
  function shortModel(value) {
    if(value===null || value===undefined || value==='')return null;
    if(typeof value!=='string' || value.length>300 || /[<>\u0000-\u001f]|\d{10,}/.test(value))throw new Error('回收機款格式無效');
    let model=value.trim().replace(/^\(舊機\)\s*/,'').replace(/\((20\d{2})\)/g,' $1 ').replace(/\([^)]*\)/g,'')
      .replace(/_[A-Z]等.*$/i,'').replace(/[_-]+$/,'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
    model=model.replace(/^APPLE\s+/i,'').replace(/iPhone\s*(\d+)\s*Pro\s*Max/i,'i$1PM')
      .replace(/iPhone\s*(\d+)\s*Pro/i,'i$1P').replace(/iPhone\s*(\d+)\s*Plus/i,'i$1Plus')
      .replace(/iPhone\s*(\d+)/i,'i$1').replace(/iPhone\s*SE\s*/i,'iSE ')
      .replace(/^Google\s+/i,'').replace(/\bPixel\s*(\d+)\s*Pro\s*XL/i,'Pixel $1P XL').replace(/\bPixel\s*(\d+)\s*Pro/i,'Pixel $1P')
      .replace(/^SAMSUNG\s+(?:Galaxy\s+)?/i,'').replace(/\bUltra\b/gi,'U')
      .replace(/\d+GB\/(\d+)(?:GB|G)\b/gi,'$1G').replace(/\b(\d+)GB\b/gi,'$1G')
      .replace(/\bPlus\b/gi,'+').replace(/\s*[-_]\s*(?=\d+(?:G|T)\b)/gi,' ')
      .replace(/\s*[-_]\s*$/,'').replace(/\s+/g,' ').trim();
    if(!model || model.length>80 || !/^[A-Za-z0-9 .+()\/\-]+$/.test(model))throw new Error('回收機款簡稱無法辨識');
    return model;
  }
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
    if (/^(副店長|資深業務代表|業務代表\([I]+\)|業代|銷售人員|同仁)$/.test(value || '')) return '同仁';
    return '待核';
  }
  // Only an owner-loaded private configuration may supply this third argument.
  // Transaction payloads cannot supply a crosswalk or grant roster/auth status.
  function references(input, config) {
    if(!config || config.schema_version!=='tradein-private-reference/v1' ||
       config.source_sha256!==input.source_sha256 || config.source_start!==input.source_start || config.source_end!==input.source_end)
      throw new Error('私有對照配置缺漏或與本批來源不符');
    if(!Array.isArray(config.stores) || config.stores.length!==9 || !Array.isArray(config.employees))throw new Error('私有店碼／員編對照格式無效');
    const stores=new Map(),storeNames=new Set(),employees=new Map(),canonical=new Set();
    config.stores.forEach(s=>{
      const name=storeName(s.store);
      if(typeof s.store_code!=='string' || !STORES.some(v=>v[0]===s.store_code&&v[1]===name) || stores.has(s.store_code) || storeNames.has(name))
        throw new Error('私有店碼對照未知、重複或衝突');
      stores.set(s.store_code,name);storeNames.add(name);
    });
    config.employees.forEach(e=>{
      if(typeof e.source_employee_id!=='string' || !/^[A-Za-z0-9]{5}$/.test(e.source_employee_id) ||
         typeof e.employee_key!=='string' || !/^[A-Z0-9]{7}$/.test(e.employee_key) ||
         employees.has(e.source_employee_id) || canonical.has(e.employee_key) || !Array.isArray(e.observations) || !e.observations.length)
        throw new Error('私有員編對照未知、重複或衝突');
      const observations=new Set();
      e.observations.forEach(o=>{
        const observed=date(o.trade_date);
        if(observed<input.source_start || observed>input.source_end || !stores.has(o.store_code))throw new Error('員編對照觀測期間／店碼衝突');
        observations.add(JSON.stringify([observed,o.store_code]));
      });
      employees.set(e.source_employee_id,{employee_key:e.employee_key,observations});canonical.add(e.employee_key);
    });
    return {stores,employees};
  }
  function build(input, roster, privateConfig) {
    if (!input || input.rule_id!==RULE_ID || input.complete_nine_stores!==true) throw new Error('九店涵蓋或計數規則尚未確認');
    const period=monthPeriod(input.month), start=date(input.source_start), end=date(input.source_end);
    const statusAsOf=date(input.status_as_of_date || end);
    if(statusAsOf<end)throw new Error('取消核對日期不可早於報表查詢截止');
    if (start!==period.start || end>period.end || end<start) throw new Error('必須提供選定月首日起的完整九店報表');
    if (!/^[a-f0-9]{64}$/.test(input.source_sha256 || '')) throw new Error('來源雜湊無效');
    if (!Array.isArray(input.records) || input.records.length>20000 || !Array.isArray(roster)) throw new Error('來源／名冊格式無效');
    const reference=references(input,privateConfig);
    const people=[], byId={};
    roster.forEach(r=>{
      if (r.status!=='active') return;
      const store=storeName(r.store);
      if (!store) return;
      if(typeof r.employee_id!=='string')throw new Error('名冊員編必須為字串');
      const employee=r.employee_id.toUpperCase();
      if (!/^[A-Z0-9]{5,12}$/.test(employee) || byId[employee]) throw new Error('名冊員編重複或無效');
      const p={employee_key:employee,store:store,masked_name:String(r.masked_name || '姓名未提供'),
        role:role(r.role),original_role:String(r.role || ''),identity_status:'confirmed',actual_units:0};
      p.recovered_models=[];p.recovered_days=[];people.push(p);byId[employee]=p;
    });
    const stores=STORES.map(s=>({store:s[1],store_code:s[0],total_units:0,pending_identity_units:0,
      target_staff_count:0,staff_target_units:0,target_staff_actual_units:0,met_staff_count:0,
      manager_actual_units:0,acting_manager_actual_units:0,staff_gap_units:0,pending_staff_count:0,coverage:'complete'}));
    const byStore=Object.fromEntries(stores.map(s=>[s.store,s]));
    const unique={};let duplicates=0,cancelled=0;
    input.records.forEach(r=>{
      const store=reference.stores.get(r.store_code);
      if (!store) throw new Error('來源含九店範圍以外或未知店碼');
      const trade=date(r.trade_date), cancel=r.cancel_date?date(r.cancel_date):null;
      if (trade<start || trade>end || cancel && (cancel<trade || cancel>statusAsOf)) throw new Error('交易／取消日期與來源期間衝突');
      if (!['單銷','RT','AQNP'].includes(r.project)) throw new Error('未知專案類別，停止計數');
      if(typeof r.source_employee_id!=='string' || !/^[A-Za-z0-9]{5}$/.test(r.source_employee_id))throw new Error('來源員編必須保留五碼字串');
      const seller=r.source_employee_id,identity=reference.employees.get(seller);
      if(!identity || !identity.observations.has(JSON.stringify([trade,r.store_code])))throw new Error('來源員編缺少本批日期／店碼的精確私有對照');
      if(typeof r.recycle_code!=='string' || typeof r.order_number!=='string')throw new Error('回收碼／銷貨單號必須為字串');
      const key=r.recycle_code.trim(), order=r.order_number.trim();
      if (!key || !order || key.length>100 || order.length>100) throw new Error('缺少有效回收碼／銷貨單號');
      const model=shortModel(r.recycle_model);
      const normalized={store:store,trade_date:trade,cancel_date:cancel,employee_key:identity.employee_key,order:order,project:r.project,model:model};
      if (unique[key]) {
        const prior=unique[key];
        if (prior.store!==store || prior.trade_date!==trade || prior.employee_key!==normalized.employee_key || prior.order!==order || prior.project!==r.project) throw new Error('同回收碼的交易、人員或店點衝突');
        if(prior.model!==model)throw new Error('同回收碼的機款衝突');
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
      let daily=person.recovered_days.find(d=>d.date===r.trade_date);
      if(!daily){daily={date:r.trade_date,actual_units:0,recovered_models:[]};person.recovered_days.push(daily);}
      daily.actual_units++;
      if(!r.model)daily.recovered_models=null;
      else if(daily.recovered_models!==null){const item=daily.recovered_models.find(m=>m.model===r.model);if(item)item.units++;else daily.recovered_models.push({model:r.model,units:1});}
      if(!r.model)person.recovered_models=null;
      else if(person.recovered_models!==null){const item=person.recovered_models.find(m=>m.model===r.model);if(item)item.units++;else person.recovered_models.push({model:r.model,units:1});}
    });
    people.forEach(p=>{
      const s=byStore[p.store], exempt=['店長','代理店長'].includes(p.role);
      if(p.identity_status==='conflict'){p.actual_units=null;p.recovered_models=null;p.recovered_days=null;s.coverage='partial_identity';}
      if(p.recovered_models)p.recovered_models.sort((a,b)=>a.model.localeCompare(b.model,'en'));
      if(p.recovered_days){p.recovered_days.sort((a,b)=>a.date.localeCompare(b.date));p.recovered_days.forEach(d=>{if(d.recovered_models)d.recovered_models.sort((a,b)=>a.model.localeCompare(b.model,'en'));});}
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
    const rows=csv(String(text).replace(/^\uFEFF/,''));
    const labels=['序號','店點代碼','區域別','日期','專案類別','回收代碼/IMEI','銷貨單號','員工編號','取消交易日期'];
    const headers=rows.map((r,i)=>({names:r.map(c=>String(c).trim()),i})).filter(r=>r.names.includes('序號')&&r.names.includes('店點代碼'));
    if(headers.length!==1)throw new Error('無法辨識 SAR74 欄位');
    const names=headers[0].names,h=headers[0].i;
    // Keep the empty placeholders: the verified export metadata describes 29
    // columns with blanks at 15/18, while earlier synthetic exports use 30.
    const nonemptyNames=names.filter(Boolean);
    const legacy30=names.length===30 && nonemptyNames.length===30;
    const sar29=names.length===29 && names[15]==='' && names[18]==='' && nonemptyNames.length===27 &&
      names[17]==='銷貨單號' && names[23]==='員工編號' && names[26]==='取消交易日期';
    if((!legacy30&&!sar29) || new Set(nonemptyNames).size!==nonemptyNames.length || labels.some(n=>!names.includes(n)))throw new Error('無法辨識 SAR74 欄位');
    const columns=Object.fromEntries(labels.map(n=>[n,names.indexOf(n)]));
    if(names.includes('回收舊機品名'))columns['回收舊機品名']=names.indexOf('回收舊機品名');
    const header=rows.slice(0,h).flat().join(' '),ranges=Array.from(header.matchAll(/(\d{3}\/\d{2}\/\d{2})\s*-\s*(\d{3}\/\d{2}\/\d{2})/g));
    if(ranges.length!==1)throw new Error('SAR74 查詢期間缺漏或不唯一');
    const start=roc(ranges[0][1]),end=roc(ranges[0][2]),period=monthPeriod(start.slice(0,7));
    if(start!==period.start || end<start || end>period.end)throw new Error('SAR74 必須為選定月首日起的單月查詢期間');
    const printed=header.match(/(\d{2})年(\d{2})月(\d{2})日\s+(\d{2}):(\d{2})/);
    const statusAsOf=printed?date('20'+printed[1]+'-'+printed[2]+'-'+printed[3]):end;
    if(statusAsOf<end || printed&&(Number(printed[4])>23||Number(printed[5])>59))throw new Error('SAR74 列印／取消核對日期無效');
    const field=(r,label)=>unwrap(r[columns[label]]);
    function transactionDate(value) {
      if(!/^\d{7}$/.test(value))throw new Error('SAR74 日期必須為民國七碼');
      return roc(value);
    }
    const records=[],serials=new Set();
    rows.slice(h+1).forEach(r=>{
      if(r.every(c=>!String(c).trim()))return;
      if(r.length!==names.length)throw new Error('SAR74 欄位數衝突');
      const nonempty=r.map(c=>String(c).trim()).filter(Boolean);
      if(nonempty.length===2 && nonempty.includes('主管:') && nonempty.includes('製表:'))return;
      const serial=field(r,'序號');
      if(!/^[1-9]\d*$/.test(serial) || !Number.isSafeInteger(Number(serial)) || serials.has(serial))throw new Error('SAR74 序號無效或重複');
      serials.add(serial);
      const store=field(r,'店點代碼'),region=field(r,'區域別'),project=field(r,'專案類別'),seller=field(r,'員工編號');
      if(!/^DNB\d{5}$/.test(store) || region!=='北一二B')throw new Error('SAR74 店碼或區域格式衝突');
      if(!['單銷','RT','AQNP'].includes(project))throw new Error('SAR74 未知專案類別');
      if(!/^[A-Za-z0-9]{5}$/.test(seller))throw new Error('SAR74 來源員編必須保留五碼英數字');
      const recycle=field(r,'回收代碼/IMEI'),order=field(r,'銷貨單號');
      if(!recycle || !order || recycle.length>100 || order.length>100)throw new Error('SAR74 缺少有效回收碼／銷貨單號');
      const trade=transactionDate(field(r,'日期')),cancelValue=field(r,'取消交易日期');
      const cancel=cancelValue?transactionDate(cancelValue):null;
      if(trade<start || trade>end || cancel&&(cancel<trade || cancel>statusAsOf))throw new Error('SAR74 交易／取消日期與來源期間衝突');
      // Preserve identifiers as source strings. Store verification and employee
      // crosswalk are separate release prerequisites; no alias/prefix is inferred.
      const record={store_code:store,trade_date:trade,project:project,source_employee_id:seller,
        recycle_code:recycle,order_number:order,cancel_date:cancel};
      if(names.includes('回收舊機品名'))record.recycle_model=field(r,'回收舊機品名');
      records.push(record);
    });
    return {month:start.slice(0,7),source_start:start,source_end:end,status_as_of_date:statusAsOf,rule_id:RULE_ID,complete_nine_stores:false,header_column_count:names.length,
      printed_at:printed?printed[0]:'',records:records};
  }
  return Object.freeze({STORES:STORES,RULE_ID:RULE_ID,monthPeriod:monthPeriod,storeName:storeName,build:build,parseSar74:parseSar74,shortModel:shortModel});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TradeinPerformanceCore;
