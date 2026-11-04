/* Page lifecycle recovery: the server session, not a socket or invite, decides login. */
(function(root){'use strict';
 function create(o){
  let attempt=0,inFlight=null,controller=null,timer=null,failures=0,forcePending=false,stopped=false;
  const visible=()=>!stopped&&o.isVisible();
  function cancelTimer(){if(timer){clearTimeout(timer);timer=null;}}
  function pause(){attempt++;cancelTimer();controller?.abort();controller=null;inFlight=null;}
  function restore({force=false}={}){
   forcePending=forcePending||force;if(!visible())return Promise.resolve(null);if(inFlight)return inFlight;
   cancelTimer();const id=++attempt,epoch=o.getEpoch();controller=new AbortController();const requestController=controller,signal=requestController.signal;
   const timeout=setTimeout(()=>requestController.abort(),12000);
   const current=()=>id===attempt&&epoch===o.getEpoch()&&visible();
   inFlight=(async()=>{try{
    const data=await o.readSession(signal);if(!current())return null;
    failures=0;const reconnect=forcePending;forcePending=false;await o.onSession(data,{force:reconnect});return data;
   }catch(error){if(!current())return null;
    if(error.status===401&&['AUTH_REQUIRED','SESSION_EXPIRED'].includes(error.code)){forcePending=false;o.onInvalid(error);return null;}
    failures++;o.onUnavailable(error);
    timer=setTimeout(()=>{timer=null;restore();},Math.min(8000,1000*2**Math.min(failures,3)));
    return null;
   }finally{clearTimeout(timeout);if(id===attempt){inFlight=null;controller=null;}}})();
   return inFlight;
  }
  return{restore,pause,stop(){stopped=true;pause();},getState(){return{pending:!!inFlight,retryScheduled:!!timer,failures}}};
 }
 const api={create};root.CitySessionRecovery=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
