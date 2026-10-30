(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CozyPetCompanion=api;})(typeof window==='undefined'?null:window,function(){'use strict';
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 function create({makePet,nav}){
  let selected=null,model=null,trail=[],lastOwner=null,sceneKey='',position=null,created=0,disposed=0,lastRepath=-Infinity,detour=[];
  function reset(){if(model){model.dispose?.();model=null;disposed++;}trail=[];detour=[];position=null;lastOwner=null;sceneKey='';}
  function select(value){const next=value?.inventoryId&&['cat','dog'].includes(value.kind)?{...value}:null;if(selected?.inventoryId!==next?.inventoryId)reset();selected=next;model?.setAccessory?.(next?.accessoryStyle||null);}
  function update({scene,zone,owner,heading=0,dt=0,phase=0,active=true,obstacles,bounds,speed=3.4,now=0}){
   if(!selected||!active){if(model)reset();return;}const key=scene+':'+zone;if(model&&sceneKey!==key)reset();
   if(!model){const behind={x:owner.x-Math.sin(heading)*1.05,z:owner.z-Math.cos(heading)*1.05};position=nav.clear(owner,behind,obstacles,bounds)?behind:{x:owner.x,z:owner.z};model=makePet(selected.kind);created++;model.setAccessory?.(selected.accessoryStyle||null);sceneKey=key;lastOwner={...owner};trail=[{...owner}];}
   if(distance(lastOwner,owner)>.23){trail.push({x:owner.x,z:owner.z});lastOwner={...owner};if(trail.length>64)trail.shift();}
   const arc=()=>trail.reduce((total,p,i)=>total+distance(i?trail[i-1]:position,p),0);let length=arc(),moved=0;
   if(length>1.15&&trail.length){let target=detour[0]||trail[0];while(trail.length>1&&distance(position,trail[0])<.16){trail.shift();target=detour[0]||trail[0];}
    const d=distance(position,target),step=Math.min(Math.max(0,length-1.1),Math.max(0,Math.min(dt,.05))*Math.min(12,speed+1.6),d);if(d>.001&&step>.001){const next=nav.move(position,{x:(target.x-position.x)/d*step,z:(target.z-position.z)/d*step},obstacles,bounds);moved=distance(position,next);if(moved>.001){heading=Math.atan2(next.x-position.x,next.z-position.z);position=next;}else if(now-lastRepath>1200){lastRepath=now;detour=nav.route(position,trail[0],obstacles,bounds).slice(0,24);}if(detour.length&&distance(position,detour[0])<.16)detour.shift();}
   }
   model.group.visible=distance(position,owner)<14;model.group.position.set(position.x,.02,position.z);if(moved>.001)model.group.rotation.y=heading;model.animate?.(phase,moved>.001);model.group.position.y+=.025;
  }
  return{select,update,reset,setElevation(height){if(model&&position)model.group.position.y+=height(position);},state:()=>({active:!!model,kind:selected?.kind||null,position:position?{...position}:null,trailCount:trail.length,detourCount:detour.length,created,disposed,activeModels:created-disposed})};
 }
 return{create};
});
