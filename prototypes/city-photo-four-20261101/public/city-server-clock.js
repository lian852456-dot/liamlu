/* A server-time estimate anchored to monotonic elapsed time. No device wall clock.
 * Full request RTT is a conservative upper bound: client checks cannot extend TTL. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CityServerClock=api;})(typeof globalThis==='undefined'?this:globalThis,function(){'use strict';
 function create({monotonic=()=>performance.now()}={}){let epoch=null,tick=0;return Object.freeze({
  sample(serverTime,requestStarted){const end=monotonic(),rtt=end-requestStarted;if(!Number.isSafeInteger(serverTime)||serverTime<=0||!Number.isFinite(requestStarted)||!Number.isFinite(end)||rtt<0||rtt>30000)throw Error('CITY_CLOCK_INVALID');epoch=Math.max(serverTime+rtt,epoch===null?0:epoch+end-tick);tick=end;return epoch;},
  now(){if(epoch===null)throw Error('CITY_CLOCK_UNAVAILABLE');const elapsed=monotonic()-tick;if(!Number.isFinite(elapsed)||elapsed<0)throw Error('CITY_CLOCK_INVALID');return epoch+elapsed;},ready:()=>epoch!==null
 });}
 return Object.freeze({create});
});
