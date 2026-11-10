/* Isolated presentation rig. No collision, hit scoring, auth or persistent writes.
 * All input timestamps are milliseconds in the same clock domain as now.
 * Place returned group in the arena; model.group is reserved for local motion.
 */
(function(root){'use strict';
const T=root.THREE;
const DURATIONS=Object.freeze({punch:820,hook:1000,guard:750,dodge:900,retreat:850});
const IMPACT_AT=Object.freeze({punch:240,hook:320});
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,t)=>{const x=clamp((t-a)/(b-a));return x*x*(3-2*x);};
const pulse=(t,a,b,c,d)=>smooth(a,b,t)*(1-smooth(c,d,t));
const snapshot=n=>({position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()});
const restore=(n,s)=>{n.position.copy(s.position);n.quaternion.copy(s.quaternion);n.scale.copy(s.scale);};
function create(model,{side=-1}={}){
 if(!model?.group||!model.head||!Array.isArray(model.arms)||!Array.isArray(model.legs))throw Error('BOXING_MODEL_RIG_REQUIRED');
 side=side===1?1:-1;
 const character=model.group,parent=character.parent,original=snapshot(character),originalOrder=parent?[...parent.children]:null;
 const group=new T.Group();group.name='boxing-placement';restore(group,original);
 group.rotation.y=side===-1?Math.PI/2:-Math.PI/2;
 if(parent)parent.add(group);group.add(character);character.position.set(0,0,0);character.quaternion.identity();character.scale.set(1,1,1);
 const children=[...character.children],childRest=new Map(children.map(n=>[n,snapshot(n)]));
 const hip=Math.max(...model.legs.map(n=>n.position.y).filter(Number.isFinite),.45);
 const upper=new T.Group();upper.name='boxing-waist-pivot';upper.position.y=hip+.07;character.add(upper);
 // Refined p3/p5 keep their live arms and legs inside an authored body group;
 // hidden legacy children must never be used as the visible rig.
 const bodyRoot=model.arms[0]?.parent===model.legs[0]?.parent?model.arms[0].parent:character;
 const limbRoots=new Set(model.legs);
 const candidates=bodyRoot&&bodyRoot!==character?[model.head,...bodyRoot.children.filter(n=>!limbRoots.has(n))]:children.filter(n=>n.visible!==false&&!limbRoots.has(n));
 const moved=[...new Set(candidates)].filter(n=>n!==upper&&n!==character);
 const movedRest=new Map(moved.map(n=>[n,{parent:n.parent,transform:snapshot(n)}]));
 const parentOrders=new Map(moved.map(n=>[n.parent,[...n.parent.children]]));
 character.updateWorldMatrix(true,true);for(const n of moved)upper.attach(n);
 const nodes=[character,upper,model.head,...model.arms,...model.legs],rest=new Map(nodes.map(n=>[n,snapshot(n)]));
 const arms=model.arms.slice(0,2),legs=model.legs.slice(0,2),armSigns=arms.map((n,i)=>Math.sign(n.position.x)|| (i?1:-1));
 const resources={geometry:[],materials:[]};
 // Four small stars are allocated once. Their local positions animate only on a loss.
 const stars=new T.Group();stars.name='boxing-result-stars';character.add(stars);stars.visible=false;
 const shape=new T.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.022:.048,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();
 const starGeometry=new T.ShapeGeometry(shape),starMaterial=new T.MeshBasicMaterial({color:0xffd56b,side:T.DoubleSide});resources.geometry.push(starGeometry);resources.materials.push(starMaterial);
 for(let i=0;i<4;i++){const n=new T.Mesh(starGeometry,starMaterial);n.name='boxing-dizzy-star';stars.add(n);}
 // Temporary elbow deformation operates on cloned live arm meshes only.
 // Source model geometries and materials are never mutated.
 const elbowRigs=[],bendAngles=arms.map(()=>-1.55);
 const gloveGeo=new T.SphereGeometry(1,16,10),cuffGeo=new T.CylinderGeometry(1,1,1,12);
 const gloveMat=new T.MeshStandardMaterial({color:side<0?0xc8473b:0x397ac6,roughness:.48}),cuffMat=new T.MeshStandardMaterial({color:0xede5d7,roughness:.8});
 resources.geometry.push(gloveGeo,cuffGeo);resources.materials.push(gloveMat,cuffMat);
 character.updateWorldMatrix(true,true);
 for(const [armIndex,arm]of arms.entries()){
  const toArm=new T.Matrix4().copy(arm.matrixWorld).invert(),entries=[];let minY=0;
  arm.traverse(n=>{if(!n.isMesh||!n.geometry?.attributes.position)return;const matrix=new T.Matrix4().multiplyMatrices(toArm,n.matrixWorld),p=n.geometry.attributes.position,normal=n.geometry.attributes.normal,points=new Float32Array(p.count*3),normals=new Float32Array(p.count*3),v=new T.Vector3(),nm=new T.Matrix3().getNormalMatrix(matrix);let low=0;
   for(let j=0;j<p.count;j++){v.fromBufferAttribute(p,j).applyMatrix4(matrix);points.set([v.x,v.y,v.z],j*3);low=Math.min(low,v.y);if(normal){v.fromBufferAttribute(normal,j).applyMatrix3(nm).normalize();normals.set([v.x,v.y,v.z],j*3);}}
   minY=Math.min(minY,low);entries.push({mesh:n,source:n.geometry,points,normals,low,matrix,inverse:matrix.clone().invert(),culled:n.frustumCulled});
  });
  const elbowY=minY*.48,selected=entries.filter(e=>e.low<elbowY+.02);let wx=0,wz=0,count=0;
  for(const e of selected){for(let j=0;j<e.points.length;j+=3)if(e.points[j+1]<minY+.045){wx+=e.points[j];wz+=e.points[j+2];count++;}e.clone=e.source.clone();e.mesh.geometry=e.clone;e.mesh.frustumCulled=false;e.invNormal=new T.Matrix3().getNormalMatrix(e.inverse);resources.geometry.push(e.clone);}
  wx=count?wx/count:0;wz=count?wz/count:0;
  const glove=new T.Group();glove.name='boxing-temporary-glove';arm.add(glove);
  const fist=new T.Mesh(gloveGeo,gloveMat);fist.scale.set(.083,.100,.079);fist.position.set(0,-.012,.014);glove.add(fist);
  const thumb=new T.Mesh(gloveGeo,gloveMat);thumb.scale.set(.035,.061,.040);thumb.position.set(-armSigns[armIndex]*.065,.005,.033);glove.add(thumb);
  const cuff=new T.Mesh(cuffGeo,cuffMat);cuff.scale.set(.061,.054,.057);cuff.position.y=.075;glove.add(cuff);glove.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
  elbowRigs.push({entries:selected,elbowY,elbowZ:wz*.4,wrist:[wx,minY+.041,wz],glove,lastAngle:NaN});
 }
 function deformElbows(){for(let i=0;i<elbowRigs.length;i++){const rig=elbowRigs[i],angle=bendAngles[i];if(Math.abs(rig.lastAngle-angle)<.00001)continue;rig.lastAngle=angle;
  for(const e of rig.entries){const p=e.clone.attributes.position,n=e.clone.attributes.normal,im=e.inverse.elements,nm=e.invNormal.elements;
   for(let j=0;j<p.count;j++){const k=j*3,x=e.points[k],y=e.points[k+1],z=e.points[k+2],w=1-smooth(rig.elbowY-.075,rig.elbowY+.015,y),a=angle*w,c=Math.cos(a),sn=Math.sin(a),dy=y-rig.elbowY,dz=z-rig.elbowZ,by=rig.elbowY+dy*c-dz*sn,bz=rig.elbowZ+dy*sn+dz*c;
    p.setXYZ(j,im[0]*x+im[4]*by+im[8]*bz+im[12],im[1]*x+im[5]*by+im[9]*bz+im[13],im[2]*x+im[6]*by+im[10]*bz+im[14]);
    if(n){const nx=e.normals[k],ny=e.normals[k+1]*c-e.normals[k+2]*sn,nz=e.normals[k+1]*sn+e.normals[k+2]*c;n.setXYZ(j,nm[0]*nx+nm[3]*ny+nm[6]*nz,nm[1]*nx+nm[4]*ny+nm[7]*nz,nm[2]*nx+nm[5]*ny+nm[8]*nz);}
   }p.needsUpdate=true;if(n)n.needsUpdate=true;
  }
  const [x,y,z]=rig.wrist,c=Math.cos(angle),sn=Math.sin(angle),dy=y-rig.elbowY,dz=z-rig.elbowZ;rig.glove.position.set(x,rig.elbowY+dy*c-dz*sn,rig.elbowZ+dy*sn+dz*c);rig.glove.rotation.x=angle;
 }}
 let disposed=false,last={now:0,action:'idle',actionAt:0,seq:0,progress:0,impact:null,result:null,localPosition:{x:0,y:0,z:0},actionLocalPosition:{x:0,y:0,z:0},visualImpactOffset:0},impactSeen=null;
 function neutral(){for(const[n,s]of rest)restore(n,s);stars.visible=false;bendAngles.fill(-1.55);}
 function stance(){arms.forEach((a,i)=>{a.rotation.x-=.85;a.rotation.z-=armSigns[i]*.20;});legs.forEach((l,i)=>{l.position.z+=(i?-.045:.045);l.rotation.x+=(i?.055:-.055);});upper.rotation.y=.075;}
 function setArm(i,x,y,z){const a=arms[i];if(!a)return;const r=rest.get(a);a.quaternion.copy(r.quaternion);a.rotation.x+=x;a.rotation.y+=y;a.rotation.z+=z;}
 function driveLegs(t,forward,amount){const step=pulse(t,0,190,420,850),recovery=pulse(t,350,600,700,900);legs.forEach((l,i)=>{const sign=i?1:-1;l.rotation.x+=sign*amount*step;l.position.z+=(i?.025:.075)*forward*step;l.position.y+=(!i?.024:.010)*step; l.rotation.x-=sign*amount*.32*recovery;});}
 function update({now,action='idle',actionAt=0,seq=0,impact=null,result=null}={}){
  if(disposed)return;
  now=Number.isFinite(now)?now:0;actionAt=Number.isFinite(actionAt)?actionAt:now;seq=Number.isFinite(seq)?seq:0;
  const elapsed=now-actionAt,duration=DURATIONS[action]||0,active=duration>0&&elapsed>=0&&elapsed<duration,t=elapsed;
  // Preserve the original face/blink animation. Restore only known rig transforms.
  model.animate?.(now*.006,false,false,false);neutral();stance();
  const breath=Math.sin(now*.0021);upper.position.y+=breath*.003;model.head.rotation.z+=Math.sin(now*.0013)*.008;
  const lead=((Math.floor(seq)%2)+2)%2,other=1-lead,sign=armSigns[lead]||-1;
  if(active&&action==='punch'){
   const wind=pulse(t,0,85,130,230),extension=pulse(t,100,240,300,650),step=pulse(t,0,240,360,820);
   character.position.z+=.22*step;character.position.y-=.018*step;
   upper.rotation.y+=sign*(.24*wind-.30*extension);upper.rotation.x+=.11*extension-.045*wind;upper.rotation.z-=sign*.035*extension;
   bendAngles[lead]=-1.55*(1-extension)-.06*extension;bendAngles[other]=-1.65;
   setArm(lead,-.85-.70*extension+.28*wind,sign*(-.16+.22*extension),-sign*(.16-.12*extension));
   setArm(other,-1.05,0,-armSigns[other]*.34);
   model.head.rotation.x-=.045*extension;driveLegs(t,1,.24);
  }else if(active&&action==='hook'){
   const wind=pulse(t,0,150,220,340),swing=pulse(t,140,320,390,760),step=pulse(t,0,280,450,1000);
   character.position.z+=.14*step;character.position.x-=sign*.045*swing;character.position.y-=.035*step;
   upper.rotation.y+=sign*(.38*wind-.52*swing);upper.rotation.x+=.065*swing;upper.rotation.z-=sign*.065*swing;
   bendAngles[lead]=-1.25;bendAngles[other]=-1.70;
   setArm(lead,-.95-.50*swing,sign*(.70*wind-1.12*swing),sign*(.52*wind+.18*swing));
   setArm(other,-1.1,0,-armSigns[other]*.38);model.head.rotation.y-=sign*.13*swing;driveLegs(t,1,.20);
  }else if(active&&action==='guard'){
   const g=pulse(t,0,100,560,750);bendAngles.fill(-1.55-.20*g);arms.forEach((a,i)=>setArm(i,-.85-.48*g,armSigns[i]*.16*g,-armSigns[i]*(.20+.39*g)));
   upper.rotation.x+=.13*g;upper.position.y-=.035*g;model.head.rotation.x+=.14*g;character.position.z-=.025*g;legs.forEach(l=>l.rotation.x+=.06*g);
  }else if(active&&action==='dodge'){
   const direction=seq%2?1:-1,d=pulse(t,0,230,480,900);
   character.position.x+=direction*.42*d;character.position.y-=.065*d;upper.rotation.z-=direction*.24*d;upper.rotation.x+=.13*d;upper.rotation.y+=direction*.13*d;
   model.head.rotation.z+=direction*.09*d;arms.forEach((a,i)=>setArm(i,-1.08,armSigns[i]*.1,-armSigns[i]*.34));
   legs.forEach((l,i)=>{l.rotation.z+=direction*.14*d;l.position.x+=(i?1:-1)*.035*d;l.rotation.x+=(i?.16:-.12)*d;});
  }else if(active&&action==='retreat'){
   const back=pulse(t,0,330,530,850),plant=Math.sin(Math.min(1,t/530)*Math.PI);
   character.position.z-=.38*back;character.position.y+=.016*Math.abs(plant);upper.rotation.x-=.13*back;model.head.rotation.x+=.05*back;
   arms.forEach((a,i)=>setArm(i,-1.08,0,-armSigns[i]*.30));legs.forEach((l,i)=>{l.position.z-=(i?.12:.055)*back;l.rotation.x+=(i?-.30:.20)*plant;});
  }
  const kinematics=root.CozyBoxingKinematics;if(!kinematics?.motion)throw Error('BOXING_KINEMATICS_REQUIRED');const authoritative=kinematics.motion(active?action:'idle',active?t:0,seq);character.position.x=authoritative.x;character.position.z=authoritative.z;const actionLocalPosition={x:authoritative.x,y:character.position.y,z:authoritative.z};let visualImpactOffset=0;let impactState=null;
  if(impact&&Number.isFinite(impact.at)&&impact.outcome!=='miss'){
   const age=now-impact.at;
   if(age>=0&&age<680){const hit=impact.outcome==='hit',shock=pulse(age,0,75,150,hit?680:430);impactSeen=impact.eventId??null;
    visualImpactOffset=-(hit?.12:.045)*shock;character.position.z+=visualImpactOffset;character.position.y-=.018*shock;
    upper.rotation.x-=(hit?.26:.10)*shock;upper.rotation.z+=(seq%2?1:-1)*(hit?.09:.035)*shock;
    model.head.rotation.x-=(hit?.18:.07)*shock;model.head.rotation.z+=(seq%2?1:-1)*.07*shock;
    if(!hit){bendAngles.fill(-1.75);arms.forEach((a,i)=>setArm(i,-1.33,armSigns[i]*.12,-armSigns[i]*.38));}
    legs.forEach((l,i)=>{l.position.z-=(i?.07:.025)*shock;l.rotation.x+=(i?-.14:.10)*shock;});impactState={eventId:impactSeen,outcome:impact.outcome,age};
   }
  }
  let resultState=null;
  if(result&&Number.isFinite(result.at)){
   const end=Number.isFinite(result.expiresAt)?Math.min(result.expiresAt,result.at+4000):result.at+4000,age=now-result.at;
   if(age>=0&&now<end){const enter=smooth(0,280,age),exit=1-smooth(Math.max(280,end-result.at-350),end-result.at,age),w=enter*exit;
    if(result.winner===true){bendAngles.fill(-.25);arms.forEach((a,i)=>setArm(i,-2.72*w-1.10*(1-w),armSigns[i]*.12,-armSigns[i]*(.2+.52*w)));upper.rotation.x-=.07*w;character.position.y+=Math.max(0,Math.sin(age*.010))*.035*w;model.head.rotation.x-=.10*w;model.head.rotation.z+=Math.sin(age*.005)*.055*w;}
    else if(result.winner===false){bendAngles.fill(-.45);upper.rotation.x+=.16*w;upper.rotation.z+=Math.sin(age*.006)*.16*w;character.position.x+=Math.sin(age*.006)*.055*w;character.position.z-=.09*w;model.head.rotation.z+=Math.sin(age*.009)*.12*w;model.head.rotation.x+=.12*w;arms.forEach((a,i)=>setArm(i,-.42,0,armSigns[i]*.12));legs.forEach((l,i)=>l.rotation.x+=Math.sin(age*.006+i*Math.PI)*.12*w);
     stars.visible=true;const headY=childRest.get(model.head)?.position.y||hip+.9;stars.position.set(0,headY+.43,0);stars.children.forEach((n,i)=>{const a=age*.003+i*Math.PI/2;n.position.set(Math.cos(a)*.29,Math.sin(a*2)*.04,Math.sin(a)*.21);n.rotation.set(0,-group.rotation.y,a*.35);n.scale.setScalar(w);});}
    else{arms.forEach((a,i)=>setArm(i,-1.35,0,-armSigns[i]*.15));model.head.rotation.z+=Math.sin(age*.004)*.035*w;}
    resultState={winner:result.winner,age,expiresAt:end};
   }
  }
  deformElbows();last={now,action:active?action:'idle',actionAt,seq,progress:active?clamp(t/duration):0,impact:impactState,result:resultState,localPosition:{x:character.position.x,y:character.position.y,z:character.position.z},actionLocalPosition,visualImpactOffset};
 }
 function reset(){if(disposed)return;neutral();bendAngles.fill(0);deformElbows();last={now:0,action:'idle',actionAt:0,seq:0,progress:0,impact:null,result:null,localPosition:{x:0,y:0,z:0},actionLocalPosition:{x:0,y:0,z:0},visualImpactOffset:0};impactSeen=null;}
 function dispose(){if(disposed)return;reset();disposed=true;for(const r of elbowRigs){r.glove.removeFromParent();for(const e of r.entries){e.mesh.geometry=e.source;e.mesh.frustumCulled=e.culled;}}for(const n of moved){const r=movedRest.get(n);r.parent.add(n);restore(n,r.transform);}for(const[p,order]of parentOrders){const foreign=p.children.filter(n=>!order.includes(n));p.children.splice(0,p.children.length,...order.filter(n=>n.parent===p),...foreign);}character.remove(upper);character.remove(stars);
  if(group.parent)group.parent.add(character);else character.removeFromParent();restore(character,original);
  // Preserve original child ordering and scene ownership, without deleting foreign nodes.
  const extras=character.children.filter(n=>!children.includes(n));character.children.splice(0,character.children.length,...children,...extras);
  if(parent&&character.parent!==parent)parent.add(character);group.removeFromParent();
  if(parent&&originalOrder){const foreign=parent.children.filter(n=>!originalOrder.includes(n));parent.children.splice(0,parent.children.length,...originalOrder.filter(n=>n.parent===parent),...foreign);}
  resources.geometry.forEach(g=>g.dispose());resources.materials.forEach(m=>m.dispose());
 }
 update({now:0});
 return{group,update,reset,dispose,state:()=>({...last,disposed,side,version:'boxing-motion.2',visualOnly:true,extraMeshes:10,extraGeometries:resources.geometry.length,extraMaterials:3,deformedVertices:elbowRigs.reduce((n,r)=>n+r.entries.reduce((a,e)=>a+e.clone.attributes.position.count,0),0),elbowAngles:[...bendAngles]}),rig:Object.freeze({upper,head:model.head,arms,legs})};
}
root.CozyBoxingMotion=Object.freeze({create,durations:DURATIONS,impactAt:IMPACT_AT});
})(typeof window==='undefined'?globalThis:window);
