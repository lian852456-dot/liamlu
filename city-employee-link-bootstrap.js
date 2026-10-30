(function(){'use strict';
  const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  if(location.origin!=='https://lian852456-dot.github.io'||!location.pathname.startsWith('/liamlu/'))return;
  let ownerClient=null;
  try{
    const client=createDashboardBClient(OWNER,{storage:sessionStorage,logoutEpoch:()=>{try{return JSON.parse(localStorage.getItem('north12b_portal_logout_event_v1')||'null')?.id||'';}catch{return '';}}});
    if(typeof client.issueCityHandoff==='function')ownerClient={restore:id=>client.restore(id),session:()=>client.validate(),
      login:({employeeId,deviceId,password})=>client.login(employeeId,deviceId,password),issueCityHandoff:c=>client.issueCityHandoff(c)};
  }catch{/* Failure stays on the original website; no credentials are exported. */}
  window.cityEmployeeLink=CityEmployeeLink.create({ownerClient,getDeviceId(){
    let id=localStorage.getItem('north12b_private_dashboard_device_id');
    if(!id){id=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('north12b_private_dashboard_device_id',id);}return id;
  }});
})();
