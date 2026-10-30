(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CozyVehicleReactions=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 function distanceToSegment(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
 function create({cooldownMs=7000}={}){
  let previous=null,lastHit=-Infinity,count=0,last=null;
  function update({now,player,vehicles,eligible=true}){
   const prior=previous;previous={now,player:{x:player.x,z:player.z},vehicles:vehicles.map(v=>({x:v.x,z:v.z,type:v.type}))};
   if(!eligible||!prior||now<=prior.now||now-prior.now>500||now-lastHit<cooldownMs||Math.hypot(player.x-prior.player.x,player.z-prior.player.z)>2)return null;
   for(let i=0;i<vehicles.length;i++){
    const v=vehicles[i],p=prior.vehicles[i];if(!p||v.type!==p.type||Math.hypot(v.x-p.x,v.z-p.z)>3)continue;
    // Relative swept motion catches a passing vehicle without moving either actor.
    const a={x:p.x-prior.player.x,z:p.z-prior.player.z},b={x:v.x-player.x,z:v.z-player.z};
    if(distanceToSegment({x:0,z:0},a,b)>(v.type==='scooter'?.72:1.05))continue;
    lastHit=now;count++;last={type:v.type,at:now};return{...last};
   }
   return null;
  }
  return{update,reset(){previous=null;},state:()=>({count,last:last?{...last}:null,cooldownMs})};
 }
 return{create,distanceToSegment};
});
