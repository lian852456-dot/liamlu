/* Rigid hair only. A shared immutable asset; local tint materials have per-instance ownership.
 * Neither this asset nor the renderer choice enters a player profile or a sync packet. */
(function(root){'use strict';
 let template=null,pending=null,error=null,created=0,released=0;const live=new Set();
 function stats(){return {ready:!!template,error,liveInstances:live.size,created,released,asset:'assets/hair-glb/short-bob-v1.glb'};}
 function load(){if(pending)return pending;pending=new Promise((resolve,reject)=>{
  const loader=new root.CozyGLTFLoader();
  loader.load('assets/hair-glb/short-bob-v1.glb',gltf=>{template=gltf.scene;template.name='blender-short-bob-template';template.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=false;}});resolve(stats());},undefined,e=>{error=String(e?.message||'HAIR_ASSET_LOAD_FAILED');reject(Error(error));});
 });return pending;}
 function create(tone){if(!template)return null;const group=template.clone(true),materials=new Map();group.userData.blenderHair=true;group.name='blender-short-bob-instance';
  group.traverse(n=>{if(!n.isMesh)return;const tint=m=>{if(!materials.has(m)){const clone=m.clone();clone.color.setHex(tone);materials.set(m,clone);}return materials.get(m);};n.material=Array.isArray(n.material)?n.material.map(tint):tint(n.material);});
  live.add(group);created++;return group;
 }
 function release(group){if(!live.delete(group))return;const materials=new Set();group.traverse(n=>{if(n.isMesh)for(const m of(Array.isArray(n.material)?n.material:[n.material]))materials.add(m);});for(const m of materials)m.dispose();group.removeFromParent();released++;}
 function dispose(){for(const group of [...live])release(group);if(!template)return;const geometries=new Set(),materials=new Set(),textures=new Set();template.traverse(n=>{if(!n.isMesh)return;geometries.add(n.geometry);for(const m of(Array.isArray(n.material)?n.material:[n.material])){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures){t.dispose();t.image?.close?.();}template=null;pending=null;}
 root.addEventListener?.('pagehide',dispose,{once:true});
 root.CozyHairGLBV1=Object.freeze({load,ready:()=>!!template,create,release,stats,dispose});
})(globalThis);
