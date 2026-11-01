/* Original-site navigation only. This module never authenticates employees,
 * reads business data, submits reports, or promotes a city guest/demo role. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.CityWorkPortals=api;})(typeof window==='undefined'?null:window,function(root){
 'use strict';
 const ORIGIN='https://lian852456-dot.github.io',BASE=ORIGIN+'/liamlu/';
 const cityData=root?.North12BCityData||(typeof module==='object'&&module.exports?require('./city-data.js'):null);
 const mappedUrl=item=>item.id==='priceQuery'?cityData?.formalLinkAlternates?.priceQuery:cityData?.formalLinks?.[item.id==='phoneAwards'?'price':item.id];
 const definitions=Object.freeze([
  {id:'kpi',title:'KPI 戰情',path:'kpi-battle.html',building:'kpi',kind:'protected',note:'正式 KPI 內容需原網站員工驗證。'},
  {id:'awards',title:'台獎中心',path:'kpi-battle.html#awards',building:'awards',kind:'protected',note:'開啟 KPI 戰情中的台獎區段，仍由原網站驗證。'},
  {id:'operations',title:'智慧營運中心',path:'home.html',kind:'directory',note:'各項工作網站沿用原有登入與權限。'},
  {id:'report',title:'每日回報',path:'index.html',building:'report',kind:'original-site',note:'在原網站填報；小城不會代送回報或判定正式完成。'},
  {id:'tradein',title:'舊換新專區',path:'tradein-progress.html',building:'tradein',kind:'mixed',note:'公開分享可瀏覽；舊分享、管理與同步仍依原權限。'},
  {id:'phoneAwards',title:'手機獎金',path:'awards-battle.html',building:'price',kind:'protected',note:'台獎戰情／手機獎金，不是手機售價查詢。'},
  {id:'priceQuery',title:'查價格・手機專案價',path:'threec-query.html',kind:'public-tool',note:'原網站提供的一般／企業手機專案價查詢，免登入瀏覽。'}
 ].map(value=>Object.freeze({...value,url:mappedUrl(value)||null})));
 const aliases=Object.freeze({price:'phoneAwards'});
 function route(id){return definitions.find(item=>item.id===(aliases[id]||id))||null;}
 function safeUrl(id){const item=route(id);if(!item||!item.url)return null;const u=new URL(item.url);return u.origin===ORIGIN&&u.href===BASE+item.path&&!u.username&&!u.password?u.href:null;}
 // A URL handoff carries no employee assertion, callback token or city card.
 function intent(id){const item=route(id);return item?Object.freeze({id:item.id,title:item.title,url:safeUrl(id),mode:'original-site-handoff',cityEmployeeVerified:false,originalSiteOwnsAuthorization:true}):null;}
 if(!root)return{definitions,route,safeUrl,intent};
 let config={},dialog=null,busy=false;
 const make=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 function shell(title){root.CityUI?.setOpen(false);if(!dialog){dialog=make('dialog');dialog.id='city-work-portals';dialog.className='city-work-portals';document.body.append(dialog);}if(dialog.open)dialog.close();dialog.replaceChildren();const close=make('button','×');close.type='button';close.className='close';close.setAttribute('aria-label','返回小城');close.onclick=()=>dialog.close();dialog.append(close,make('h2',title));dialog.showModal();return dialog;}
 function appendOfficialLink(host,id){const item=route(id);if(!item||!safeUrl(id))return;const a=make('a',item.kind==='public-tool'?'開啟手機專案價查詢 ↗':'開啟'+item.title+'原網站 ↗');a.className='work-portal-open primary';a.href=safeUrl(id);a.target='_blank';a.rel='noopener noreferrer';a.dataset.workPortal=item.id;a.addEventListener('click',()=>{const panel=a.closest('dialog');if(panel?.open)panel.close();});host.append(a,make('p','網站會另開分頁；完成後關閉該分頁即可回到原小城。'));return a;}
 function showHandoff(id,{cityAccess='unverified'}={}){const item=route(id);if(!item)return false;const host=shell(item.title),status=make('p');status.className='work-portal-status';status.dataset.cityAccess=cityAccess;status.textContent=item.kind==='public-tool'?'公開查價工具':cityAccess==='denied'?'城市內部大樓未開放。你可另開原網站，依該站原有流程登入或查詢。':'正式內容仍由原網站確認權限；試玩卡不代表正式員工身分。';host.append(status,make('p',item.note));appendOfficialLink(host,id);const back=make('button','返回小城');back.type='button';back.className='text-button';back.onclick=()=>host.close();host.append(back);return true;}
 async function open(id){const item=route(id);if(!item||busy)return false;if(!item.building)return showHandoff(id);busy=true;try{if(typeof config.authorizeCityBuilding!=='function')return showHandoff(id,{cityAccess:'denied'});await config.authorizeCityBuilding(item.building);return showHandoff(id,{cityAccess:'demo-only'});}catch(error){if([401,403].includes(error.status))return showHandoff(id,{cityAccess:'denied'});const host=shell(item.title);host.append(make('p','目前無法確認小城連線，請稍後再試。'));const back=make('button','返回小城');back.type='button';back.onclick=()=>host.close();host.append(back);return false;}finally{busy=false;}}
 function showDirectory(){const zone=root.CozyWorld?.state?.().zone||'jiuquan',store=cityData?.stores?.find(item=>item.id===zone),host=shell((store?.short||'酒泉')+'・工作入口'),intro=make('p','KPI／台獎放在前方；其餘工作網站接續列出。原網站另開分頁，小城角色與進度保留；正式內容仍依原網站權限，不代送回報或發放正式獎勵。');host.append(intro);const list=make('div');list.className='work-portal-list';for(const [index,item]of definitions.entries()){if(index===2)list.append(make('h3','其他工作入口'));const button=make('button');button.type='button';button.dataset.workRoute=item.id;button.append(make('strong',item.title),make('small',item.kind==='public-tool'?'公開查價':item.kind==='protected'?'需原網站員工驗證':item.kind==='mixed'?'公開分享／原有權限':'沿用原網站流程'));button.onclick=()=>open(item.id);list.append(button);}const back=make('button','返回小城');back.type='button';back.className='text-button';back.onclick=()=>host.close();host.append(list,back);}
 function init(options={}){config={...options};}
 addEventListener('city-work-counter',showDirectory);addEventListener('city-work-sites',showDirectory);
 return{definitions,route,safeUrl,intent,init,open,showDirectory,showHandoff,appendOfficialLink};
});
