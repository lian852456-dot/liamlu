// Public-link consent applies only to new cases. A missing audience stays private.
// Keep the owner overlay independent of the progress engine absent on B.
function tradeinSharingStore_(value) {
  return ['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'].indexOf(value)>=0;
}
function tradeinSharingText_(value,max,required) {
  if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||required&&!value.trim())throw Error('SHARE_INPUT_INVALID');
  return value.trim();
}
function tradeinSharingDate_(instant) {
  const time=new Date(instant).getTime();
  if(!Number.isFinite(time))throw Error('SHARE_DATA_INVALID');
  // Asia/Taipei is UTC+08 throughout the supported 2000–2099 dates.
  return new Date(time+8*3600000).toISOString().slice(0,10);
}
function tradeinSharingRange_(start,end) {
  function date(s){const time=Date.parse(s+'T00:00:00Z');if(typeof s!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==s)throw Error('SHARE_RANGE_INVALID');return time;}
  const a=date(start),b=date(end);
  if(b<a||b-a>92*86400000)throw Error('SHARE_RANGE_INVALID');
  const months=[];let cursor=start.slice(0,7);
  while(cursor<=end.slice(0,7)){months.push(cursor);const d=new Date(cursor+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);cursor=d.toISOString().slice(0,7);}
  return {start:start,end:end,months:months};
}
function tradeinSharingState_(month) {
  if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('SHARE_MONTH_INVALID');
  const name='north12b-tradein-sharing-'+month+'.json',file=tradeinPerformanceFile_(name);
  const raw=file?file.getBlob().getDataAsString('UTF-8'):'';
  if(raw.length>8000000)throw Error('SHARE_CAPACITY');
  const state=raw?JSON.parse(raw):{schema:'tradein-sharing/v1',month:month,revision:0,cases:[]};
  if(state.schema!=='tradein-sharing/v1'||state.month!==month||!Array.isArray(state.cases)||state.cases.length>500)throw Error('SHARE_DATA_INVALID');
  return {name:name,file:file,state:state};
}
function tradeinSharingWrite_(entry) {
  const body=JSON.stringify(entry.state);if(body.length>8000000)throw Error('SHARE_CAPACITY');
  if(entry.file)entry.file.setContent(body);else tradeinPerformanceFolder_().createFile(entry.name,body,MimeType.PLAIN_TEXT);
}
function tradeinSharingPublicVisible_(row) {
  return row.audience==='public-link/v1'&&row.hidden===false;
}
function tradeinSharingProject_(row,actor,image,month) {
  return {id:row.id,month:month||tradeinSharingDate_(row.createdAt).slice(0,7),version:row.version,store:row.store,author:row.author,
    authorUnverified:row.audience==='public-link/v1',audience:row.audience==='public-link/v1'?'public-link/v1':'private',
    type:row.type,scenario:row.scenario,approach:row.approach,outcome:row.outcome,createdAt:row.createdAt,
    createdDate:tradeinSharingDate_(row.createdAt),updatedAt:row.updatedAt,featured:row.featured,hidden:row.hidden,
    editable:Boolean(actor&&(actor.supervisor||actor.id&&row.owner===actor.id)),hasImage:Boolean(row.image),image:image?row.image:undefined};
}
function tradeinSharingImage_(image) {
  image=tradeinSharingText_(image,1100000,false);
  if(image){
    const encoded=image.slice(image.indexOf(',')+1);
    if(encoded.length%4||Math.floor(encoded.length*3/4)-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0)>800*1024||
      !/^data:image\/(?:png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}|jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}|webp;base64,UklGR[A-Za-z0-9+/]*={0,2})$/.test(image))throw Error('SHARE_IMAGE_INVALID');
  }
  return image;
}
// Always called under the existing owner ScriptLock. Global quotas do not trust
// client/IP identity; the deployment is not protected merely by CORS or buttons.
function tradeinSharingGuard_(kind,store,time) {
  const name='north12b-tradein-sharing-public-guard.json',file=tradeinPerformanceFile_(name);
  const raw=file?file.getBlob().getDataAsString('UTF-8'):'';
  if(raw.length>12000)throw Error('SHARE_CAPACITY');
  let g=raw?JSON.parse(raw):{v:1,minute:0,reads:0,day:'',creates:0,hour:0,hourCreates:0,stores:{}};
  if(g.v!==1||!Number.isSafeInteger(g.reads)||!Number.isSafeInteger(g.creates)||!Number.isSafeInteger(g.hourCreates)||!g.stores||Array.isArray(g.stores))throw Error('SHARE_DATA_INVALID');
  const minute=Math.floor(time/60000),hour=Math.floor(time/3600000),day=tradeinSharingDate_(time);
  if(g.minute!==minute){g.minute=minute;g.reads=0;}
  if(g.hour!==hour){g.hour=hour;g.hourCreates=0;}
  if(g.day!==day){g.day=day;g.creates=0;g.stores={};}
  if(g.reads>=120)throw Error('SHARE_RATE_LIMIT');g.reads++;
  if(kind==='create'){
    if(g.creates>=100||g.hourCreates>=20||(g.stores[store]||0)>=20)throw Error('SHARE_RATE_LIMIT');
    g.creates++;g.hourCreates++;g.stores[store]=(g.stores[store]||0)+1;
  }
  const body=JSON.stringify(g);if(file)file.setContent(body);else tradeinPerformanceFolder_().createFile(name,body,MimeType.PLAIN_TEXT);
}
// Existing authenticated calls remain inside the B session/eligibility lock.
function tradeinSharingOperation_(p,actor) {
  if(['employee_tradein_sharing_list','employee_tradein_sharing_detail','employee_tradein_sharing_save','employee_tradein_sharing_moderate'].indexOf(p.action)<0)throw Error('SHARE_ACTION_INVALID');
  const entry=tradeinSharingState_(p.month),state=entry.state;
  if(p.action==='employee_tradein_sharing_list')return {status:'ok',revision:state.revision,
    profile:{store:actor.store,author:actor.author,supervisor:actor.supervisor},
    cases:state.cases.filter(function(row){return !row.hidden||actor.id&&row.owner===actor.id||actor.supervisor;}).map(function(row){return tradeinSharingProject_(row,actor,false,p.month);})};
  const id=tradeinSharingText_(p.id,80,true);if(!/^[a-zA-Z0-9_-]{16,80}$/.test(id))throw Error('SHARE_ID_INVALID');
  const prior=state.cases.find(function(row){return row.id===id;});
  if(p.action==='employee_tradein_sharing_detail'){
    if(!prior||prior.hidden&&prior.owner!==actor.id&&!actor.supervisor)throw Error('SHARE_NOT_FOUND');
    return {status:'ok',item:tradeinSharingProject_(prior,actor,true,p.month)};
  }
  if(!Number.isSafeInteger(p.version)||p.version<0||p.version!==(prior?prior.version:0))throw Error('SHARE_VERSION_CONFLICT');
  if(p.action==='employee_tradein_sharing_moderate'){
    if(!actor.supervisor||!prior||typeof p.featured!=='boolean'||typeof p.hidden!=='boolean')throw Error('SHARE_DENIED');
    prior.featured=p.featured;prior.hidden=p.hidden;prior.version++;prior.updatedAt=new Date().toISOString();
  }else{
    if(prior&&(!actor.id||prior.owner!==actor.id)&&!actor.supervisor)throw Error('SHARE_DENIED');
    if(!['成功成交','未成交','改善心得'].includes(p.type))throw Error('SHARE_TYPE_INVALID');
    const scenario=tradeinSharingText_(p.scenario,1000,true),approach=tradeinSharingText_(p.approach,1500,true),outcome=tradeinSharingText_(p.outcome,1000,true);
    const image=p.image===null?(prior?.image||''):tradeinSharingImage_(p.image),now=new Date().toISOString();
    const publicNew=!prior&&(actor.publicCreate===true||p.publicConsent===true);
    // Never upgrade an existing private case or attach a shared anonymous actor.
    if(prior&&(p.publicConsent!==undefined||p.publicStore!==undefined||p.publicAuthor!==undefined))throw Error('SHARE_DENIED');
    let store=prior?prior.store:actor.store,author=prior?prior.author:actor.author;
    if(publicNew){
      store=actor.publicCreate?actor.store:p.publicStore;author=tradeinSharingText_(actor.publicCreate?actor.author:p.publicAuthor,60,true);
      if(!tradeinSharingStore_(store))throw Error('SHARE_INPUT_INVALID');
      if(p.month!==tradeinSharingDate_(now).slice(0,7))throw Error('SHARE_MONTH_INVALID');
      if(!actor.publicCreate)tradeinSharingGuard_('create',store,Date.now());
    }else if(!prior&&(p.publicStore!==undefined||p.publicAuthor!==undefined||p.publicConsent!==undefined))throw Error('SHARE_DENIED');
    const row={id:id,version:(prior?.version||0)+1,owner:prior?prior.owner:actor.id||null,store:store,author:author,
      type:p.type,scenario:scenario,approach:approach,outcome:outcome,image:image,createdAt:prior?prior.createdAt:now,
      updatedAt:now,featured:prior?prior.featured:false,hidden:prior?prior.hidden:false};
    if(prior){if(prior.audience!==undefined)row.audience=prior.audience;if(prior.submissionHash)row.submissionHash=prior.submissionHash;if(prior.submissionDigest)row.submissionDigest=prior.submissionDigest;}
    else if(publicNew)row.audience='public-link/v1';
    if(actor.publicCreate){row.submissionHash=actor.submissionHash;row.submissionDigest=actor.submissionDigest;}
    if(prior)state.cases[state.cases.indexOf(prior)]=row;else{if(state.cases.length>=500)throw Error('SHARE_CAPACITY');state.cases.push(row);}
  }
  state.revision++;tradeinSharingWrite_(entry);
  return {status:'ok',item:tradeinSharingProject_(state.cases.find(function(row){return row.id===id;}),actor,false,p.month)};
}
function tradeinSharingPublicHandle_(p) {
  const fields={
    tradein_sharing_public_list:['action','start','end'],
    tradein_sharing_public_detail:['action','month','id'],
    tradein_sharing_public_receipt:['action','requestId'],
    tradein_sharing_public_create:['action','requestId','submittedAt','store','author','consent','type','scenario','approach','outcome','image']
  };
  if(!p||Array.isArray(p)||!Object.prototype.hasOwnProperty.call(fields,p.action)||Object.keys(p).some(function(k){return fields[p.action].indexOf(k)<0;}))throw Error('SHARE_INPUT_INVALID');
  const time=Date.now(),create=p.action==='tradein_sharing_public_create';
  // Both gates and exact owner are mandatory; never enable peers/upload deployments.
  if(PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_!==true||PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_!==true)throw Error('SHARE_UNAVAILABLE');
  const config=privateDashboardAuthOwnerConfig_();if(config.owner!==config.current)throw Error('SHARE_UNAVAILABLE');
  if(typeof reportUploadIsUploadDeployment_==='function'&&reportUploadIsUploadDeployment_())throw Error('SHARE_UNAVAILABLE');
  return privateDashboardRosterTransaction_(function(){
    tradeinSharingGuard_('read','',time);
    if(p.action==='tradein_sharing_public_list'){
      const range=tradeinSharingRange_(p.start,p.end),cases=[];
      range.months.forEach(function(month){tradeinSharingState_(month).state.cases.forEach(function(row){
        if(tradeinSharingPublicVisible_(row)){const date=tradeinSharingDate_(row.createdAt);if(date>=range.start&&date<=range.end){if(cases.length>=500)throw Error('SHARE_CAPACITY');cases.push(tradeinSharingProject_(row,null,false));}}
      });});return {status:'ok',start:range.start,end:range.end,cases:cases};
    }
    if(p.action==='tradein_sharing_public_detail'){
      const id=tradeinSharingText_(p.id,80,true);if(!/^[A-Za-z0-9_-]{16,80}$/.test(id))throw Error('SHARE_NOT_FOUND');
      const row=tradeinSharingState_(p.month).state.cases.find(function(r){return r.id===id;});
      if(!row||!tradeinSharingPublicVisible_(row))throw Error('SHARE_NOT_FOUND');
      return {status:'ok',item:tradeinSharingProject_(row,null,true)};
    }
    if(typeof p.requestId!=='string'||!/^[-a-zA-Z0-9_]{20,80}$/.test(p.requestId))throw Error('SHARE_INPUT_INVALID');
    const hash=privateDashboardGasAuthDigest_(p.requestId),month=tradeinSharingDate_(time).slice(0,7);
    const previous=new Date(month+'-01T00:00:00Z');previous.setUTCMonth(previous.getUTCMonth()-1);
    let prior=null;
    [month,previous.toISOString().slice(0,7)].forEach(function(m){tradeinSharingState_(m).state.cases.forEach(function(row){if(row.submissionHash===hash){if(prior)throw Error('SHARE_DATA_INVALID');prior=row;}});});
    if(!create)return {status:'ok',found:Boolean(prior&&tradeinSharingPublicVisible_(prior)),item:prior&&tradeinSharingPublicVisible_(prior)?tradeinSharingProject_(prior,null,false):undefined};
    if(p.consent!==true||!Number.isSafeInteger(p.submittedAt)||!tradeinSharingStore_(p.store))throw Error('SHARE_INPUT_INVALID');
    const author=tradeinSharingText_(p.author,60,true),scenario=tradeinSharingText_(p.scenario,1000,true),approach=tradeinSharingText_(p.approach,1500,true),outcome=tradeinSharingText_(p.outcome,1000,true),image=tradeinSharingImage_(p.image);
    if(!['成功成交','未成交','改善心得'].includes(p.type))throw Error('SHARE_TYPE_INVALID');
    const digest=privateDashboardGasAuthDigest_(JSON.stringify([p.submittedAt,p.store,author,p.type,scenario,approach,outcome,image]));
    if(prior){if(!tradeinSharingPublicVisible_(prior)||prior.submissionDigest!==digest)throw Error('SHARE_VERSION_CONFLICT');return {status:'ok',duplicate:true,item:tradeinSharingProject_(prior,null,false)};}
    if(time-p.submittedAt>600000||p.submittedAt-time>60000)throw Error('SHARE_INPUT_INVALID');
    tradeinSharingGuard_('create',p.store,time);
    const result=tradeinSharingOperation_({action:'employee_tradein_sharing_save',month:month,id:Utilities.getUuid(),version:0,type:p.type,scenario:scenario,approach:approach,outcome:outcome,image:image},
      {id:null,store:p.store,author:author,supervisor:false,publicCreate:true,submissionHash:hash,submissionDigest:digest});
    return result;
  });
}
// Called by the existing B entry point. The four actions above are the entire
// public surface; no other employee/admin/KPI route gains anonymous access.
function tradeinSharingPublicMaybePost_(event) {
  const raw=event&&event.postData&&event.postData.contents;
  if(typeof raw!=='string'||raw.length>1120000)return null;
  let p;try{p=JSON.parse(raw);}catch(_){return null;}
  if(!p||typeof p.action!=='string'||p.action.indexOf('tradein_sharing_public_')!==0)return null;
  let result;
  try{
    if(!/^text\/plain(?:;\s*charset=utf-8)?$/i.test(String(event.postData.type||''))||raw.length>(p.action==='tradein_sharing_public_create'?1120000:16384))throw Error('SHARE_INPUT_INVALID');
    result=tradeinSharingPublicHandle_(p);
  }catch(e){const code=String(e.message||'');result={status:'error',code:['SHARE_RATE_LIMIT','SHARE_CAPACITY','SHARE_IMAGE_INVALID','SHARE_INPUT_INVALID','SHARE_RANGE_INVALID','SHARE_VERSION_CONFLICT'].includes(code)?code:'SHARE_UNAVAILABLE'};}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
