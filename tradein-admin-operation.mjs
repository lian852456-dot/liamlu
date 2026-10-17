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
