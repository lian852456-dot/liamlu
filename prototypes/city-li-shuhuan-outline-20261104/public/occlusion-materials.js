(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CozyOcclusionMaterials=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 function create(){
  const variants=new Map(),meshes=new WeakMap();let allocations=0,transitions=0,disposed=false;
  function variant(source,opacity){let levels=variants.get(source);if(!levels){levels=new Map();variants.set(source,levels);}if(!levels.has(opacity)){const faded=source.clone();faded.transparent=true;faded.opacity=opacity;faded.depthWrite=false;levels.set(opacity,faded);allocations++;}return levels.get(opacity);}
  function set(mesh,fade,opacity=.2){
   if(disposed||!mesh?.isMesh)return;let record=meshes.get(mesh);
   if(!record){record={solid:mesh.material,shadow:mesh.castShadow,faded:false,opacity:null};meshes.set(mesh,record);}
   if(record.faded===fade&&(!fade||record.opacity===opacity))return;
   transitions++;record.faded=fade;record.opacity=opacity;mesh.castShadow=fade?false:record.shadow;
   mesh.material=fade?(Array.isArray(record.solid)?record.solid.map(m=>variant(m,opacity)):variant(record.solid,opacity)):record.solid;
  }
  return{set,stats:()=>({allocations,transitions,sourceMaterials:variants.size}),dispose(){if(disposed)return;disposed=true;for(const levels of variants.values())for(const material of levels.values())material.dispose();variants.clear();}};
 }
 return{create};
});
