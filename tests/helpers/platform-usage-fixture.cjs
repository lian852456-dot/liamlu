const core=require('../../platform-usage-core.js');
const {randomUUID}=require('node:crypto');
const NOW=Date.parse('2026-10-23T04:00:00Z');
const SINCE=core.midnight('2026-10-17');
const FEATURES={home:'connected',kpi:'connected',awards:'connected',personal:'connected'};
function interval(actor,start,ms,feature='home',store='酒泉') {
  return {id:randomUUID(),v:1,type:'engaged_interval',feature,visit:randomUUID(),tab:randomUUID(),at:start+ms,
    start,end:start+ms,actor,store,receivedAt:start+ms,identity:'verified-account'};
}
function fixture() {
  const events=[
    ...[0,15000,30000,45000].map(n=>interval('合成帳號 A',NOW-900000+n,15000)),
    interval('合成帳號 A',NOW-900000,30000,'kpi'),
    interval('合成帳號 B',NOW-600000,20000,'awards','萬大'),
    interval('合成帳號 C',NOW-3*core.DAY,15000,'personal','三創')
  ];
  const roster={complete:true,version:'SYNTHETIC-ONLY-v1',validFrom:SINCE,validUntil:NOW+core.DAY,
    members:['A','B','C','D','E'].map((id,i)=>({actor:'合成帳號 '+id,store:['酒泉','萬大','三創','酒泉','萬大'][i],from:SINCE,until:NOW+core.DAY,features:Object.keys(FEATURES)}))};
  const filters={start:'2026-10-17',end:'2026-10-23',store:'all',feature:'all'};
  return {events,roster,filters,options:{now:NOW,since:SINCE,features:FEATURES,filters},
    config:{enabled:true,noticeApproved:true,retentionApproved:true,ownerVerificationApproved:true,storageApproved:true,
      ownerSubject:'SYNTHETIC-OWNER-SUBJECT',since:SINCE,features:FEATURES}};
}
module.exports={fixture,interval,NOW,SINCE,FEATURES};
