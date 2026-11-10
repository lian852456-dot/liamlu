/* Compile detailed static native 3D props without flattening them into images.
 * Opaque surfaces merge by material. Repeated leaves retain GPU instancing.
 * Each building remains an independent culling/occlusion and interaction unit.
 * Pure-color material merging is opt-in because character materials can change at runtime.
 */
(function(){'use strict';const T=THREE;
 const TEXTURE_FIELDS=['map','lightMap','aoMap','emissiveMap','bumpMap','normalMap','displacementMap','roughnessMap','metalnessMap','alphaMap','envMap','clearcoatMap','clearcoatNormalMap','clearcoatRoughnessMap','iridescenceMap','iridescenceThicknessMap','sheenColorMap','sheenRoughnessMap','specularColorMap','specularIntensityMap','transmissionMap','thicknessMap'];
 const COLOR_EXCLUDED_FIELDS=new Set(['uuid','id','name','color','version','needsUpdate','onBeforeCompile','customProgramCacheKey']);
 function serialized(value,seen=new Set()){
  if(value===null||value===undefined||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;
  if(typeof value==='function')return String(value);
  if(value.isColor)return ['color',value.r,value.g,value.b];
  if(value.isVector2)return ['vector2',value.x,value.y];
  if(value.isVector3)return ['vector3',value.x,value.y,value.z];
  if(value.isVector4)return ['vector4',value.x,value.y,value.z,value.w];
  if(value.isMatrix3||value.isMatrix4)return [value.isMatrix3?'matrix3':'matrix4',...value.elements];
  if(seen.has(value))return '[circular]';seen.add(value);
  if(Array.isArray(value))return value.map(item=>serialized(item,seen));
  const output={};Object.keys(value).sort().forEach(key=>{output[key]=serialized(value[key],seen)});seen.delete(value);return output;
 }
 function hasCustomShader(material){
  const prototype=T.Material&&T.Material.prototype;
  return (typeof material.onBeforeCompile==='function'&&(!prototype||material.onBeforeCompile!==prototype.onBeforeCompile))||
    (typeof material.customProgramCacheKey==='function'&&(!prototype||material.customProgramCacheKey!==prototype.customProgramCacheKey));
 }
 function colorMaterialInfo(material){
  if(!material||!material.isMeshStandardMaterial||material.vertexColors||material.transparent||material.alphaHash||material.opacity!==1||material.alphaTest>0)return null;
  if(TEXTURE_FIELDS.some(field=>material[field]))return null;
  if(material.emissive&& (material.emissive.r!==0||material.emissive.g!==0||material.emissive.b!==0))return null;
  if(hasCustomShader(material)||!material.color||!material.color.isColor)return null;
  const signature=Object.keys(material).sort().filter(key=>!COLOR_EXCLUDED_FIELDS.has(key))
    .map(key=>`${key}:${JSON.stringify(serialized(material[key]))}`).join('|');
  return {signature,color:material.color.clone()};
 }
 function vertexColorMaterial(material){const output=material.clone();output.color.setRGB(1,1,1);output.vertexColors=true;output.needsUpdate=true;return output;}
 function exactIndex(geometry){const dedupe=window.CozyGeometryIndex?.dedupeGeometry;if(typeof dedupe!=='function')return geometry;const indexed=dedupe(geometry);if(indexed&&indexed!==geometry){geometry.dispose();return indexed;}return geometry;}
 function compile(group,{minimumInstancedVertices=5000,mergeColorMaterials=false}={}){group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),surfaces=new Map(),repeated=new Map(),ordinary=new Map(),colorCandidates=new Map(),colorPacks=[],keep=[];let originals=0;
  group.traverse(mesh=>{if(!mesh.isMesh)return;const local=new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);if(mesh.userData.contactShadow){keep.push({mesh,matrix:local});return;}if(Array.isArray(mesh.material)){keep.push({mesh,matrix:local});return;}originals++;
   if(mesh.isInstancedMesh){const flags=[mesh.castShadow,mesh.receiveShadow,mesh.frustumCulled,mesh.renderOrder].join(':');const key=mesh.geometry.uuid+':'+mesh.material.uuid+':'+flags;let pack=repeated.get(key);if(!pack){pack={geometry:mesh.geometry,material:mesh.material,flags:{castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,frustumCulled:mesh.frustumCulled,renderOrder:mesh.renderOrder},matrices:[]};repeated.set(key,pack)}const instance=new T.Matrix4();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);pack.matrices.push(new T.Matrix4().multiplyMatrices(local,instance))}return;}
   const flags=[mesh.castShadow,mesh.receiveShadow,mesh.frustumCulled,mesh.renderOrder].join(':');
   if(mergeColorMaterials){const info=colorMaterialInfo(mesh.material);if(info){const colorKey=info.signature+':'+flags;let pack=colorCandidates.get(colorKey);if(!pack){pack={material:mesh.material,flags:{castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,frustumCulled:mesh.frustumCulled,renderOrder:mesh.renderOrder},items:[]};colorCandidates.set(colorKey,pack)}pack.items.push({mesh,matrix:local,color:info.color});return;}}
   const key=mesh.geometry.uuid+':'+mesh.material.uuid+':'+flags;if(!ordinary.has(key))ordinary.set(key,[]);ordinary.get(key).push({mesh,matrix:local});
  });
  for(const pack of colorCandidates.values()){
   const distinct=new Set(pack.items.map(item=>[item.color.r,item.color.g,item.color.b].join(',')));
   if(distinct.size>1){colorPacks.push(pack);continue;}
   for(const {mesh,matrix}of pack.items){const flags=[mesh.castShadow,mesh.receiveShadow,mesh.frustumCulled,mesh.renderOrder].join(':');const key=mesh.geometry.uuid+':'+mesh.material.uuid+':'+flags;if(!ordinary.has(key))ordinary.set(key,[]);ordinary.get(key).push({mesh,matrix});}
  }
  for(const [key,items]of ordinary){if(items.length>=3&&items.length*items[0].mesh.geometry.attributes.position.count>=minimumInstancedVertices){let pack=repeated.get(key);if(!pack){pack={geometry:items[0].mesh.geometry,material:items[0].mesh.material,flags:{castShadow:items[0].mesh.castShadow,receiveShadow:items[0].mesh.receiveShadow,frustumCulled:items[0].mesh.frustumCulled,renderOrder:items[0].mesh.renderOrder},matrices:[]};repeated.set(key,pack)}for(const item of items)pack.matrices.push(item.matrix);continue;}for(const {mesh,matrix}of items){const surfaceKey=mesh.material.uuid+':'+[mesh.castShadow,mesh.receiveShadow,mesh.frustumCulled,mesh.renderOrder].join(':');let pack=surfaces.get(surfaceKey);if(!pack){pack={material:mesh.material,flags:{castShadow:mesh.castShadow,receiveShadow:mesh.receiveShadow,frustumCulled:mesh.frustumCulled,renderOrder:mesh.renderOrder},parts:[],vertices:0};surfaces.set(surfaceKey,pack)}const transformed=mesh.geometry.clone().applyMatrix4(matrix),part=transformed.index?transformed.toNonIndexed():transformed;if(part!==transformed)transformed.dispose();if(!part.attributes.normal)part.computeVertexNormals();pack.parts.push(part);pack.vertices+=part.attributes.position.count;}}
  group.clear();let compiled=0;
  for(const pack of surfaces.values()){const position=new Float32Array(pack.vertices*3),normal=new Float32Array(pack.vertices*3),uv=new Float32Array(pack.vertices*2),hasColor=pack.parts.some(part=>part.attributes.color),color=hasColor?new Float32Array(pack.vertices*3):null;let offset=0;for(const part of pack.parts){const count=part.attributes.position.count;position.set(part.attributes.position.array,offset*3);normal.set(part.attributes.normal.array,offset*3);if(part.attributes.uv)uv.set(part.attributes.uv.array,offset*2);if(hasColor){if(part.attributes.color){for(let i=0;i<count;i++){const target=(offset+i)*3;color[target]=part.attributes.color.getX(i);color[target+1]=part.attributes.color.getY(i);color[target+2]=part.attributes.color.getZ(i);}}else for(let i=0;i<count;i++){const target=(offset+i)*3;color[target]=color[target+1]=color[target+2]=1;}}offset+=count;part.dispose()}let geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(position,3));geometry.setAttribute('normal',new T.BufferAttribute(normal,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));if(color)geometry.setAttribute('color',new T.BufferAttribute(color,3));geometry=exactIndex(geometry);geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,pack.material);Object.assign(mesh,pack.flags);group.add(mesh);compiled++;}
  for(const pack of colorPacks){const parts=[];let vertices=0;for(const item of pack.items){const transformed=item.mesh.geometry.clone().applyMatrix4(item.matrix),part=transformed.index?transformed.toNonIndexed():transformed;if(part!==transformed)transformed.dispose();if(!part.attributes.normal)part.computeVertexNormals();parts.push({geometry:part,color:item.color});vertices+=part.attributes.position.count;}const position=new Float32Array(vertices*3),normal=new Float32Array(vertices*3),uv=new Float32Array(vertices*2),color=new Float32Array(vertices*3);let offset=0;for(const {geometry,color:sourceColor}of parts){const count=geometry.attributes.position.count;position.set(geometry.attributes.position.array,offset*3);normal.set(geometry.attributes.normal.array,offset*3);if(geometry.attributes.uv)uv.set(geometry.attributes.uv.array,offset*2);for(let i=0;i<count;i++){const target=(offset+i)*3;color[target]=sourceColor.r;color[target+1]=sourceColor.g;color[target+2]=sourceColor.b;}offset+=count;geometry.dispose();}let geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(position,3));geometry.setAttribute('normal',new T.BufferAttribute(normal,3));geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setAttribute('color',new T.BufferAttribute(color,3));geometry=exactIndex(geometry);geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,vertexColorMaterial(pack.material));Object.assign(mesh,pack.flags);group.add(mesh);compiled++;}
  for(const pack of repeated.values()){const mesh=new T.InstancedMesh(pack.geometry,pack.material,pack.matrices.length);pack.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();Object.assign(mesh,pack.flags);group.add(mesh);compiled++;}
  for(const item of keep){item.matrix.decompose(item.mesh.position,item.mesh.quaternion,item.mesh.scale);group.add(item.mesh)}group.userData.staticCompilation={sourceMeshes:originals,drawUnits:compiled+keep.length};group.updateMatrixWorld(true);return group;
 }
 window.CozyStaticMesh={compile};
})();
