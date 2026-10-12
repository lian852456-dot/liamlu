// Owner-approved October targets. Transaction counts still come from the
// validated private-backed public snapshot; targets have an independent basis.
export const OCTOBER_POLICY=Object.freeze({month:'2026-10',rate:12,personalTarget:4,managersIncluded:true,
 stores:Object.freeze([['酒泉',95,12],['永吉',64,8],['復興南',154,19],['杭州南',160,20],['萬大',142,18],['通化',179,22],['大稻埕',96,12],['三創',288,35],['六張犁',106,13]].map(([store,device,target])=>Object.freeze({store,device,target})))});
export function targetPolicy(month){return month===OCTOBER_POLICY.month?OCTOBER_POLICY:null;}
export function applyTargets(source){
 const policy=targetPolicy(source.month);if(!policy)return source;
 if(policy.stores.some(s=>Math.ceil(s.device*policy.rate/100)!==s.target))throw Error('店目標計算不一致');
 const people=source.people.map(p=>({...p,target_units:policy.personalTarget,
  remaining_units:p.actual_units===null?null:Math.max(policy.personalTarget-p.actual_units,0),
  attainment_status:p.actual_units===null?'pending':p.actual_units>=policy.personalTarget?'met':'in_progress'}));
 const stores=source.stores.map(s=>{const target=policy.stores.find(p=>p.store===s.store);if(!target)throw Error('核定店目標缺漏');
  const group=people.filter(p=>p.store===s.store);return {...s,target_units:target.target,device_target:target.device,
   remaining_units:Math.max(target.target-s.actual_units,0),target_people:group.length,met_people:group.filter(p=>p.attainment_status==='met').length};});
 return {...source,people,stores,target_policy:policy,
  summary:{...source.summary,target_units:stores.reduce((n,s)=>n+s.target_units,0),remaining_units:stores.reduce((n,s)=>n+s.remaining_units,0),
   target_people:people.length,met_people:people.filter(p=>p.attainment_status==='met').length,
   personal_target_units:people.length*policy.personalTarget,personal_remaining_units:people.reduce((n,p)=>n+(p.remaining_units||0),0)}};
}
export function personalRules(month){const policy=targetPolicy(month);return policy?{staffTarget:policy.personalTarget,actingManager:'included'}:{staffTarget:3,actingManager:'exempt'};}
