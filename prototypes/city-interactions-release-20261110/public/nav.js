/* Continuous 3D XZ navigation; finite grid search with swept collision checks. */
(function(root){
 'use strict';
 function clampPoint(p,bounds,r=.29){return{x:Math.max(bounds.minX+r,Math.min(bounds.maxX-r,p.x)),z:Math.max(bounds.minZ+r,Math.min(bounds.maxZ-r,p.z))};}
 // Stop at the same body boundary used by the server, and retain tangential
 // movement so pushing against an edge never traps a player there.
 function move(start,delta,obs,bounds,r=.29){
  if(![delta.x,delta.z].every(Number.isFinite)||(delta.x===0&&delta.z===0))return{...start};
  // Every axis-slide candidate is inside this swept rectangle. Broad-phase
  // once, then keep the same exact segment/corner checks used by the server.
  const end=clampPoint({x:start.x+delta.x,z:start.z+delta.z},bounds,r),minX=Math.min(start.x,end.x)-r,maxX=Math.max(start.x,end.x)+r,minZ=Math.min(start.z,end.z)-r,maxZ=Math.max(start.z,end.z)+r,near=[];
  for(const o of obs)if(maxX>=o.x-o.w/2&&minX<=o.x+o.w/2&&maxZ>=o.z-o.d/2&&minZ<=o.z+o.d/2)near.push(o);
  let p={...start};for(const axis of ['x','z']){if(delta[axis]===0)continue;const next=clampPoint({...p,[axis]:p[axis]+delta[axis]},bounds,r);if(clear(p,next,near,bounds,r))p=next;}if(clear(start,p,near,bounds,r))return p;
  // Axis sliding can otherwise produce an L-shaped step whose diagonal
  // chord clips a corner. The server validates that chord, so emit just one
  // clear tangent step until the avatar has fully cleared the corner.
  const candidates=['x','z'].map(axis=>clampPoint({...start,[axis]:start[axis]+delta[axis]},bounds,r)).filter(next=>clear(start,next,near,bounds,r));
  candidates.sort((a,b)=>Math.hypot(b.x-start.x,b.z-start.z)-Math.hypot(a.x-start.x,a.z-start.z));return candidates[0]||{...start};
 }
 function blocked(p,obstacles,bounds,r=.29){
  return p.x<bounds.minX+r||p.x>bounds.maxX-r||p.z<bounds.minZ+r||p.z>bounds.maxZ-r||obstacles.some(o=>Math.abs(p.x-o.x)<o.w/2+r&&Math.abs(p.z-o.z)<o.d/2+r);
 }
 function clear(a,b,obs,bounds,r=.29){
  if(![a.x,a.z,b.x,b.z].every(Number.isFinite))return false;
  const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minZ=Math.min(a.z,b.z),maxZ=Math.max(a.z,b.z),dx=b.x-a.x,dz=b.z-a.z;
  if(minX<bounds.minX+r||maxX>bounds.maxX-r||minZ<bounds.minZ+r||maxZ>bounds.maxZ-r)return false;
  // Exact segment vs expanded rectangles. The broad phase cheaply skips most
  // obstacles; unlike .12m samples this cannot miss a shallow corner.
  for(const o of obs){const left=o.x-o.w/2-r,right=o.x+o.w/2+r,back=o.z-o.d/2-r,front=o.z+o.d/2+r;if(maxX<=left||minX>=right||maxZ<=back||minZ>=front)continue;let enter=0,exit=1;if(Math.abs(dx)>1e-12){const p=(left-a.x)/dx,q=(right-a.x)/dx;enter=Math.max(enter,Math.min(p,q));exit=Math.min(exit,Math.max(p,q));}if(Math.abs(dz)>1e-12){const p=(back-a.z)/dz,q=(front-a.z)/dz;enter=Math.max(enter,Math.min(p,q));exit=Math.min(exit,Math.max(p,q));}if(exit>Math.max(0,enter)+1e-10&&enter<1)return false;}
  return true;
 }
 function route(start,end,obs,bounds){
  if(![start.x,start.z,end.x,end.z].every(Number.isFinite)||blocked(start,obs,bounds)||blocked(end,obs,bounds))return [];
  if(clear(start,end,obs,bounds))return [{...end}];
  const step=.5, key=p=>Math.round((p.x-bounds.minX)/step)+','+Math.round((p.z-bounds.minZ)/step);
  const snap=p=>({x:Math.round((p.x-bounds.minX)/step)*step+bounds.minX,z:Math.round((p.z-bounds.minZ)/step)*step+bounds.minZ});
  const snapped=snap(start),candidates=[];for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)candidates.push({x:snapped.x+x*step,z:snapped.z+z*step});candidates.sort((a,b)=>Math.hypot(a.x-start.x,a.z-start.z)-Math.hypot(b.x-start.x,b.z-start.z));const s=candidates.find(p=>clear(start,p,obs,bounds));if(!s)return [];const goal=snap(end),open=[{...s,g:0,f:0}],seen=new Map([[key(s),0]]),parent=new Map();
  let final=null;
  for(let count=0;open.length&&count<10000;count++){
   open.sort((a,b)=>b.f-a.f);const p=open.pop();
   if(Math.hypot(p.x-goal.x,p.z-goal.z)<.4&&clear(p,end,obs,bounds)){final=p;break;}
   for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const q={x:p.x+dx*step,z:p.z+dz*step},g=p.g+Math.hypot(dx,dz)*step,k=key(q);
    if(blocked(q,obs,bounds)||!clear(p,q,obs,bounds)||(seen.get(k)??Infinity)<=g)continue;
    seen.set(k,g);parent.set(k,p);open.push({...q,g,f:g+Math.hypot(q.x-goal.x,q.z-goal.z)});
   }
  }
  if(!final)return [];
  const points=[end];let p=final;while(p){points.unshift({x:p.x,z:p.z});p=parent.get(key(p));}
  if(Math.hypot(points[0].x-start.x,points[0].z-start.z)>1e-9)points.unshift({...start});else points[0]={...start};const smooth=[];let i=0;
  while(i<points.length-1){let j=points.length-1;while(j>i+1&&!clear(points[i],points[j],obs,bounds))j--;smooth.push(points[j]);i=j;}
  return smooth;
 }
 const api={blocked,clear,route,clampPoint,move};root.CozyNav=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
