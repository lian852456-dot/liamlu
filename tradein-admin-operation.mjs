// Bounds one operation only. Administrative writes are never retried here.
export async function boundedOperation(work,{signal,timeoutMs=60000,timeoutMessage='服務回覆逾時',onSlow,slowMs=10000}={}){
 const cancelled=()=>new DOMException('操作已取消','AbortError');
 if(signal?.aborted)throw cancelled();
 const controller=new AbortController();
 let timer,slowTimer,onAbort;
 const abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});
 try{
  return await Promise.race([
   new Promise((_,reject)=>{
    onAbort=()=>reject(cancelled());controller.signal.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(()=>{const error=new Error(timeoutMessage);error.name='TimeoutError';reject(error);controller.abort();},timeoutMs);
    if(onSlow)slowTimer=setTimeout(onSlow,slowMs);
   }),
   Promise.resolve().then(()=>{if(controller.signal.aborted)throw cancelled();return work(controller.signal);})
  ]);
 }finally{
  clearTimeout(timer);clearTimeout(slowTimer);
  signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',onAbort);
 }
}

// Only preview is read-only. Never replay publish, checkpoint capture or restore,
// including when an HTTP error could have hidden a successful server write.
export async function requestAdmin(endpoint,payload,{signal,onSlow,onRetry,fetcher=fetch,
 timeoutMs=60000,retryDelayMs=1500,requestId=()=>crypto.randomUUID()}={}){
 return boundedOperation(async attemptSignal=>{
  for(let attempt=0;attempt<2;attempt++){
   const url=new URL(endpoint);url.searchParams.set('adminAttempt',requestId());
   const response=await fetcher(url.toString(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(payload),cache:'no-store',credentials:'omit',signal:attemptSignal});
   let body;try{body=await response.json();}catch{}
   // Source/auth rejections are authoritative, even with HTTP 404.
   if(body?.status==='error')throw Error(body.message||'讀取未完成');
   if(!response.ok){
    if(attempt===0&&payload.action==='tradein_performance_preview'&&[404,429,500,502,503,504].includes(response.status)){
     onRetry?.(response.status);
     await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(new DOMException('操作已取消','AbortError'));};
      const timer=setTimeout(()=>{attemptSignal.removeEventListener('abort',abort);resolve();},retryDelayMs);
      if(attemptSignal.aborted){abort();return;}
      attemptSignal.addEventListener('abort',abort,{once:true});
     });
     if(attemptSignal.aborted)throw new DOMException('操作已取消','AbortError');
     continue;
    }
    throw Error('服務暫時無回應（HTTP '+response.status+'）');
   }
   if(!body||typeof body!=='object'||Array.isArray(body))throw Error('服務回應格式不符');
   return body;
  }
 },{signal,onSlow,timeoutMs,timeoutMessage:'服務核對逾時（60 秒），請稍後再試'});
}
