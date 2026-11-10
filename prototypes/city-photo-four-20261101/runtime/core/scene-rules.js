/* One-block authority geometry shared with the renderer, in game metres. */
(function(root){
 const cityData=root.North12BCityData||root.CityData||(typeof require==='function'?require('./city-data.js'):null);
 const cityLayoutModule=root.CozyCityLayout||(typeof require==='function'?require('./city-layout.js'):null);
 const compressedPosition=item=>({x:Number(item.x)*1.5,z:-2.7+(Number(item.z)+2.7)*1.5});
 const gamePosition=item=>Number.isFinite(Number(item?.gamePosition?.x))&&Number.isFinite(Number(item?.gamePosition?.z))?{x:Number(item.gamePosition.x),z:Number(item.gamePosition.z)}:compressedPosition(item);
 const fallbackCenters={jiuquan:{x:0,z:-2.7},wanda:{x:-20,z:37},dadaocheng:{x:-2,z:17},fuxingnan:{x:20,z:17},sanchuang:{x:20,z:-3},hangzhounan:{x:20,z:37},yongji:{x:40,z:-3},tonghua:{x:40,z:37},liuzhangli:{x:40,z:57}};
 const storeCenters=Object.freeze(Object.fromEntries(Object.entries(fallbackCenters).map(([id,fallback])=>{
  const item=cityData?.stores?.find(store=>store.id===id);return[id,item&&((item.gamePosition&&Number.isFinite(Number(item.gamePosition.x))&&Number.isFinite(Number(item.gamePosition.z)))||(Number.isFinite(Number(item.x))&&Number.isFinite(Number(item.z))))?Object.freeze(gamePosition(item)):Object.freeze({...fallback})];
 })));
 const storeDoors=Object.freeze(Object.fromEntries(Object.entries(storeCenters).map(([id,center])=>[id,Object.freeze(id==='jiuquan'?{x:center.x,z:1.5}:{x:center.x,z:center.z+3.4})])));
 const storeSpawns=Object.freeze(Object.fromEntries(Object.entries(storeDoors).map(([id,door])=>[id,Object.freeze({x:door.x,z:door.z})])));
 const bounds={outdoor:{minX:-36,maxX:56,minZ:-40,maxZ:73},indoor:{minX:-6.65,maxX:6.65,minZ:-5,maxZ:5.4}};
 // Keep the same full-size footprint for every outdoor shop.  The visual shop
 // can be scaled independently, while collision and route geometry remain
 // adult-sized and preserve the canonical door positions.
 const cityBuildings=Object.values(storeCenters).map(center=>({x:center.x,z:center.z,w:7.2,d:4.8}));
 // Collision is kept for canonical stores, landmarks and function hubs.  The
 // retired 酒泉 props are intentionally omitted; the compact layout is now
 // the outdoor geometry authority and keeps its public entry clear.
 const outdoor=[...cityBuildings];
 const landmarkCenters=Object.freeze(Object.fromEntries((cityData?.landmarks||[]).map(item=>[item.id,Object.freeze(gamePosition(item))])));
 const landmarkBoxes=(cityData?.landmarks||[]).map(item=>({id:item.id,...gamePosition(item),w:item.id.includes('night-market')?5.4:2.7,d:2.7}));
 const taskBuildings=[{id:'report',x:-20,z:-23},{id:'kpi',x:-20,z:-3},{id:'awards',x:-20,z:17},{id:'tradein',x:0,z:37},{id:'price',x:20,z:57}];
 outdoor.push(...landmarkBoxes,...taskBuildings.map(p=>({...p,w:5.1,d:3.4})));
 const cityLayout=typeof cityLayoutModule?.create==='function'?cityLayoutModule.create({
  bounds:bounds.outdoor,
  storeCenters,
  storeDoors,
  baseObstacles:outdoor,
  taskBuildings,
  landmarkBoxes,
  spawn:{x:0,z:1.5}
 }):{roads:[],buildings:[],parks:[],trafficLoops:[],pedestrianRoutes:[],districts:[],obstacles:[],landmarkCenters,spawn:{x:0,z:1.5}};
 // Only generated building footprints are appended; all prior static
 // obstacles stay in place for save compatibility and indoor validation.
 outdoor.push(...cityLayout.obstacles);
 const indoor=[{x:0,z:-3.5,w:6,d:1.55},{x:-3,z:.1,w:2.55,d:1.65},{x:1,z:.1,w:2.55,d:1.65},{x:-5.9,z:-2.2,w:1.6,d:.9},{x:4.6,z:3.6,w:3.1,d:1.35},{x:4.5,z:1.1,w:1.5,d:1.5},{x:6,z:-.4,w:.65,d:.65},...[[-5.9,3.8],[5.8,-4.3],[-4.7,-4.7]].map(([x,z])=>({x,z,w:.8,d:.8}))];
 function gridPoint(x,z){return{x:-4.9+x*.55,z:1.8+z*.50};}
 const furnitureSizes=Object.freeze({
  'desk-oak':Object.freeze({scale:1.5,w:1.95,d:1.125,height:1.32}),
  'shelf-orange':Object.freeze({scale:1.3,w:1.43,d:1.34,height:2.25}),
  'sofa-mint':Object.freeze({scale:1.4,w:2.5,d:1.2,height:1.66}),
  'plant-palm':Object.freeze({scale:1.3,w:.9,d:.9,height:1.45}),
  'lamp-gold':Object.freeze({scale:1.3,w:1.3,d:1.3,height:2.3}),
  'display-phone':Object.freeze({scale:1.4,w:1,d:.75,height:1.15})
 });
 function furnitureSpec(itemId){return furnitureSizes[itemId]||{scale:1,w:.75,d:.75,height:.6};}
 function placementBox(p){const spec=furnitureSpec(p.item_id||p.itemId),point=gridPoint(p.x,p.z),rot=((Number(p.rotation)||0)%4+4)%4;return{...point,w:rot%2?spec.d:spec.w,d:rot%2?spec.w:spec.d,height:spec.height,placementId:p.id||p.placementId,itemId:p.item_id||p.itemId};}
 function overlaps(a,b,gap=.08){return Math.abs(a.x-b.x)<(a.w+b.w)/2+gap&&Math.abs(a.z-b.z)<(a.d+b.d)/2+gap;}
 function bodyOccupies(box,actor,r=.29){return Math.abs(actor.x-box.x)<box.w/2+r&&Math.abs(actor.z-box.z)<box.d/2+r;}
 function placementError(space,candidate,exceptId){
  if(!Number.isSafeInteger(candidate.x)||!Number.isSafeInteger(candidate.z)||candidate.x<0||candidate.x>7||candidate.z<0||candidate.z>5||!Number.isSafeInteger(candidate.rotation??0)||(candidate.rotation??0)<0||(candidate.rotation??0)>3)return 'INVALID_POSITION';
  const box=placementBox(candidate),b=bounds.indoor;
  if(box.x-box.w/2<b.minX+.08||box.x+box.w/2>b.maxX-.08||box.z-box.d/2<b.minZ+.08||box.z+box.d/2>b.maxZ-.08)return 'FURNITURE_OUT_OF_ROOM';
  if(overlaps(box,{x:0,z:4.45,w:1.4,d:1.8}))return 'FURNITURE_EXIT_BLOCKED';
  if(indoor.some(o=>overlaps(box,o)))return 'FURNITURE_STATIC_BLOCKED';
  if((space?.placements||[]).some(p=>String(p.id)!==String(exceptId??'')&&overlaps(box,placementBox(p))))return 'FURNITURE_OVERLAP';
  return null;
 }
 function placementObstacles(space){return(space?.placements||[]).map(placementBox);}
 const forest=root.CozyForestRules||(typeof require==='function'?require('./forest-rules.js'):null);bounds.forest=forest.bounds;bounds.home=bounds.indoor;
 const api={mapVersion:'cozy-pocket-taipei-v2',bounds,obstacles:{outdoor,indoor,forest:forest.obstacles},forest,taskBuildings,landmarkBoxes,landmarkCenters,storeCenters,storeDoors,storeSpawns,cityLayout,storeDoorRadius:1.2,gridPoint,placementObstacles,furnitureSpec,placementBox,placementError,bodyOccupies,overlaps,walkSpeed:3.4,nearRadius:14,spawn:{scene:'outdoor',zone:'jiuquan',x:0,z:1.5,heading:0,moving:false},door:{x:0,z:4.1},exit:storeDoors.jiuquan,seat:{x:4.6,z:3.7},seatStand:{x:4.6,z:2.45}};
 root.CozySceneRules=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
