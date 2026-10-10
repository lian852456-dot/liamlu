// Anonymous reads only. Never retry an administrative write or a rejected source.
export function createPublicReader({endpoint,frame,post,timeoutMs=35000}){
 const cancelled=()=>new DOMException('讀取已取消','AbortError');
 async function attempt(transport,payload,signal){
  if(signal?.aborted)throw cancelled();
  const controller=new AbortController();
  const abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  let timer,onAbort;
  try{
   const body=await Promise.race([
    Promise.resolve().then(()=>transport(payload,controller.signal)),
    new Promise((_,reject)=>{
     onAbort=()=>reject(cancelled());controller.signal.addEventListener('abort',onAbort,{once:true});
     timer=setTimeout(()=>{const error=new Error('讀取連線逾時');error.name='TimeoutError';reject(error);controller.abort();},timeoutMs);
    })
   ]);
   if(signal?.aborted)throw cancelled();
   if(body?.status==='error'){const error=new Error(body.message||'來源尚未完成核對');error.authoritative=true;throw error;}
   if(!body||body.status!=='ok'||!Object.hasOwn(body,'snapshot'))throw new Error('服務回應格式不符');
   return body;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',onAbort);}
 }
 return async function read(payload,{signal,onFallback}={}){
  const keys=Object.keys(payload).sort().join('|');
  if(payload.action!=='tradein_performance_public_read'||!['action|month','action|includeDays|month'].includes(keys)||keys.includes('includeDays')&&payload.includeDays!==true)throw Error('只允許公開目標進度讀取');
  try{return await attempt(frame,payload,signal);}
  catch(error){if(signal?.aborted||error.name==='AbortError'||error.authoritative)throw error;}
  onFallback?.();
  return attempt((body,attemptSignal)=>{
   const url=new URL(endpoint);url.searchParams.set('readAttempt',crypto.randomUUID());
   return post(url.toString(),body,attemptSignal);
  },payload,signal);
 };
}

export function readPublicFrame(endpoint,payload,signal){
 return new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID(),url=new URL(endpoint);
  url.searchParams.set('transport','iframe');url.searchParams.set('requestId',requestId);url.searchParams.set('origin',location.origin);
  const frame=document.createElement('iframe'),form=document.createElement('form'),field=document.createElement('textarea');
  let finished=false;
  function finish(error,body){if(finished)return;finished=true;window.removeEventListener('message',message);signal.removeEventListener('abort',abort);frame.remove();form.remove();error?reject(error):resolve(body);}
  function abort(){finish(new DOMException('讀取已取消','AbortError'));}
  function message(event){
   let origin;try{origin=new URL(event.origin);}catch{return;}
   if(origin.protocol!=='https:'||origin.port||!['script.google.com','script.googleusercontent.com'].includes(origin.hostname)&&!origin.hostname.endsWith('-script.googleusercontent.com'))return;
   if(!event.source||event.data?.type!=='north12b-gas-response-v1'||event.data.requestId!==requestId)return;
   finish(null,event.data.body);
  }
  if(signal.aborted){abort();return;}
  frame.name='tradein_progress_'+requestId;frame.title='目標進度讀取';frame.hidden=true;
  form.method='POST';form.action=url.toString();form.target=frame.name;form.enctype='application/x-www-form-urlencoded';form.hidden=true;
  field.name='payload';field.value=JSON.stringify(payload);form.append(field);
  window.addEventListener('message',message);signal.addEventListener('abort',abort,{once:true});document.body.append(frame,form);
  try{form.submit();}catch{finish(new Error('目標進度連線失敗'));}
 });
}
