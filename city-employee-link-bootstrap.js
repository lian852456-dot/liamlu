(async function(){'use strict';
 const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',CITY='https://immediate-temporary-cage-warriors.trycloudflare.com';
 if(location.origin!=='https://lian852456-dot.github.io'||!location.pathname.startsWith('/liamlu/'))return;
 const mono=()=>performance.now(),cityClock=CityServerClock.create({monotonic:mono}),ownerClock=CityServerClock.create({monotonic:mono});
 const client=createDashboardBClient(OWNER,{storage:sessionStorage,now:()=>ownerClock.now(),cityNow:()=>cityClock.now(),logoutEpoch:()=>{try{return JSON.parse(localStorage.getItem('north12b_portal_logout_event_v1')||'null')?.id||'';}catch{return '';}}});
 async function syncClock(challengeId){
  const requestId=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),cityStarted=mono();
  const city=new Promise((resolve,reject)=>{let timer;const stop=()=>{clearTimeout(timer);removeEventListener('message',receive);};function receive(e){const d=e.data;if(e.origin!==CITY||e.source!==opener||d?.type!=='city-employee-clock/response-v1'||d.challengeId!==challengeId||d.requestId!==requestId)return;stop();try{cityClock.sample(d.serverTime,cityStarted);resolve();}catch(error){reject(error);}}
   addEventListener('message',receive);timer=setTimeout(()=>{stop();reject(Error('CITY_CLOCK_TIMEOUT'));},20000);
   if(!opener){stop();reject(Error('CITY_OPENER_MISSING'));return;}opener.postMessage({type:'city-employee-clock/request-v1',challengeId,requestId},CITY);
  });
  const owner=(async()=>{const started=mono(),r=await fetch(OWNER,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',cache:'no-store',body:JSON.stringify({action:'city_owner_info'}),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('OWNER_CLOCK_UNAVAILABLE');const data=await r.json();if(data.status!=='ok'||data.schema!=='city-employee-bridge/v1'||data.audience!=='north12b-city-formal-login'||data.originalTokensExported!==false)throw Error('OWNER_CLOCK_INVALID');ownerClock.sample(data.serverTime,started);})();
  await Promise.all([city,owner]);
 }
 const ownerClient={restore:id=>client.restore(id),session:()=>client.validate(),login:({employeeId,deviceId,password})=>client.login(employeeId,deviceId,password),issueCityHandoff:c=>client.issueCityHandoff(c)};
 window.cityEmployeeLink=CityEmployeeLink.create({ownerClient,now:()=>cityClock.now(),syncClock,getDeviceId(){let id=localStorage.getItem('north12b_private_dashboard_device_id');if(!id){id=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('north12b_private_dashboard_device_id',id);}return id;}});
})();
