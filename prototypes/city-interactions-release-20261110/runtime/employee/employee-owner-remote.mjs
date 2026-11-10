// Fixed existing owner deployment; no caller-provided URL, B token or device ID.
export const EMPLOYEE_OWNER_ENDPOINT='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
export function createEmployeeOwnerRemote({fetcher=fetch}={}){
  async function post(action,input){
    const response=await fetcher(EMPLOYEE_OWNER_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',redirect:'follow',
      cache:'no-store',body:JSON.stringify({action,...input}),signal:AbortSignal.timeout(14000)});
    if(!response.ok)throw Error('EMPLOYEE_OWNER_UNAVAILABLE');
    const text=await response.text();if(text.length>12000)throw Error('EMPLOYEE_OWNER_RESPONSE_INVALID');
    let value;try{value=JSON.parse(text);}catch{throw Error('EMPLOYEE_OWNER_RESPONSE_INVALID');}
    if(value?.status!=='ok')throw Error('EMPLOYEE_OWNER_DENIED');return value;
  }
  return Object.freeze({info:()=>post('city_owner_info',{}),redeemHandoff:body=>post('city_handoff_redeem',body),validateLease:body=>post('city_lease_validate',body)});
}
