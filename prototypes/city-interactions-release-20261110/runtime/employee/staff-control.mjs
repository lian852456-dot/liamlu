// Isolated staff-control candidate.  The live server must bind ownerId from
// its authenticated identity before constructing this controller; public
// employee numbers are never accepted as passwords or caller-supplied proof.
export const DEFAULT_GRACE_MS=8000;
export const DEFAULT_LOD_RADIUS=18;
export const DEFAULT_APPEARANCE='default';

export class StaffControlError extends Error{
  constructor(code,message=code,status=409){super(message);this.name='StaffControlError';this.code=code;this.status=status;}
}

const fail=(code,message=code,status=409)=>{throw new StaffControlError(code,message,status)};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const string=value=>typeof value==='string'&&value.length>0;
const allow=(body,keys)=>{if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_BODY');for(const key of Object.keys(body))if(!keys.includes(key))fail('INVALID_FIELDS:'+key,`unexpected field: ${key}`,400);};
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const fingerprint=value=>JSON.stringify(value);

function validPose(pose){
  return !!pose&&typeof pose==='object'&&!Array.isArray(pose)&&finite(pose.x)&&finite(pose.z)&&(!('heading'in pose)||finite(pose.heading))&&(!('scene'in pose)||typeof pose.scene==='string');
}

function normalizeNpcs(npcs,isLegalPose){
  if(!Array.isArray(npcs))fail('NPC_LIST_REQUIRED');
  const seen=new Set();
  return npcs.map(raw=>{
    if(!raw||typeof raw!=='object'||!string(raw.id)||seen.has(raw.id))fail('NPC_INVALID');
    seen.add(raw.id);const pose={x:Number(raw.x),z:Number(raw.z),scene:raw.scene||'outdoor',heading:raw.heading==null?0:Number(raw.heading)};
    if(!validPose(pose)||!isLegalPose(pose))fail('NPC_OUTSIDE_LEGAL_NAV',raw.id,422);
    return Object.freeze({id:raw.id,x:pose.x,z:pose.z,scene:pose.scene,heading:pose.heading});
  });
}

function leaseView(row,now){
  if(!row)return null;
  return {ownerId:row.ownerId,sessionId:row.sessionId,state:row.state,epoch:row.epoch,connectedAt:row.connectedAt,lastSeen:row.lastSeen,graceUntil:row.graceUntil??null,active:row.state==='active'||(row.state==='grace'&&now<=row.graceUntil)};
}

export function createMemoryAdapter(){
  const leases=new Map(),poses=new Map(),appearance=new Map(),requests=new Map();
  return {
    transaction(fn){return fn()},
    readLease:ownerId=>clone(leases.get(ownerId)||null),writeLease:(ownerId,value)=>value?leases.set(ownerId,clone(value)):leases.delete(ownerId),
    readPose:ownerId=>clone(poses.get(ownerId)||null),writePose:(ownerId,value)=>poses.set(ownerId,clone(value)),
    readAppearance:ownerId=>clone(appearance.get(ownerId)||null),writeAppearance:(ownerId,value)=>appearance.set(ownerId,clone(value)),
    readRequest:(ownerId,requestId)=>clone(requests.get(ownerId+':'+requestId)||null),writeRequest:(ownerId,requestId,value)=>requests.set(ownerId+':'+requestId,clone(value)),
  };
}

export function createStaffControl({ownerId,storage=createMemoryAdapter(),now=()=>Date.now(),graceMs=DEFAULT_GRACE_MS,activeIdleMs=graceMs,navBounds=null,isLegalPose=null,appearancePresets=[DEFAULT_APPEARANCE],npcs=[]}={}){
  if(!string(ownerId))fail('OWNER_BINDING_REQUIRED','ownerId must be server-bound',400);
  if(!storage||typeof storage.transaction!=='function')fail('STORAGE_ADAPTER_REQUIRED','storage adapter must expose transaction()',500);
  if(!Number.isSafeInteger(graceMs)||graceMs<0)fail('INVALID_GRACE_MS');
  if(!Number.isSafeInteger(activeIdleMs)||activeIdleMs<0)fail('INVALID_ACTIVE_IDLE_MS');
  const legal=typeof isLegalPose==='function'?isLegalPose:pose=>!navBounds||(
    finite(pose.x)&&finite(pose.z)&&pose.x>=navBounds.minX&&pose.x<=navBounds.maxX&&pose.z>=navBounds.minZ&&pose.z<=navBounds.maxZ
  );
  const presets=new Set(appearancePresets.filter(string));
  if(!presets.size)fail('APPEARANCE_PRESETS_REQUIRED');
  let npcList=normalizeNpcs(npcs,legal);
  const clock=()=>{const value=Number(now());if(!Number.isFinite(value))fail('INVALID_CLOCK',undefined,500);return value};
  const read=()=>storage.readLease?.(ownerId)||null;
  const write=value=>storage.writeLease?.(ownerId,value);
  const requireSession=(sessionId,{allowGrace=false}={})=>{
    if(!string(sessionId))fail('SESSION_REQUIRED','sessionId is server-issued',401);
    const current=read(),at=clock();
    if(!current)fail('LEASE_REQUIRED','staff owner has no active lease',401);
    const alive=current.state==='active'||(current.state==='grace'&&at<=current.graceUntil);
    if(!alive){write({...current,sessionId:'',state:'released',lastSeen:at,graceUntil:null});fail('LEASE_EXPIRED','reconnect grace expired',409);}
    if(current.sessionId!==sessionId)fail('LEASE_CONFLICT','another session owns this staff lease',409);
    if(!allowGrace&&current.state!=='active')fail('LEASE_GRACE','lease is disconnected; call resume',409);
    return current;
  };
  const checkTime=value=>{const at=value==null?clock():Number(value);if(!Number.isSafeInteger(at)||at<0)fail('INVALID_TIME');return at;};
  const withTx=fn=>storage.transaction(fn);

  return Object.freeze({
    ownerId,
    get lease(){return leaseView(read(),clock())},
    connect(body={}){
      allow(body,['sessionId','now']);const sessionId=body.sessionId,at=checkTime(body.now);
      if(!string(sessionId))fail('SESSION_REQUIRED','sessionId is server-issued',401);
      return withTx(()=>{
        let current=read();
        let priorEpoch=current?.epoch||0;
        if(current){
          const alive=current.state==='active'||(current.state==='grace'&&at<=current.graceUntil);
          if(!alive){current=null;write(null);}
        }
        if(!current){const next={ownerId,sessionId,state:'active',epoch:priorEpoch+1,connectedAt:at,lastSeen:at,graceUntil:null};write(next);return{ok:true,status:'acquired',lease:leaseView(next,at)};}
        if(current.sessionId===sessionId){const next={...current,state:'active',lastSeen:at,graceUntil:null};write(next);return{ok:true,status:'resumed',lease:leaseView(next,at)};}
        return{ok:false,status:'conflict',reason:current.state==='grace'?'grace-active':'active',lease:leaseView(current,at)};
      });
    },
    heartbeat(body={}){
      allow(body,['sessionId','now']);const at=checkTime(body.now);
      return withTx(()=>{const current=requireSession(body.sessionId);const next={...current,lastSeen:at};write(next);return{ok:true,lease:leaseView(next,at)};});
    },
    disconnect(body={}){
      allow(body,['sessionId','now','reason']);const at=checkTime(body.now),reason=body.reason||'network';
      if(!['network','background','manual'].includes(reason))fail('INVALID_DISCONNECT_REASON');
      return withTx(()=>{const current=read();if(!current)fail('LEASE_REQUIRED','staff owner has no lease',401);if(current.sessionId!==body.sessionId)fail('LEASE_CONFLICT','another session owns this staff lease',409);const alive=current.state==='active'||(current.state==='grace'&&at<=current.graceUntil);if(!alive){write({...current,sessionId:'',state:'released',lastSeen:at,graceUntil:null});fail('LEASE_EXPIRED','reconnect grace expired',409);}if(reason==='manual'){write({...current,sessionId:'',state:'released',lastSeen:at,graceUntil:null});return{ok:true,status:'released',reason,epoch:current.epoch};}if(current.state==='grace')return{ok:true,status:'grace',reason,lease:leaseView(current,at)};const next={...current,state:'grace',lastSeen:at,graceUntil:at+graceMs};write(next);return{ok:true,status:'grace',reason,lease:leaseView(next,at)};});
    },
    resume(body={}){
      allow(body,['sessionId','now']);const at=checkTime(body.now);
      return withTx(()=>{const current=read();if(!current)fail('LEASE_REQUIRED','staff owner has no lease',401);if(current.sessionId!==body.sessionId)fail('LEASE_CONFLICT','another session owns this staff lease',409);if(current.state!=='grace'){const next={...current,lastSeen:at};write(next);return{ok:true,lease:leaseView(next,at)};}if(at>current.graceUntil){write(null);fail('LEASE_EXPIRED','reconnect grace expired',409);}const next={...current,state:'active',lastSeen:at,graceUntil:null};write(next);return{ok:true,status:'resumed',lease:leaseView(next,at)};});
    },
    logout(body={}){
      allow(body,['sessionId','now']);const at=checkTime(body.now);
      return withTx(()=>{const current=read();if(!current)fail('LEASE_REQUIRED','staff owner has no lease',401);if(current.sessionId!==body.sessionId)fail('LEASE_CONFLICT','another session owns this staff lease',409);const alive=current.state==='active'||(current.state==='grace'&&at<=current.graceUntil);if(!alive){write({...current,sessionId:'',state:'released',lastSeen:at,graceUntil:null});fail('LEASE_EXPIRED','reconnect grace expired',409);}write({...current,sessionId:'',state:'released',lastSeen:at,graceUntil:null});return{ok:true,status:'released',reason:'manual',epoch:current.epoch};});
    },
    tick(body={}){
      allow(body,['now']);const at=checkTime(body.now);return withTx(()=>{const current=read();if(current&&current.state==='active'&&at-current.lastSeen>activeIdleMs){const next={...current,state:'grace',lastSeen:at,graceUntil:at+graceMs};write(next);return{released:false,idleGrace:true,lease:leaseView(next,at)};}if(current&&current.state==='grace'&&at>current.graceUntil){write({...current,sessionId:'',state:'released',lastSeen:at,graceUntil:null});return{released:true,epoch:current.epoch};}return{released:false,lease:leaseView(current,at)};});
    },
    savePlayerPose(body={}){
      allow(body,['sessionId','pose','now']);const at=checkTime(body.now);requireSession(body.sessionId);const pose={...body.pose};if(!validPose(pose)||!legal(pose))fail('PLAYER_OUTSIDE_LEGAL_NAV',undefined,422);return withTx(()=>{requireSession(body.sessionId);const current=storage.readPose?.(ownerId);const next={...pose,scene:pose.scene||current?.scene||'outdoor',revision:Number(current?.revision||0)+1,savedAt:at};storage.writePose?.(ownerId,next);return{ok:true,pose:clone(next)};});
    },
    playerPose(){return clone(storage.readPose?.(ownerId)||null)},
    setNpcs(next=[]){npcList=normalizeNpcs(next,legal);return{count:npcList.length}},
    nearbyNpcs(body={}){
      allow(body,['sessionId','center','radius','limit','scene']);requireSession(body.sessionId);const center=body.center||{};if(!validPose(center)||!legal({x:center.x,z:center.z,scene:center.scene||'outdoor'}))fail('CENTER_OUTSIDE_LEGAL_NAV',undefined,422);const radius=body.radius==null?DEFAULT_LOD_RADIUS:Number(body.radius),limit=body.limit==null?24:Number(body.limit);if(!finite(radius)||radius<0||radius>64||!Number.isInteger(limit)||limit<1||limit>64)fail('INVALID_LOD_LIMIT');const scene=body.scene||center.scene||'outdoor';const poses=npcList.filter(n=>n.scene===scene&&legal(n)).map(n=>({...n,distance:Math.hypot(n.x-center.x,n.z-center.z)})).filter(n=>n.distance<=radius).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,limit).map(({distance,...n})=>n);return{scene,center:{x:center.x,z:center.z},radius,poses};
    },
    previewAppearance(body={}){
      allow(body,['sessionId','preset']);requireSession(body.sessionId);const preset=body.preset||DEFAULT_APPEARANCE;if(!presets.has(preset))fail('APPEARANCE_NOT_ALLOWED',undefined,403);return{ok:true,preview:true,consumed:false,preset,current:clone(storage.readAppearance?.(ownerId)||null)};
    },
    confirmAppearance(body={}){
      allow(body,['sessionId','preset','requestId','now']);const at=checkTime(body.now),preset=body.preset||DEFAULT_APPEARANCE;requireSession(body.sessionId);if(!presets.has(preset))fail('APPEARANCE_NOT_ALLOWED',undefined,403);if(!string(body.requestId)||body.requestId.length>100)fail('REQUEST_ID_REQUIRED');
      return withTx(()=>{requireSession(body.sessionId);const fp=fingerprint({preset}),prior=storage.readRequest?.(ownerId,body.requestId);if(prior){if(prior.fingerprint!==fp)fail('IDEMPOTENCY_CONFLICT','requestId was reused for another appearance',409);return clone(prior.response);}const existing=storage.readAppearance?.(ownerId);if(existing?.consumed)fail('APPEARANCE_ALREADY_CONSUMED','one-time appearance reset already confirmed',409);const result={ok:true,preview:false,consumed:true,preset,confirmedAt:at,requestId:body.requestId};storage.writeAppearance?.(ownerId,{...result});storage.writeRequest?.(ownerId,body.requestId,{fingerprint:fp,response:result});return result;});
    },
    snapshot(){return{ownerId,lease:leaseView(read(),clock()),pose:clone(storage.readPose?.(ownerId)||null),appearance:clone(storage.readAppearance?.(ownerId)||null),npcCount:npcList.length};}
  });
}
