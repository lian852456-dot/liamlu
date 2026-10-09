/* Server-only whitelist. Public IDs are random, never employee-derived. */
var TradeinPublicCore=(function(){
  'use strict';
  const STORES=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
  const keys=(v,names)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join('|')===names.slice().sort().join('|');
  const number=(n,nullable=false)=>nullable&&n===null || Number.isSafeInteger(n)&&n>=0&&n<=10000000;
  const day=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  function mask(value){const chars=Array.from(String(value||'').trim());if(!chars.length||chars.length>40)throw Error('公開姓名來源格式無效');return chars.length<2?'＊':chars[0]+'＊'+chars[chars.length-1];}
  function validate(value){
    if(!keys(value,['schema_version','region','month','source_period','source_cutoff_date','published_at','people','stores','summary']) ||
      value.schema_version!=='tradein-public/v1'||value.region!=='北一二B'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value.month)||
      !keys(value.source_period,['start','end'])||!day(value.source_period.start)||!day(value.source_period.end)||
      value.source_period.start.slice(0,7)!==value.month||value.source_period.end.slice(0,7)!==value.month||
      value.source_period.start>value.source_period.end||value.source_cutoff_date!==value.source_period.end||
      typeof value.published_at!=='string'||isNaN(Date.parse(value.published_at))||!Array.isArray(value.people)||value.people.length>5000||
      !Array.isArray(value.stores)||value.stores.length!==9)throw Error('公開績效白名單格式無效');
    const seen=new Set();
    value.people.forEach(function(p){
      if(!keys(p,['public_id','store','masked_name','actual_units','target_units','remaining_units','attainment_status'])||
        !/^tp_[a-f0-9]{32}$/.test(p.public_id)||seen.has(p.public_id)||!STORES.includes(p.store)||
        !(p.masked_name==='＊'||Array.from(p.masked_name||'').length===3&&Array.from(p.masked_name)[1]==='＊')||
        /[<>\r\n\t]/.test(p.masked_name)||!number(p.actual_units,true)||![null,3].includes(p.target_units)||
        !number(p.remaining_units,true)||p.remaining_units!==(p.target_units===null||p.actual_units===null?null:Math.max(3-p.actual_units,0))||
        p.attainment_status!==(p.target_units===null?'exempt':p.actual_units===null?'pending':p.actual_units>=3?'met':'in_progress'))
        throw Error('公開人員白名單格式無效');seen.add(p.public_id);
    });
    value.stores.forEach(function(s,i){
      if(!keys(s,['store','actual_units','target_units','remaining_units','target_people','met_people'])||s.store!==STORES[i]||
        !['actual_units','target_units','remaining_units','target_people','met_people'].every(k=>number(s[k])))throw Error('公開店點白名單格式無效');
      const people=value.people.filter(p=>p.store===s.store),targets=people.filter(p=>p.target_units===3);
      if(s.target_units!==targets.length*3||s.target_people!==targets.length||s.met_people!==targets.filter(p=>p.attainment_status==='met').length||
        s.remaining_units!==targets.reduce((n,p)=>n+(p.remaining_units||0),0)||s.actual_units<people.reduce((n,p)=>n+(p.actual_units||0),0))throw Error('公開店點數字不一致');
    });
    const s=value.summary;
    if(!keys(s,['actual_units','target_units','remaining_units','target_people','met_people','store_count'])||s.store_count!==9||
       !['actual_units','target_units','remaining_units','target_people','met_people'].every(k=>number(s[k])&&s[k]===value.stores.reduce((n,p)=>n+p[k],0)))throw Error('公開區數字不一致');
    return value;
  }
  function project(snapshot,randomId){
    if(!snapshot||snapshot.schema_version!=='tradein-performance/v1'||!Array.isArray(snapshot.people)||!Array.isArray(snapshot.stores))throw Error('公開來源尚未核實');
    const value={schema_version:'tradein-public/v1',region:'北一二B',month:snapshot.period_key,
      source_period:{start:snapshot.source_period.start,end:snapshot.source_period.end},source_cutoff_date:snapshot.source_cutoff_date,
      published_at:snapshot.published_at,people:snapshot.people.map(function(p){
        const publicId='tp_'+String(randomId()).replace(/-/g,'').toLowerCase();
        return {public_id:publicId,store:p.store,masked_name:mask(p.masked_name),actual_units:p.actual_units,target_units:p.target_units,
          remaining_units:p.remaining_units,attainment_status:p.target_units===null?'exempt':p.actual_units===null?'pending':p.actual_units>=3?'met':'in_progress'};
      }),stores:STORES.map(function(store){
        const s=snapshot.stores.find(s=>s.store===store);if(!s)throw Error('公開來源店點缺漏');
        return {store:store,actual_units:s.total_units,target_units:s.staff_target_units,remaining_units:s.staff_gap_units,
          target_people:s.target_staff_count,met_people:s.met_staff_count};
      }),summary:{}};
    ['actual_units','target_units','remaining_units','target_people','met_people'].forEach(k=>{value.summary[k]=value.stores.reduce((n,s)=>n+s[k],0);});
    value.summary.store_count=9;return validate(value);
  }
  return Object.freeze({project:project,validate:validate,mask:mask});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TradeinPublicCore;
