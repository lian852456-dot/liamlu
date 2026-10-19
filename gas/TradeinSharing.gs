// Called only inside the existing password-session transaction, after eligibility.
function tradeinSharingOperation_(p, actor) {
  function text(value, max, required) {
    if(typeof value!=='string' || value.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || required&&!value.trim())throw Error('SHARE_INPUT_INVALID');
    return value.trim();
  }
  const month=text(p.month,7,true);
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('SHARE_MONTH_INVALID');
  const name='north12b-tradein-sharing-'+month+'.json';
  const file=tradeinPerformanceFile_(name);
  const state=file?JSON.parse(file.getBlob().getDataAsString('UTF-8')):{schema:'tradein-sharing/v1',month:month,revision:0,cases:[]};
  if(state.schema!=='tradein-sharing/v1'||state.month!==month||!Array.isArray(state.cases)||state.cases.length>500)throw Error('SHARE_DATA_INVALID');
  function project(row, image) {
    return {id:row.id,version:row.version,store:row.store,author:row.author,type:row.type,scenario:row.scenario,
      approach:row.approach,outcome:row.outcome,createdAt:row.createdAt,updatedAt:row.updatedAt,
      featured:row.featured,hidden:row.hidden,editable:row.owner===actor.id||actor.supervisor,
      hasImage:Boolean(row.image),image:image?row.image:undefined};
  }
  if(p.action==='employee_tradein_sharing_list')return {status:'ok',revision:state.revision,
    profile:{store:actor.store,author:actor.author,supervisor:actor.supervisor},
    cases:state.cases.filter(function(row){return !row.hidden||row.owner===actor.id||actor.supervisor;}).map(function(row){return project(row,false);})};
  const id=text(p.id,80,true);
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(id))throw Error('SHARE_ID_INVALID');
  const prior=state.cases.find(function(row){return row.id===id;});
  if(p.action==='employee_tradein_sharing_detail') {
    if(!prior||prior.hidden&&prior.owner!==actor.id&&!actor.supervisor)throw Error('SHARE_NOT_FOUND');
    return {status:'ok',item:project(prior,true)};
  }
  if(!Number.isSafeInteger(p.version)||p.version<0||p.version!==(prior?prior.version:0))throw Error('SHARE_VERSION_CONFLICT');
  if(p.action==='employee_tradein_sharing_moderate') {
    if(!actor.supervisor||!prior||typeof p.featured!=='boolean'||typeof p.hidden!=='boolean')throw Error('SHARE_DENIED');
    prior.featured=p.featured;prior.hidden=p.hidden;prior.version++;prior.updatedAt=new Date().toISOString();
  } else if(p.action==='employee_tradein_sharing_save') {
    if(prior&&prior.owner!==actor.id&&!actor.supervisor)throw Error('SHARE_DENIED');
    if(!['成功成交','未成交','改善心得'].includes(p.type))throw Error('SHARE_TYPE_INVALID');
    const scenario=text(p.scenario,1000,true),approach=text(p.approach,1500,true),outcome=text(p.outcome,1000,true);
    // null preserves the current image; empty string removes it. No arbitrary URLs/HTML.
    let image=p.image===null?(prior?.image||''):text(p.image,1100000,false);
    if(image){const encoded=image.slice(image.indexOf(',')+1);if(Math.floor(encoded.length*3/4)-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0)>800*1024)throw Error('SHARE_IMAGE_INVALID');}
    if(image&&!/^data:image\/(?:png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}|jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}|webp;base64,UklGR[A-Za-z0-9+/]*={0,2})$/.test(image))throw Error('SHARE_IMAGE_INVALID');
    const now=new Date().toISOString();
    const row={id:id,version:(prior?.version||0)+1,owner:prior?prior.owner:actor.id,store:prior?prior.store:actor.store,
      author:prior?prior.author:actor.author,type:p.type,scenario:scenario,approach:approach,outcome:outcome,image:image,
      createdAt:prior?prior.createdAt:now,updatedAt:now,featured:prior?prior.featured:false,hidden:prior?prior.hidden:false};
    if(prior)state.cases[state.cases.indexOf(prior)]=row;
    else {if(state.cases.length>=500)throw Error('SHARE_CAPACITY');state.cases.push(row);}
  } else throw Error('SHARE_ACTION_INVALID');
  state.revision++;
  const body=JSON.stringify(state);
  if(body.length>8000000)throw Error('SHARE_CAPACITY');
  if(file)file.setContent(body);else tradeinPerformanceFolder_().createFile(name,body,MimeType.PLAIN_TEXT);
  return {status:'ok',item:project(state.cases.find(function(row){return row.id===id;}),false)};
}
