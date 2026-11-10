import {StaffControlError} from './staff-control.mjs';

export const DEFAULT_NPC_SPEED=0.8;
export const DEFAULT_MAX_AGENTS=24;
export const DEFAULT_MAX_DT=.25;
export const DEFAULT_PUBLIC_RADIUS=30;
export const DEFAULT_PUBLIC_LIMIT=24;

const fail=(code,message=code,status=409)=>{throw new StaffControlError(code,message,status)};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const text=value=>typeof value==='string'&&value.length>0;
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const bodyKeys=(body,keys)=>{if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_BODY');for(const key of Object.keys(body))if(!keys.includes(key))fail('INVALID_FIELDS:'+key,`unexpected field: ${key}`,400);};
const pose=(value)=>!!value&&finite(value.x)&&finite(value.z)&&(!('heading'in value)||finite(value.heading))&&(!('scene'in value)||text(value.scene));

function legalPoint(nav,p){
  const fn=nav?.validate||nav?.isLegalPose;
  if(typeof fn!=='function')fail('NAV_VALIDATOR_REQUIRED','nav.validate is required',500);
  return fn.call(nav,p)===true;
}

export function validateRouteSegments(route,nav,{sampleStep=.5}={}){
  if(!Array.isArray(route)||route.length<2)fail('ROUTE_TOO_SHORT');
  if(!finite(sampleStep)||sampleStep<=0)fail('INVALID_ROUTE_SAMPLE');
  let total=0;
  for(let index=0;index<route.length;index++){
    const point={x:Number(route[index].x),z:Number(route[index].z),scene:route[index].scene||'outdoor',heading:route[index].heading==null?0:Number(route[index].heading)};
    if(!pose(point)||!legalPoint(nav,point))fail('ROUTE_POINT_ILLEGAL',String(index),422);
    if(index===0)continue;
    const prior=route[index-1],current=route[index],distance=Math.hypot(current.x-prior.x,current.z-prior.z);if(!distance)fail('ROUTE_ZERO_SEGMENT',String(index),422);total+=distance;
    if(typeof nav.validateSegment==='function'){
      if(nav.validateSegment(prior,current)!==true)fail('ROUTE_SEGMENT_ILLEGAL',String(index),422);
    }else{
      const samples=Math.max(1,Math.ceil(distance/sampleStep));
      for(let step=1;step<samples;step++)if(!legalPoint(nav,{x:prior.x+(current.x-prior.x)*step/samples,z:prior.z+(current.z-prior.z)*step/samples,scene:current.scene,heading:0}))fail('ROUTE_SEGMENT_ILLEGAL',String(index),422);
    }
  }
  return {points:route.length,totalDistance:total};
}

function pointAt(route,totalDistance,distance){
  let remaining=((distance%totalDistance)+totalDistance)%totalDistance;
  for(let index=1;index<route.length;index++){
    const a=route[index-1],b=route[index],segment=Math.hypot(b.x-a.x,b.z-a.z);
    if(remaining<=segment||index===route.length-1){const ratio=Math.min(1,remaining/segment),dx=b.x-a.x,dz=b.z-a.z;return{x:a.x+dx*ratio,z:a.z+dz*ratio,scene:b.scene||a.scene||'outdoor',heading:Math.atan2(dx,dz)};}
    remaining-=segment;
  }
  const end=route.at(-1);return{x:end.x,z:end.z,scene:end.scene||'outdoor',heading:end.heading||0};
}

function routeDistanceAt(route,totalDistance,point){
  let total=0,best=0,error=Infinity;
  for(let index=1;index<route.length;index++){
    const a=route[index-1],b=route[index],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(!len)continue;
    const ratio=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(len*len))),px=a.x+dx*ratio,pz=a.z+dz*ratio,d=Math.hypot(point.x-px,point.z-pz);
    if(d<error){error=d;best=total+len*ratio;}total+=len;
  }
  return error<.001?best:0;
}

function normalizeRoster(roster,nav,maxAgents){
  if(!Array.isArray(roster)||!roster.length)fail('ROSTER_REQUIRED');
  if(roster.length>maxAgents)fail('ROSTER_TOO_LARGE');
  const owners=new Map(),publicIds=new Set();
  for(const entry of roster){
    if(!entry||!text(entry.ownerId)||!text(entry.publicAvatarId)||!text(entry.nickname)||publicIds.has(entry.publicAvatarId))fail('ROSTER_INVALID');
    const route=entry.route?.map(item=>({x:Number(item.x),z:Number(item.z),scene:item.scene||'outdoor',heading:item.heading==null?0:Number(item.heading)}));
    const audit=validateRouteSegments(route,nav,{sampleStep:entry.routeSampleStep||.5}),phaseFraction=entry.phaseFraction??0;if(!finite(phaseFraction)||phaseFraction<0||phaseFraction>=1)fail('NPC_PHASE_INVALID');
    owners.set(entry.ownerId,Object.freeze({ownerId:entry.ownerId,publicAvatarId:entry.publicAvatarId,nickname:entry.nickname,appearance:clone(entry.appearance||''),phaseFraction,route:Object.freeze(route.map(item=>Object.freeze(item))),routeAudit:audit}));publicIds.add(entry.publicAvatarId);
  }
  return owners;
}

export function createStaffRuntime({roster,nav,createControl,controls=new Map(),clock=()=>Date.now(),speed=DEFAULT_NPC_SPEED,maxAgents=DEFAULT_MAX_AGENTS,maxDt=DEFAULT_MAX_DT,publicRadius=DEFAULT_PUBLIC_RADIUS,publicLimit=DEFAULT_PUBLIC_LIMIT}={}){
  if(typeof createControl!=='function'&&!(controls instanceof Map))fail('CONTROL_FACTORY_REQUIRED');
  if(!Number.isFinite(speed)||speed<0)fail('INVALID_NPC_SPEED');
  if(!Number.isFinite(maxDt)||maxDt<=0)fail('INVALID_MAX_DT');
  if(maxAgents<1||maxAgents>256||!Number.isInteger(maxAgents))fail('INVALID_MAX_AGENTS');
  const owners=normalizeRoster(roster,nav,maxAgents),controlMap=controls instanceof Map?controls:new Map(),sim=new Map();
  for(const [ownerId,entry] of owners){
    const control=controlMap.get(ownerId)||createControl?.(ownerId,entry);if(!control)fail('CONTROL_MISSING',ownerId,500);controlMap.set(ownerId,control);
    const distance=entry.phaseFraction*entry.routeAudit.totalDistance;sim.set(ownerId,{distance,pose:pointAt(entry.route,entry.routeAudit.totalDistance,distance),npcActive:true,steps:0});
  }
  let lastStep=null;
  const getOwner=ownerId=>{const entry=owners.get(ownerId);if(!entry)fail('OWNER_NOT_IN_ROSTER',ownerId,403);return entry;};
  const getControl=ownerId=>{getOwner(ownerId);return controlMap.get(ownerId)};
  const atTime=raw=>{const value=raw==null?Number(clock()):Number(raw);if(!Number.isSafeInteger(value)||value<0)fail('INVALID_TIME');return value;};
  const playerSpawn=(ownerId,control)=>{const saved=control.playerPose?.();return saved?{source:'saved',pose:clone(saved)}:{source:'route',pose:clone(owners.get(ownerId).route[0])};};
  const setNpcState=(ownerId,active)=>{const state=sim.get(ownerId);state.npcActive=active;return state;};
  const hostCall=(ownerId,body,method)=>{const control=getControl(ownerId);body=body||{};return control[method](body);};

  return Object.freeze({
    roster:()=>[...owners.values()].map(entry=>({ownerId:entry.ownerId,publicAvatarId:entry.publicAvatarId,nickname:entry.nickname,routeAudit:entry.routeAudit})),
    getControl,
    onConnect(ownerId,body={}){bodyKeys(body,['sessionId','now']);const result=hostCall(ownerId,body,'connect');if(result.ok&&result.lease?.active)setNpcState(ownerId,false);return{...result,spawn:result.ok?playerSpawn(ownerId,getControl(ownerId)):null};},
    onDisconnect(ownerId,body={}){bodyKeys(body,['sessionId','now','reason']);const result=hostCall(ownerId,body,'disconnect');if(result.status==='released')setNpcState(ownerId,true);else if(result.status==='grace')setNpcState(ownerId,false);return result;},
    onHeartbeat(ownerId,body={}){bodyKeys(body,['sessionId','now']);return hostCall(ownerId,body,'heartbeat');},
    logout(ownerId,body={}){bodyKeys(body,['sessionId','now']);const result=hostCall(ownerId,body,'logout');setNpcState(ownerId,true);return result;},
    step(rawNow){
      const now=atTime(rawNow);if(lastStep===null){lastStep=now;for(const [ownerId,control] of controlMap) {const result=control.tick({now});if(result.lease?.active)setNpcState(ownerId,false);else setNpcState(ownerId,true);}return{now,dt:0,processed:0,npcCount:[...sim.values()].filter(state=>state.npcActive).length};}
      if(now<lastStep)fail('CLOCK_REWIND');const dt=Math.min((now-lastStep)/1000,maxDt);lastStep=now;let processed=0;
      for(const [ownerId,control] of controlMap){if(processed>=maxAgents)break;const result=control.tick({now}),state=sim.get(ownerId);if(result.lease?.active){state.npcActive=false;continue;}state.npcActive=true;state.distance=(state.distance+speed*dt)%owners.get(ownerId).routeAudit.totalDistance;state.pose=pointAt(owners.get(ownerId).route,owners.get(ownerId).routeAudit.totalDistance,state.distance);state.steps++;processed++;}
      return{now,dt,processed,npcCount:[...sim.values()].filter(state=>state.npcActive).length};
    },
    publicSnapshot(body={}){
      bodyKeys(body,['center','scene','limit','radius']);const center=body.center||{},scene=body.scene||center.scene||'outdoor',radius=body.radius==null?publicRadius:Number(body.radius),limit=body.limit==null?publicLimit:Number(body.limit);if(!pose(center)||!legalPoint(nav,center)||!Number.isFinite(radius)||radius<0||radius>publicRadius||!Number.isInteger(limit)||limit<1||limit>publicLimit)fail('PUBLIC_LOD_BOUNDS',undefined,422);
      const result=[];for(const [ownerId,entry] of owners){const state=sim.get(ownerId);if(!state.npcActive||state.pose.scene!==scene)continue;const distance=Math.hypot(state.pose.x-center.x,state.pose.z-center.z);if(distance<=radius)result.push({distance,opaqueAvatarId:entry.publicAvatarId,nickname:entry.nickname,appearance:clone(entry.appearance),pose:{x:state.pose.x,z:state.pose.z,heading:state.pose.heading,scene:state.pose.scene}});}
      result.sort((a,b)=>a.distance-b.distance||a.opaqueAvatarId.localeCompare(b.opaqueAvatarId));return{scene,center:{x:center.x,z:center.z},radius,poses:result.slice(0,limit).map(({distance,...item})=>item)};
    },
    debugSnapshot(){return{lastStep,owners:[...owners].map(([ownerId,entry])=>({ownerId,publicAvatarId:entry.publicAvatarId,sim:clone(sim.get(ownerId)),lease:getControl(ownerId).lease}))};},
  });
}
