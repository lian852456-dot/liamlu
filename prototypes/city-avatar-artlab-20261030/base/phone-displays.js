(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CozyPhoneDisplays=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 function create(){
  const entries=new Map();let selected=null;
  function restore(entry){entry.model.position.y=entry.baseY;entry.model.rotation.y=entry.baseRotationY;entry.model.rotation.x=entry.baseRotationX;entry.until=0;}
  function reset(){for(const entry of entries.values())restore(entry);selected=null;}
  function register({id,island,index,model,worldPosition}){if(entries.has(id))throw Error('DUPLICATE_PHONE_DISPLAY');entries.set(id,{id,island,index,model,worldPosition,baseY:model.position.y,baseRotationY:model.rotation.y,baseRotationX:model.rotation.x,until:0});}
  function select(id,now){const entry=entries.get(id);if(!entry||!Number.isFinite(now))return false;const closing=selected===id&&entry.until>now;reset();if(!closing){selected=id;entry.until=now+6000;}return !closing;}
  function update(now){for(const entry of entries.values()){if(entry.until>now){entry.model.position.y=entry.baseY+.41+Math.sin(now*.003)*.06;entry.model.rotation.y=entry.baseRotationY+now*.0015;}else if(entry.until){restore(entry);if(selected===entry.id)selected=null;}}}
  function state(now){return[...entries.values()].map(entry=>({id:entry.id,island:entry.island,index:entry.index,active:entry.until>now,localY:entry.model.position.y,baseY:entry.baseY,rotationY:entry.model.rotation.y,world:entry.worldPosition?.()}));}
  return{register,select,update,reset,state};
 }
 return{create};
});
