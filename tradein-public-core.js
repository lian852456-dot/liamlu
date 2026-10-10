/* Server-only whitelist. Public IDs are random, never employee-derived. */
var TradeinPublicCore=(function(){
  'use strict';
  const STORES=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
  const keys=(v,names)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join('|')===names.slice().sort().join('|');
  const number=(n,nullable=false)=>nullable&&n===null || Number.isSafeInteger(n)&&n>=0&&n<=10000000;
  const day=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  function validateModels(models,actual){
    if(models===null)return;
    if(!Array.isArray(models)||models.length>20000||actual===null)throw Error('公開回收機款格式無效');
    const seen=new Set();let total=0;
    models.forEach(m=>{if(!keys(m,['model','units'])||typeof m.model!=='string'||!m.model||m.model.length>80||
      !/^[A-Za-z0-9 .+()\/\-]+$/.test(m.model)||/\d{10,}/.test(m.model)||!number(m.units)||m.units===0||seen.has(m.model))throw Error('公開回收機款白名單格式無效');seen.add(m.model);total+=m.units;});
    if(total!==actual)throw Error('公開回收機款與實績不一致');
  }
  function mask(value){const chars=Array.from(String(value||'').trim());if(!chars.length||chars.length>40)throw Error('公開姓名來源格式無效');return chars.length<2?'＊':chars[0]+'＊'+chars[chars.length-1];}
  function validateDays(days,actual,period,models){
    if(days===null)return;
    if(!Array.isArray(days)||days.length>31||actual===null)throw Error('公開逐日回收格式無效');
    const seen=new Set(),totals=new Map();let total=0,complete=true;
    days.forEach(d=>{
      if(!keys(d,['date','actual_units','recovered_models'])||!day(d.date)||d.date<period.start||d.date>period.end||seen.has(d.date)||!number(d.actual_units)||d.actual_units===0)throw Error('公開逐日回收日期／台數無效');
      seen.add(d.date);total+=d.actual_units;validateModels(d.recovered_models,d.actual_units);
      if(d.recovered_models===null)complete=false;
      else d.recovered_models.forEach(m=>totals.set(m.model,(totals.get(m.model)||0)+m.units));
    });
    if(total!==actual)throw Error('逐日回收與整月實績不一致');
    if(Array.isArray(models)&&(!complete||models.length!==totals.size||models.some(m=>totals.get(m.model)!==m.units)))throw Error('逐日機款與整月機款不一致');
  }
  function copyDays(days){return days===null?null:days.map(d=>({date:d.date,actual_units:d.actual_units,recovered_models:d.recovered_models===null?null:d.recovered_models.map(m=>({model:m.model,units:m.units}))}));}
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
      const fields=['public_id','store','masked_name','actual_units','target_units','remaining_units','attainment_status'];
      if(Object.prototype.hasOwnProperty.call(p,'recovered_models'))fields.push('recovered_models');
      if(Object.prototype.hasOwnProperty.call(p,'recovered_days'))fields.push('recovered_days');
      if(!keys(p,fields)||
        !/^tp_[a-f0-9]{32}$/.test(p.public_id)||seen.has(p.public_id)||!STORES.includes(p.store)||
        !(p.masked_name==='＊'||Array.from(p.masked_name||'').length===3&&Array.from(p.masked_name)[1]==='＊')||
        /[<>\r\n\t]/.test(p.masked_name)||!number(p.actual_units,true)||![null,3].includes(p.target_units)||
        !number(p.remaining_units,true)||p.remaining_units!==(p.target_units===null||p.actual_units===null?null:Math.max(3-p.actual_units,0))||
        p.attainment_status!==(p.target_units===null?'exempt':p.actual_units===null?'pending':p.actual_units>=3?'met':'in_progress'))
        throw Error('公開人員白名單格式無效');seen.add(p.public_id);
      if(Object.prototype.hasOwnProperty.call(p,'recovered_models'))validateModels(p.recovered_models,p.actual_units);
      if(Object.prototype.hasOwnProperty.call(p,'recovered_days'))validateDays(p.recovered_days,p.actual_units,value.source_period,p.recovered_models);
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
          remaining_units:p.remaining_units,attainment_status:p.target_units===null?'exempt':p.actual_units===null?'pending':p.actual_units>=3?'met':'in_progress',
          recovered_models:p.recovered_models===undefined?(p.actual_units===0?[]:null):p.recovered_models===null?null:p.recovered_models.map(m=>({model:m.model,units:m.units})),
          ...(Object.prototype.hasOwnProperty.call(p,'recovered_days')?{recovered_days:copyDays(p.recovered_days)}:{})};
      }),stores:STORES.map(function(store){
        const s=snapshot.stores.find(s=>s.store===store);if(!s)throw Error('公開來源店點缺漏');
        return {store:store,actual_units:s.total_units,target_units:s.staff_target_units,remaining_units:s.staff_gap_units,
          target_people:s.target_staff_count,met_people:s.met_staff_count};
      }),summary:{}};
    ['actual_units','target_units','remaining_units','target_people','met_people'].forEach(k=>{value.summary[k]=value.stores.reduce((n,s)=>n+s[k],0);});
    value.summary.store_count=9;return validate(value);
  }
  function withModels(value,source,basis){
    validate(value);
    if(!basis||basis.schema_version!=='tradein-recovered-models/v1'||basis.review_status!=='verified'||basis.source_sha256!==source.source_sha256||
      basis.month!==value.month||basis.source_start!==value.source_period.start||basis.source_end!==value.source_period.end||
      !Array.isArray(basis.people)||basis.people.length>5000||source.people.length!==value.people.length)throw Error('回收機款來源尚未核對');
    const byId=new Map();basis.people.forEach(p=>{if(!keys(p,['employee_key','store','actual_units','recovered_models'])||
      typeof p.employee_key!=='string'||!STORES.includes(p.store)||!number(p.actual_units)||byId.has(p.employee_key))throw Error('回收機款私有對照衝突');
      validateModels(p.recovered_models,p.actual_units);if(p.recovered_models===null)throw Error('回收機款資料不完整');byId.set(p.employee_key,p);});
    const people=value.people.map((p,i)=>{const privatePerson=source.people[i],detail=byId.get(privatePerson.employee_key);
      if(p.store!==privatePerson.store||p.masked_name!==mask(privatePerson.masked_name)||p.actual_units!==privatePerson.actual_units||p.target_units!==privatePerson.target_units)throw Error('回收機款人員來源不符');
      if(detail&&(detail.store!==p.store||detail.actual_units!==p.actual_units))throw Error('回收機款台數／店點不符');
      if(p.actual_units>0&&!detail)throw Error('回收機款人員缺漏');
      if(detail)byId.delete(privatePerson.employee_key);
      return {...p,recovered_models:detail?detail.recovered_models.map(m=>({model:m.model,units:m.units})):p.actual_units===0?[]:null};});
    if(byId.size)throw Error('回收機款含未知人員');
    return validate({...value,people:people});
  }
  function withDays(value,source,basis,rosterHash){
    validate(value);
    if(!basis||basis.schema_version!=='tradein-recovered-days/v1'||basis.review_status!=='verified'||basis.source_sha256!==source.source_sha256||
      basis.month!==value.month||basis.source_start!==value.source_period.start||basis.source_end!==value.source_period.end||
      basis.roster_hash!==rosterHash||!Array.isArray(basis.people)||basis.people.length!==value.people.length||source.people.length!==value.people.length)throw Error('逐日回收來源尚未核對');
    const byId=new Map();basis.people.forEach(p=>{
      if(!keys(p,['employee_key','store','actual_units','recovered_days'])||typeof p.employee_key!=='string'||!STORES.includes(p.store)||!number(p.actual_units,true)||byId.has(p.employee_key))throw Error('逐日回收私有對照衝突');
      validateDays(p.recovered_days,p.actual_units,value.source_period);byId.set(p.employee_key,p);
    });
    const people=value.people.map((p,i)=>{
      const original=source.people[i],detail=byId.get(original.employee_key);
      if(!detail||p.store!==original.store||p.masked_name!==mask(original.masked_name)||p.actual_units!==original.actual_units||p.target_units!==original.target_units||detail.store!==p.store||detail.actual_units!==p.actual_units)throw Error('逐日回收人員／實績來源不符');
      byId.delete(original.employee_key);return {...p,recovered_days:copyDays(detail.recovered_days)};
    });
    if(byId.size)throw Error('逐日回收含未知人員');
    return validate({...value,people:people});
  }
  return Object.freeze({project:project,validate:validate,mask:mask,withModels:withModels,withDays:withDays});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TradeinPublicCore;
