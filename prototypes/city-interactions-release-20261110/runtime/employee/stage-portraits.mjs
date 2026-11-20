// Display projection only. This registry never establishes ownership or writes a profile.
export const STAGE_PORTRAITS = Object.freeze({
  '5511180': Object.freeze({name:'嘉玲',preset:'portrait-jialing-v1'}),
  '5513075': Object.freeze({name:'依芯',preset:'portrait-yixin-v1'}),
  '5514420': Object.freeze({name:'李舒緩',preset:'portrait-li-shuhuan-v1'}),
  '5515263': Object.freeze({name:'蔡後琪',preset:'portrait-trial-b-v1'}),
  '5513775': Object.freeze({name:'劉安妮',preset:'portrait-trial-a-v1'}),
  '5517020': Object.freeze({name:'袁宇程',preset:'photo-p1-v1'}),
  '5510804': Object.freeze({name:'蔡妘㮀',preset:'photo-p2-v1'}),
  '5513195': Object.freeze({name:'莊佩璇',preset:'photo-p4-v1'})
});

export function attachStagePortraits({app,activeRoster,worldId='current-guests',blockedUids=[]}) {
  const db=app.store.db,active=new Set(activeRoster.filter(r=>r.active===true).map(r=>r.employeeId)),blocked=new Set(blockedUids);
  const queries=new Map();
  const lookup=()=>['city_employee_owners','city_play_links'].flatMap(t=>{if(!queries.has(t)&&db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t))queries.set(t,db.prepare(`SELECT employee_id,city_uid FROM ${t} WHERE world_id=? AND employee_id=?`));return queries.has(t)?[queries.get(t)]:[];});
  function binding(id) {
    if(!active.has(id)||!STAGE_PORTRAITS[id])return null;
    const matches=lookup().map(q=>q.get(worldId,id)).filter(Boolean),uids=new Set(matches.map(r=>r.city_uid));
    if(uids.size>1)throw Error('STAGE_BINDING_CONFLICT');
    const uid=matches[0]?.city_uid;
    if(!uid||blocked.has(uid)||!db.prepare('SELECT 1 FROM users WHERE id=?').get(uid))return null;
    return {city_uid:uid,employee_id:id};
  }
  // Check conflicts before attaching anything. Never infer an owner from a nickname.
  for(const id of Object.keys(STAGE_PORTRAITS))binding(id);
  const original=app.store.user.bind(app.store);
  app.store.user=uid=>{
    const profile=original(uid);
    for(const [id,display]of Object.entries(STAGE_PORTRAITS))if(binding(id)?.city_uid===uid)
      return {...profile,avatarPreset:display.preset,portraitBinding:'linked'};
    return profile;
  };
  return Object.freeze({get:id=>active.has(id)?STAGE_PORTRAITS[id]:undefined,binding,signature:()=>Object.keys(STAGE_PORTRAITS).map(id=>binding(id)?.city_uid||'').join('|')});
}
