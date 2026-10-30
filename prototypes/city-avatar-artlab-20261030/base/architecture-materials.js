/* Small repeatable surface textures on native 3D architecture, never a scene backdrop. */
(function(){'use strict';
 const T=THREE,materials=new Map(),textures=new Map();
 function surface(kind){if(textures.has(kind))return textures.get(kind);const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#fffdf6';c.fillRect(0,0,256,256);let seed=9719;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<7500;i++){const v=Math.floor(175+random()*70);c.fillStyle=`rgba(${v},${v},${v},${.03+random()*.075})`;c.fillRect(random()*256,random()*256,1+random()*2,1+random()*2);}
  if(kind==='tile'){c.strokeStyle='rgba(92,105,94,.12)';c.lineWidth=1.1;for(let x=0;x<=256;x+=32){c.beginPath();c.moveTo(x,0);c.lineTo(x,256);c.stroke()}for(let y=0;y<=256;y+=16){c.beginPath();c.moveTo(0,y);c.lineTo(256,y);c.stroke()}}
  if(kind==='brick'){c.strokeStyle='rgba(104,95,79,.22)';c.lineWidth=1.3;for(let y=0;y<=256;y+=32){c.beginPath();c.moveTo(0,y);c.lineTo(256,y);c.stroke();for(let x=(y/32)%2?32:0;x<=256;x+=64){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+32);c.stroke()}}}
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;textures.set(kind,texture);return texture;
 }
 function originalWall(color,kind='plaster'){const key=String(color)+':'+kind;if(!materials.has(key))materials.set(key,new T.MeshStandardMaterial({color,map:surface(kind),bumpMap:surface(kind),bumpScale:kind==='tile'?.022:.012,roughness:kind==='tile'?.66:.75,metalness:0}));const result=materials.get(key);result.userData.archColor=color;result.userData.archKind=kind;return result}
 function originalPanel(color,kind,w,h,holes){const key=JSON.stringify(['panel',color,kind,w,h,holes]);if(materials.has(key))return materials.get(key);const canvas=document.createElement('canvas');canvas.width=Math.min(256,2**Math.ceil(Math.log2(w*28)));canvas.height=Math.min(256,2**Math.ceil(Math.log2(h*28)));const c=canvas.getContext('2d'),cw=canvas.width,ch=canvas.height;c.drawImage(surface(kind).image,0,0,cw,ch);if(kind==='tile'){c.fillStyle='#f5f4ed';c.fillRect(0,0,cw,ch);c.strokeStyle='rgba(91,106,91,.18)';c.lineWidth=.65;for(let x=0;x<cw;x+=cw/(w*4)){c.beginPath();c.moveTo(x,0);c.lineTo(x,ch);c.stroke()}for(let y=0;y<ch;y+=ch/(h*4)){c.beginPath();c.moveTo(0,y);c.lineTo(cw,y);c.stroke()}}c.shadowColor='rgba(57,53,40,.38)';c.shadowBlur=4;c.shadowOffsetX=1;c.shadowOffsetY=1;for(const hole of holes){const x=(hole.x-hole.w/2+w/2)/w*cw,y=(h/2-hole.y-hole.h/2)/h*ch;c.fillStyle='#696757';c.fillRect(x,y,hole.w/w*cw,hole.h/h*ch)}c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0;const shade=c.createLinearGradient(0,0,0,ch);shade.addColorStop(0,'rgba(77,64,43,.14)');shade.addColorStop(.06,'rgba(77,64,43,0)');shade.addColorStop(.93,'rgba(77,64,43,0)');shade.addColorStop(1,'rgba(77,64,43,.12)');c.fillStyle=shade;c.fillRect(0,0,cw,ch);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;const material=new T.MeshStandardMaterial({color,map:texture,roughness:kind==='tile'?.68:.78});materials.set(key,material);return material}
 // These shared finishes apply to native geometry. Brand tile and sign assets
 // retain the original material path; only painted plaster and ground change.
 const paintedSurfaces=new Map();
 function pigment(color){return new T.Color(color).lerp(new T.Color(0xffebca),.045)}
 function paintedSurface(kind){
  if(paintedSurfaces.has(kind))return paintedSurfaces.get(kind);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  c.fillStyle='#fff9ec';c.fillRect(0,0,256,256);let seed=kind==='brick'?9173:4731;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  for(let i=0;i<48;i++){c.fillStyle=`rgba(197,166,124,${.018+random()*.025})`;c.fillRect(random()*256,random()*256,12+random()*55,9+random()*40)}
  for(let i=0;i<9500;i++){const v=165+Math.floor(random()*75);c.fillStyle=`rgba(${v},${v-3},${v-9},${.045+random()*.075})`;c.fillRect(random()*256,random()*256,.6+random()*1.2,.6+random()*1.2)}
  if(kind==='brick'){c.strokeStyle='rgba(122,91,58,.16)';c.lineWidth=1.2;for(let y=0;y<=256;y+=32){c.beginPath();c.moveTo(0,y);c.lineTo(256,y);c.stroke();for(let x=(y/32)%2?32:0;x<=256;x+=64){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+32);c.stroke()}}}
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
  const relief=map.clone();relief.colorSpace=T.NoColorSpace;relief.needsUpdate=true;
  const result={map,relief};paintedSurfaces.set(kind,result);return result;
 }
 function wall(color,kind='plaster'){
  if(kind==='tile')return originalWall(color,kind);
  const key='painted:'+color+':'+kind;if(!materials.has(key)){const s=paintedSurface(kind),m=new T.MeshStandardMaterial({color:pigment(color),map:s.map,bumpMap:s.relief,bumpScale:.018,roughnessMap:s.relief,roughness:.86,metalness:0});m.userData.archColor=color;m.userData.archKind=kind;m.userData.finishProfile='warm-painted-native-v1';materials.set(key,m)}return materials.get(key);
 }
 function panel(color,kind,w,h,holes){
  if(kind==='tile')return originalPanel(color,kind,w,h,holes);
  const key=JSON.stringify(['painted-panel',color,kind,w,h,holes]);if(materials.has(key))return materials.get(key);
  const canvas=document.createElement('canvas');canvas.width=Math.min(256,2**Math.ceil(Math.log2(w*28)));canvas.height=Math.min(256,2**Math.ceil(Math.log2(h*28)));const c=canvas.getContext('2d'),cw=canvas.width,ch=canvas.height;c.drawImage(paintedSurface(kind).map.image,0,0,cw,ch);
  c.shadowColor='rgba(85,63,39,.24)';c.shadowBlur=5;c.shadowOffsetX=1;c.shadowOffsetY=2;
  for(const hole of holes){const x=(hole.x-hole.w/2+w/2)/w*cw,y=(h/2-hole.y-hole.h/2)/h*ch;c.fillStyle='#82715b';c.fillRect(x,y,hole.w/w*cw,hole.h/h*ch)}
  c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0;const shade=c.createLinearGradient(0,0,0,ch);shade.addColorStop(0,'rgba(104,77,45,.08)');shade.addColorStop(.09,'rgba(104,77,45,0)');shade.addColorStop(.9,'rgba(104,77,45,0)');shade.addColorStop(1,'rgba(104,77,45,.075)');c.fillStyle=shade;c.fillRect(0,0,cw,ch);
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;const relief=paintedSurface(kind).relief;
  const m=new T.MeshStandardMaterial({color:pigment(color),map,bumpMap:relief,bumpScale:.012,roughnessMap:relief,roughness:.86});m.userData.finishProfile='warm-painted-native-v1';materials.set(key,m);return m;
 }
 function ground(color,paved=false){
  const key=(paved?'paving:':'asphalt:')+color;if(materials.has(key))return materials.get(key);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');let seed=1293;
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=218+(seed%38);c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(x,y,1,1)}
  const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.anisotropy=4;texture.colorSpace=T.NoColorSpace;
  const pigmentColor=new T.Color(color).lerp(new T.Color(paved?0xe4cba3:0xb9b29f),paved?.10:.18);
  const m=new T.MeshStandardMaterial({color:pigmentColor,bumpMap:texture,bumpScale:paved?.012:.018,roughness:paved?.83:.94});
  m.onBeforeCompile=shader=>{shader.uniforms.cityGrain={value:texture};shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCityWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 cityWorld=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\ncityWorld=instanceMatrix*cityWorld;\n#endif\nvCityWorld=(modelMatrix*cityWorld).xyz;\n#ifdef USE_BUMPMAP\nvBumpMapUv=vCityWorld.xz*2.;\n#endif');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCityWorld;uniform sampler2D cityGrain;').replace('#include <color_fragment>','#include <color_fragment>\nfloat surfaceGrain=texture2D(cityGrain,vCityWorld.xz*2.).r;\ndiffuseColor.rgb*=.975+.035*surfaceGrain;');};
  m.customProgramCacheKey=()=>paved?'cozy-warm-paving-relief-v2':'cozy-warm-asphalt-relief-v2';m.userData.finishProfile=paved?'warm-paving-native-v1':'warm-asphalt-native-v1';materials.set(key,m);return m;
 }
 function road(color){return ground(color,false)}
 function paving(color){return ground(color,true)}
 const stencilMaterials=new Map(),stencilGeometry=new T.PlaneGeometry(.56,.56);
 function stencil(parent,text){const g=new T.Group();parent.add(g);for(const [i,ch]of[...text].entries()){if(!stencilMaterials.has(ch)){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#f5efdc';c.font='600 106px "PingFang TC",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(ch,64,69,116);const tx=new T.CanvasTexture(canvas);tx.colorSpace=T.SRGBColorSpace;stencilMaterials.set(ch,new T.MeshBasicMaterial({map:tx,transparent:true,depthWrite:false}))}const m=new T.Mesh(stencilGeometry,stencilMaterials.get(ch));m.position.set((i-(text.length-1)/2)*.65,.114,0);m.rotation.x=-Math.PI/2;g.add(m)}return g}
 function isSharedResource(resource){
  if(!resource)return false;
  for(const value of materials.values())if(value===resource)return true;
  for(const value of textures.values())if(value===resource)return true;
  for(const value of stencilMaterials.values())if(value===resource)return true;
  if(resource===stencilGeometry)return true;
  for(const surface of paintedSurfaces.values())if(surface===resource||surface.map===resource||surface.relief===resource)return true;
  return false;
 }
 window.CozyArchitecture={wall,panel,road,paving,stencil,isSharedResource};
})();
