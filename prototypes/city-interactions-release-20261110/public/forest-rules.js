(function(root){'use strict';const model=root.CozyForestScene||(typeof require==='function'?require('./forest-scene.js'):null),smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);},height=p=>{
const x=Number(p.x)||0,z=Number(p.z)||0,base=Math.max(0,Math.min(3,(z+7)*.075));
const rightX=5+3*Math.max(0,Math.min(1,(z-7.5)/22.5)),pathGap=Math.min(Math.abs(x+7),z>=5?Math.abs(x-rightX):20);
const corridor=smooth((pathGap-1.3)/1.7),bridgeGap=Math.min(Math.abs(z-7.5),Math.abs(z-25)),bridgeMask=smooth((bridgeGap-1.25)/1.75);
const waterMask=x>=0&&x<=4?0:1;
const west=2.8*Math.exp(-(((x+11)/3.4)**2))*(.65+.35*Math.sin(z*.17+1)**2),east=3.4*Math.exp(-(((x-11.8)/3.4)**2))*(.65+.35*Math.cos(z*.14)**2),bank=.9*Math.exp(-(((x+3.7)/2.5)**2))*Math.sin((z+8)*.12)**2;
return base+(west+east+bank)*corridor*bridgeMask*waterMask;
};const water=[{x:2,w:4,z:-1,d:14},{x:2,w:4,z:16,d:14},{x:2,w:4,z:31,d:8}],trees=(model?.treePoints||[]).map(([x,z])=>({x,z,w:.55,d:.55}));const portals=Object.freeze([{id:'legacy',label:'原山林入口',city:{x:-32,z:1.5},cityApproach:{x:-30,z:1.5},cityReturn:{x:-32,z:1.5},forest:{x:-7,z:-7},forestExit:{x:-7,z:-7},auto:false},...[["creek-south","溪谷南徑",-14,-5.5],["creek-middle","溪岸中徑",6,13.5],["ridge-north","山稜北徑",26,31.5]].map(([id,label,cityZ,forestZ])=>({id,label,city:{x:-35,z:cityZ},cityApproach:{x:-28,z:cityZ},cityReturn:{x:-32.8,z:cityZ},forest:{x:12.2,z:forestZ},forestExit:{x:13.2,z:forestZ},auto:true}))].map(p=>Object.freeze(Object.fromEntries(Object.entries(p).map(([k,v])=>[k,v&&typeof v==='object'?Object.freeze(v):v])))));const crossing=({scene,position,previous,destination=null,manual=false}={})=>{
 const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
 if(!['outdoor','forest'].includes(scene)||!finite(position)||!finite(previous)||Math.hypot(position.x-previous.x,position.z-previous.z)<.001)return null;
 const dx=position.x-previous.x,dz=position.z-previous.z;
 return portals.find(p=>{if(!p.auto)return false;const point=scene==='outdoor'?p.city:p.forestExit;
 const outward=scene==='outdoor'?dx<0&&position.x<=point.x+.35:dx>0&&position.x>=point.x-.15;
 const intention=manual&&Math.abs(dx)>Math.abs(dz)*.75||finite(destination)&&Math.hypot(destination.x-point.x,destination.z-point.z)<1.1;
 return outward&&Math.abs(position.z-point.z)<1&&intention;
 })||null;
};const api={portals,crossing,heightVersion:'north12b-forest-terrain/v2',cityGate:{x:-32,z:1.5},bounds:{minX:-14,maxX:14,minZ:-10,maxZ:35},entry:{x:-7,z:-7},exit:{x:-7,z:-7},vista:{x:8,z:30},bridgePoints:[{x:2,z:7.5},{x:2,z:25}],height,water:[{x:2,w:4,z:-1,d:14},{x:2,w:4,z:14.5,d:17},{x:2,w:4,z:29,d:12}],obstacles:[...water,...trees]};root.CozyForestRules=api;if(typeof module!=='undefined')module.exports=api;})(typeof window==='undefined'?globalThis:window);
