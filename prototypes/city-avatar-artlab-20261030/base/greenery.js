/* Shared native 3D greenery and soft ground contact for the street kit. */
(function(){'use strict';
 const T=THREE,M=CozyModels,leafGeometry=new T.SphereGeometry(1,8,5),bushGeometry=new T.SphereGeometry(1,6,4),matrix=new T.Matrix4(),q=new T.Quaternion(),v=new T.Vector3(),s=new T.Vector3();
 const sphereGeometry=new T.SphereGeometry(1,12,8),cylinders=new Map(),originalBox=M.box,trimGeometry=new Map();
 // Shared low-poly canopy lobes keep the tree broad and irregular without
 // returning to hundreds of independently-rendered leaf meshes.
 // An indexed sphere keeps shared vertices and therefore smooths the normals
 // between neighbouring canopy faces; the vertex warp supplies the irregular
 // silhouette without the triangular rock look of an icosahedron.
 const canopyGeometry=new T.SphereGeometry(1,8,6),canopyPositions=canopyGeometry.attributes.position;
 for(let i=0;i<canopyPositions.count;i++){
  const x=canopyPositions.getX(i),y=canopyPositions.getY(i),z=canopyPositions.getZ(i),a=Math.atan2(z,x)+y*.7;
  const n=1+.08*Math.sin(a*3.1+i*.41)+.045*Math.cos(y*7.3-x*2.1);
  canopyPositions.setXYZ(i,x*n,y*(.92+.08*Math.sin(a*2.2)),z*n);
 }
 canopyGeometry.computeVertexNormals();
 const leafletGeometry=new T.BufferGeometry();
 leafletGeometry.setAttribute('position',new T.Float32BufferAttribute([
   -.16,0,0, 0,.055,.28, .02,.09,.62,
   .02,.09,.62, .11,.025,.3, -.16,0,0
 ],3));
 leafletGeometry.computeVertexNormals();
 const lobePositions=leafGeometry.attributes.position;
 for(let i=0;i<lobePositions.count;i++){const x=lobePositions.getX(i),y=lobePositions.getY(i),z=lobePositions.getZ(i),a=Math.atan2(z,x),f=1+.15*Math.sin(a*3+y*4);lobePositions.setXYZ(i,x*f,y*(.86+.07*Math.cos(a*4)),z*f);}
 leafGeometry.computeVertexNormals();
 const trunkGeometry=new T.CylinderGeometry(.08,.16,2.4,10,7),trunkPositions=trunkGeometry.attributes.position;
 for(let i=0;i<trunkPositions.count;i++){const y=trunkPositions.getY(i),t=(y+1.2)/2.4;trunkPositions.setX(i,trunkPositions.getX(i)+Math.sin(t*Math.PI*.8)*.14);}
 trunkGeometry.translate(0,1.2,0);trunkGeometry.computeVertexNormals();
 const branchGeometry=new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(.1,1.35,0),new T.Vector3(.3,1.85,.03),new T.Vector3(.75,2.52,.06)]),8,.065,7,false);
 M.box=function(parent,w,h,d,color,x=0,y=0,z=0,r=.08){[w,h,d]=[w,h,d].map(n=>Math.round(n*1000)/1000);if(Math.min(w,h,d)<.125){const key=[w,h,d].join(':');if(!trimGeometry.has(key))trimGeometry.set(key,new T.BoxGeometry(w,h,d));return M.mesh(trimGeometry.get(key),color,parent,x,y,z)}return originalBox(parent,w,h,d,color,x,y,z,r)};
 M.sphere=function(parent,r,color,x=0,y=0,z=0,sx=1,sy=1,sz=1){const mesh=M.mesh(sphereGeometry,color,parent,x,y,z);mesh.scale.set(r*sx,r*sy,r*sz);return mesh};
 M.cyl=function(parent,r1,r2,h,color,x=0,y=0,z=0,n=16){const base=Math.max(.00001,r2),ratio=r1/base,key=ratio.toFixed(5)+':'+n;if(!cylinders.has(key))cylinders.set(key,new T.CylinderGeometry(ratio,1,1,n));const mesh=M.mesh(cylinders.get(key),color,parent,x,y,z);mesh.scale.set(base,h,base);return mesh};
 function instances(parent,entries,color,geometry=leafGeometry){const mesh=new T.InstancedMesh(geometry,M.material(color),entries.length);entries.forEach((e,i)=>{v.set(e.x,e.y,e.z);s.set(e.sx,e.sy,e.sz);q.setFromEuler(new T.Euler(e.rx||0,e.ry||0,e.rz||0));matrix.compose(v,q,s);mesh.setMatrixAt(i,matrix)});mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
 const leafSurface=new T.BufferGeometry();leafSurface.setAttribute('position',new T.Float32BufferAttribute([0,.12,.48,0,0,0,-.27,.04,.28,0,.12,.48,-.27,.04,.28,-.23,.1,.72,0,.12,.48,-.23,.1,.72,0,.16,1,0,.12,.48,0,.16,1,.23,.1,.72,0,.12,.48,.23,.1,.72,.27,.04,.28,0,.12,.48,.27,.04,.28,0,0,0],3));leafSurface.computeVertexNormals();const foliageMaterials=new Map();
 const detailLeafGeometry=new T.BufferGeometry();detailLeafGeometry.setAttribute('position',new T.Float32BufferAttribute([
   0,0,0,-.11,.025,.23,0,.075,.47,
   0,0,0,0,.075,.47,.11,.025,.23,
   0,0,0,.11,.025,.23,0,-.028,.30,
   0,0,0,0,-.028,.30,-.11,.025,.23
 ],3));detailLeafGeometry.computeVertexNormals();
 function foliage(parent,entries,color,geometry=leafSurface){if(!foliageMaterials.has(color))foliageMaterials.set(color,new T.MeshStandardMaterial({color,roughness:.76,side:T.DoubleSide}));const mesh=new T.InstancedMesh(geometry,foliageMaterials.get(color),entries.length);entries.forEach((e,i)=>{v.set(e.x,e.y,e.z);s.set(e.sx,e.sy,e.sz);q.setFromEuler(new T.Euler(e.rx||0,e.ry||0,e.rz||0));matrix.compose(v,q,s);mesh.setMatrixAt(i,matrix)});mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
 // Three softly-lit green tones give each lobe a readable edge without the
 // dark, granular look of hundreds of overlapping leaf planes.
 const shades=[0x86a94b,0xb7cc68,0x639247],treeShades=[0x6f8c46,0x9caf55,0xb7c76c];
 M.tree=function(parent,x,z,scale=1,autumn=false){
  const g=M.group(parent,x,0,z);g.userData.canopyOccluder=true;g.scale.setScalar(scale);
  M.mesh(trunkGeometry,0x9b7451,g);
  for(let i=0;i<3;i++){const branch=M.mesh(branchGeometry,i%2?0x846547:0x9b7652,g);branch.rotation.y=i*2.39996;}
  const colors=autumn?[0xc5aa69,0xe0bc76,0xb5a063]:treeShades;
  // Five offset tiers make a low, broad crown instead of a regular ball. The
  // shoulder tiers carry the width while the top and underside taper softly;
  // lobes share one indexed geometry and remain split by native color batch.
  const clusterEntries=[[],[],[]],clusterPoints=[],seed=x*.37+z*.19;
  const rings=[
   {count:5,y:3.88,rx:.46,rz:.36},
   {count:7,y:3.64,rx:.90,rz:.60},
   {count:10,y:3.38,rx:1.30,rz:.86},
   {count:9,y:3.10,rx:1.32,rz:1.00},
   {count:7,y:2.86,rx:.92,rz:.68}
  ];
  let clusterIndex=0;
  rings.forEach((ring,ringIndex)=>{for(let j=0;j<ring.count;j++,clusterIndex++){
   const a=(j/ring.count)*Math.PI*2+ringIndex*.79+seed*.16+.12*Math.sin(clusterIndex*1.13+seed),radial=.83+.16*Math.sin(clusterIndex*1.91+seed)+.08*Math.cos(clusterIndex*2.43-seed),jitter=Math.sin(clusterIndex*2.47+seed)*.09;
   const depthJitter=.14*Math.sin(clusterIndex*1.71-seed)+.06*Math.cos(clusterIndex*2.18+seed),sideJitter=.11*Math.cos(clusterIndex*1.43+seed);
   const y=ring.y+jitter+.15*Math.sin(clusterIndex*1.27+seed)+.05*Math.cos(clusterIndex*2.33-seed),height=(y-2.65)/1.2;
   const noise=.5+.5*Math.sin(seed*1.7+clusterIndex*2.11),colorIndex=height>.72?(noise>.35?2:1):height<.2?(noise>.6?1:0):(noise>.72?2:noise<.2?0:1);
   const size=.29+.18*(.5+.5*Math.sin(clusterIndex*1.63+seed*2)),baseScale=.80+.08*(.5+.5*Math.cos(clusterIndex*1.17+seed)),sx=size*(1.02+.22*Math.sin(clusterIndex*1.13+seed))*baseScale,sy=size*(.84+.32*Math.cos(clusterIndex*1.71-seed))*baseScale,sz=size*(.86+.25*Math.sin(clusterIndex*1.37+seed))*baseScale;
   const lobe={x:Math.cos(a)*ring.rx*radial+jitter+sideJitter,y,z:Math.sin(a)*ring.rz*radial-jitter*.72+depthJitter,sx,sy,sz,ry:a+noise*.42,rx:Math.sin(clusterIndex*.73+seed)*.2,rz:Math.cos(clusterIndex*.91-seed)*.17,colorIndex};
   clusterEntries[colorIndex].push(lobe);clusterPoints.push(lobe);
  }});
  // A few smaller, high/low edge clusters soften the tier boundaries and
  // create the leafy silhouette breaks seen in the reference canopy.
  for(let i=0;i<12;i++){
   const a=i*2.39996+seed*.53,edge=1.03+.16*Math.sin(i*1.93+seed),y=3.31+.62*Math.sin(i*1.17+seed)+.12*Math.cos(i*2.4-seed),size=.16+.06*(.5+.5*Math.sin(i*1.61+seed));
   const colorIndex=i%5===0?2:(y>3.55?1:0);
   const lobe={x:Math.cos(a)*edge,y,z:Math.sin(a)*edge*.76,sx:size*(.9+.2*Math.sin(i))*.88,sy:size*(1.05+.25*Math.cos(i*1.4))*.88,sz:size*(.85+.2*Math.sin(i*1.1))*.88,ry:a,rx:Math.sin(i)*.25,rz:Math.cos(i*.7)*.2,colorIndex};
   clusterEntries[colorIndex].push(lobe);clusterPoints.push(lobe);
  }
  const smallLeafEntries=[[],[],[]];
  // Four or five shared low-poly leaf clusters around every lobe create 210
  // rounded volume accents. Their positions follow the lobe centers but vary
  // in height, depth, and scale, so the crown reads as one dense canopy rather
  // than a stack of plates or a regular grape bunch. Sphere8x5 is shared with
  // bushes and stays within the per-tree mobile triangle budget.
  for(let i=0;i<clusterPoints.length;i++){
   const lobe=clusterPoints[i];
   const count=i<10?5:4;
   for(let j=0;j<count;j++){
    const leafIndex=i*5+j,phi=j*2.39996+i*.73+seed*.41+.18*Math.sin(leafIndex*1.31+seed),radial=.20+.58*Math.sqrt((j+.5)/count),wobble=.045*Math.sin(leafIndex*2.07+seed);
    const lift=(Math.sin(phi*1.63+i*.37)*.34+Math.cos(j*2.17+i)*.20)*lobe.sy*radial;
    const lx=lobe.x+Math.cos(phi)*lobe.sx*radial+.028*Math.cos(leafIndex*1.71+seed),ly=lobe.y+lift+wobble,lz=lobe.z+Math.sin(phi)*lobe.sz*radial+.028*Math.sin(leafIndex*1.83-seed);
    const size=.16+.07*(.5+.5*Math.sin(leafIndex*1.47+seed*1.6)),colorIndex=(lobe.colorIndex+(j===0&&i%4===0?1:0)+(j===count-1&&i%7===0?2:0))%3;
    smallLeafEntries[colorIndex].push({x:lx,y:ly,z:lz,sx:size*(1+.08*Math.sin(leafIndex*1.17+seed)),sy:size*(1+.07*Math.cos(leafIndex*1.43-seed)),sz:size*(1+.09*Math.sin(leafIndex*1.61+seed*.7)),ry:phi+.25*Math.sin(i+j*1.3),rx:.18*Math.sin(leafIndex*.91+seed),rz:.16*Math.cos(leafIndex*1.07-seed)});
   }
  }
  clusterEntries.forEach((items,i)=>{if(items.length)instances(g,items,colors[i],canopyGeometry)});
  smallLeafEntries.forEach((items,i)=>{if(items.length)instances(g,items,colors[i],leafGeometry)});
  const smallLeafCount=smallLeafEntries.reduce((sum,items)=>sum+items.length,0),smallLeafTriangles=leafGeometry.index?leafGeometry.index.count/3:leafGeometry.attributes.position.count/3;
  g.userData.foliageStats={canopyLobes:clusterEntries.reduce((sum,items)=>sum+items.length,0),edgeLeaflets:0,leafBlades:smallLeafCount,smallLeafClusters:smallLeafCount,leafTriangles:smallLeafCount*smallLeafTriangles,smallLeafTriangles,drawUnits:6,sharedGeometry:true};
  return g;
 };
 M.plant=function(parent,x,z,scale=1,flower=false){
  const g=M.group(parent,x,0,z);g.scale.setScalar(scale);M.cyl(g,.265,.18,.43,0xc29170,0,.23,0,16);M.cyl(g,.275,.275,.065,0xe3b58e,0,.46,0,16);M.cyl(g,.226,.226,.025,0x64594b,0,.495,0,16);
  const leaves=[[],[]];
  for(let i=0;i<10;i++){const a=i*2.39996;leaves[i%2].push({x:Math.cos(a)*.04,y:.53+(i%3)*.09,z:Math.sin(a)*.04,sx:.4+(i%2)*.16,sy:.62+(i%3)*.04,sz:.5+(i%3)*.11,rx:-.8-(i%4)*.15,ry:a,rz:Math.sin(a)*.25})}
  leaves.forEach((items,i)=>foliage(g,items,shades[i===0?0:2]));
  if(flower){const petals=[];for(let f=0;f<4;f++){const a=f*2.4,cx=Math.cos(a)*.16,cz=Math.sin(a)*.16,y=1.05+(f%2)*.15;M.cyl(g,.012,.012,y-.5,0x7b985b,cx,(y+.5)/2,cz,6);for(let k=0;k<5;k++){const t=k*Math.PI*2/5;petals.push({x:cx+Math.cos(t)*.06,y,z:cz+Math.sin(t)*.06,sx:.065,sy:.025,sz:.05})}}instances(g,petals,Math.abs(Math.round(x*7+z*11))%2?0xe8a0a0:0xf2c08d)}return g;
 };
 M.bush=function(parent,x,z,w=1,d=.65){
  const g=M.group(parent,x,0,z),heightScale=Math.min(1,Math.max(.38,(w+d)*.65));M.sphere(g,1,shades[2],0,.3*heightScale,0,w*.30,.17*heightScale,d*.25);
  // Three compact rings yield 21 small leaves instead of three oversized
  // spheres, while the smaller shared bush geometry remains inexpensive on phones.
  const ringDefs=[{count:6,rx:.12,rz:.08,y:.32,sx:.22,sy:.17,sz:.20},{count:8,rx:.27,rz:.19,y:.40,sx:.17,sy:.16,sz:.15},{count:7,rx:.36,rz:.22,y:.49,sx:.13,sy:.13,sz:.12}];
  const entries=[[],[],[]];
  ringDefs.forEach((ring,ringIndex)=>{for(let j=0;j<ring.count;j++){const a=(j/ring.count)*Math.PI*2+ringIndex*.37;const lobe={x:Math.cos(a)*w*ring.rx,y:(ring.y+((j+ringIndex)%3-.9)*.018)*heightScale,z:Math.sin(a)*d*ring.rz,sx:w*ring.sx*(.9+(j%3)*.08),sy:ring.sy*(.9+((j+ringIndex)%3)*.1)*heightScale,sz:d*ring.sz*(.9+((j*2+ringIndex)%4)*.07),c:(j+ringIndex)%3};entries[lobe.c].push(lobe)}});
  entries.forEach((items,i)=>instances(g,items,shades[i],bushGeometry));
  if(Math.abs(Math.round(x*11+z*7))%3!==0){const petals=[];for(let f=0;f<4;f++){const a=f*2.4,cx=Math.cos(a)*w*.25,cz=Math.sin(a)*d*.25;for(let k=0;k<5;k++){const t=k*Math.PI*2/5;petals.push({x:cx+Math.cos(t)*.055,y:(.6+(f%2)*.06)*heightScale,z:cz+Math.sin(t)*.055,sx:.075,sy:.03,sz:.063})}}instances(g,petals,x>0?0xdf8f9b:0xeab05d)}return g;
 };
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d'),gradient=c.createRadialGradient(64,64,6,64,64,64);gradient.addColorStop(0,'rgba(58,52,39,.4)');gradient.addColorStop(.5,'rgba(58,52,39,.19)');gradient.addColorStop(1,'rgba(58,52,39,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);const texture=new T.CanvasTexture(canvas),shadowMaterial=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,opacity:.5,polygonOffset:true,polygonOffsetFactor:-1});
 M.contactShadow=function(parent,w=1.2,d=1){const shadow=new T.Mesh(new T.PlaneGeometry(w,d),shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=.012;shadow.renderOrder=1;shadow.raycast=()=>{};shadow.userData.contactShadow=true;parent.add(shadow);return shadow};
 M.helmet=function(parent,color=0x719f89){parent.traverse(n=>{if(n.userData.characterHair)n.visible=false});const g=M.group(parent);const cap=M.mesh(new T.SphereGeometry(.53,16,10,0,Math.PI*2,0,Math.PI*.54),color,g,0,1.9,-.02);M.box(g,.11,.035,.77,0xf0e4c5,0,2.42,-.02,.01);for(const x of[-.39,.39])M.box(g,.035,.28,.035,0x58665a,x,1.58,.22,.006);const visor=M.mesh(new T.SphereGeometry(.55,16,8,0,Math.PI*2,Math.PI*.42,Math.PI*.09),new T.MeshStandardMaterial({color:0xc7dfd9,transparent:true,opacity:.2,roughness:.1,depthWrite:false}),g,0,1.9,.015);visor.castShadow=false;return g};

 M.streetProp=function(parent,p){const g=M.group(parent,p.x,0,p.z);g.rotation.y=p.rotation||0;g.name=p.id;
  if(p.kind==='bench'){for(const x of[-.44,.44]){M.box(g,.055,.46,.055,0x547366,x,.25,.17,.008);M.box(g,.055,.46,.055,0x547366,x,.25,-.17,.008)}for(const z of[-.15,0,.15])M.box(g,1.16,.075,.13,0xb78e63,0,.5,z,.015);for(const y of[.72,.9])M.box(g,1.16,.14,.065,0xb78e63,0,y,-.22,.018);for(const x of[-.48,.48])M.box(g,.045,.58,.045,0x547366,x,.7,-.2,.008)}
  else if(p.kind==='chalkboard'){const frame=M.box(g,.49,.77,.08,0xb18b62,0,.46,0,.025);frame.rotation.x=-.1;const board=M.box(g,.4,.62,.025,0x3d5b50,0,.47,.055,.012);board.rotation.x=-.1;for(const x of[-.19,.19]){const leg=M.box(g,.045,.42,.045,0xb18b62,x,.24,-.1,.008);leg.rotation.x=-.4}M.text(g,'TODAY',0,.63,.1,.33,'#f5e5c2');M.text(g,'慢慢喝一杯',0,.44,.1,.32,'#e5d6ad');M.box(g,.22,.012,.02,0xe5d6ad,0,.3,.1,.002)}
  else{M.box(g,.63,.32,.48,0xb8a27c,0,.2,0,.035);M.box(g,.66,.065,.51,0xd3c09a,0,.38,0,.015);const bush=M.bush(g,0,0,.58,.42);bush.position.y=.33;const pot=M.plant(g,.1,0,.35,true);pot.position.y=.35}
  window.CozyStaticMesh?.compile(g,{mergeColorMaterials:true});return g;
 };
 const spillCanvas=document.createElement('canvas');spillCanvas.width=64;spillCanvas.height=64;const sc=spillCanvas.getContext('2d'),sg=sc.createRadialGradient(32,32,0,32,32,32);sg.addColorStop(0,'rgba(255,255,255,.5)');sg.addColorStop(.5,'rgba(255,255,255,.2)');sg.addColorStop(1,'rgba(255,255,255,0)');sc.fillStyle=sg;sc.fillRect(0,0,64,64);const spillMat=new T.MeshBasicMaterial({color:0xffc56d,map:new T.CanvasTexture(spillCanvas),transparent:true,opacity:.35,depthWrite:false});
 M.windowSpill=function(parent,x,z,w=1.4){const m=new T.Mesh(new T.PlaneGeometry(w,1.4),spillMat);m.rotation.x=-Math.PI/2;m.position.set(x,.075,z);m.renderOrder=1;m.userData.contactShadow=true;m.raycast=()=>{};parent.add(m);return m};
 const originalCharacter=M.character,originalShop=M.shop;
 M.character=function(parent,options){const model=originalCharacter(parent,options),animate=model.animate;model.animate=(...args)=>{animate(...args);model.group.position.y+=Number(model.group.userData.groundElevation)||0};M.contactShadow(model.group,1.2,.9);return model};
 M.shop=function(parent,options){const model=originalShop(parent,options);if(!model.userData.nativeShell){for(const x of[-3.4,3.4])M.plant(model,x,3.03,.72,true);M.contactShadow(model,9.2,6.7);}return model};
})();
