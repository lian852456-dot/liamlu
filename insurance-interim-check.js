/* Opt-in, read-only, exact interim endpoint preflight. No form or write path. */
(function(scope) {
 'use strict';
 const datePattern=/^20\d{2}-\d{2}-\d{2}$/;
 const validDate=s=>typeof s==='string'&&datePattern.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 function plan(input, now=today()) {
  const {day,cutoff,sourceSha,version,scope}=input||{};
  if(!validDate(day)||!validDate(cutoff)||day!==now||cutoff>day||day.slice(0,7)!==cutoff.slice(0,7)||
    typeof sourceSha!=='string'||!/^[a-f0-9]{64}$/.test(sourceSha)||typeof version!=='string'||!/^[a-f0-9]{64}$/.test(version)||
    !['self','store-manager'].includes(scope))return null;
  return {day,cutoff,sourceSha,version,scope};
 }
 function checked(result,p) {
  if(!result||!p||result.status!=='ok'||result.schema!=='insurance-consultation/v1'||result.dataDate!==p.day||
      result.scope!==p.scope||!Array.isArray(result.items)||result.items.length!==(p.scope==='self'?1:2))return false;
  const person=result.items.filter(x=>x?.kind==='personal'&&x.isSelf===true&&x.canSubmit===true);
  if(person.length!==1)return false;
  const row=person[0],k=row.progress;
  if(row.dataDate!==p.day||!['required','exempt'].includes(row.requirement)||row.acceptsReply!==true||
      !k||k.status!=='verified'||k.identityStatus!=='verified'||k.referenceOnly!==false||k.freshness!=='current'||
      k.cutoff!==p.cutoff||k.publicationDate!==p.day||k.sourceSha256!==p.sourceSha||k.sourceVersion!==p.version)return false;
  if(p.scope==='self')return true;
  const store=result.items.filter(x=>x?.kind==='store');
  return store.length===1&&store[0].store===row.store&&store[0].dataDate===p.day&&store[0].isSelf===false&&
    store[0].canSubmit===true&&store[0].requirement==='pending'&&store[0].acceptsReply===false&&store[0].progress===null;
 }
 function create(panel,read,authorized){
  const marker='#insurance-check';
  if(scope.location.hash!==marker)return null;
  const box=document.createElement('section'),text=document.createElement('p'),button=document.createElement('button');
  const fields={};
  const labels={day:'報表日（YYYY-MM-DD）',cutoff:'個人統計截止（YYYY-MM-DD）',sourceSha:'核對原檔 SHA-256',version:'核對來源版本 SHA-256',scope:'預期角色（self／store-manager）'};
  for(const [key,name] of Object.entries(labels)){
   const label=document.createElement('label'),input=document.createElement('input');
   label.textContent=name;input.type='text';input.autocomplete='off';input.spellcheck=false;
   input.maxLength=key==='sourceSha'||key==='version'?64:key==='scope'?13:10;
   label.append(input);box.append(label);fields[key]=input;
  }
  text.setAttribute('role','status');button.type='button';button.textContent='唯讀驗收本日保險來源';
  box.append(button,text);panel.append(box);
  let lease=false,busy=false,generation=0;
  const clear=()=>{for(const item of Object.values(fields))item.value='';text.textContent='';};
  function session(active){
   const next=Boolean(active);if(next!==lease){generation++;busy=false;}
   lease=next;box.hidden=!lease;button.disabled=!lease||busy||scope.location.hash!==marker;
   for(const input of Object.values(fields))input.disabled=!lease||busy;
   if(!lease)clear();
  }
  button.onclick=async()=>{
   if(!lease||busy||!authorized()||scope.location.hash!==marker)return;
   const p=plan(Object.fromEntries(Object.entries(fields).map(([k,item])=>[k,item.value.trim()])));
   if(!p){text.textContent='請輸入本日報表日期、截止日、兩組雜湊及預期角色。';return;}
   const current=++generation;busy=true;session(lease);text.textContent='正在核對已登入角色及本日來源…';
   try{
    const ok=checked(await read(p.day),p);
    if(current!==generation||!lease||!authorized()||scope.location.hash!==marker||today()!==p.day)return;
    text.textContent=ok?'唯讀核對通過｜'+p.day+'｜個人統計截止 '+p.cutoff+'｜'+(p.scope==='self'?'同仁本人':'店長本人；店級待核'):'唯讀核對未通過；未確認指定批次／角色。';
   }catch{if(current===generation&&lease&&authorized())text.textContent='唯讀核對未通過；未確認指定批次／角色。';}
   finally{if(current===generation){busy=false;session(lease);}}
  };
  scope.addEventListener('hashchange',()=>{generation++;busy=false;clear();session(lease && scope.location.hash===marker);});
  session(false);return {session};
 }
 if(typeof module==='object'&&module.exports)module.exports={plan,checked,create};
 else scope.createInterimInsuranceCheck=create;
})(typeof window==='object'?window:null);
