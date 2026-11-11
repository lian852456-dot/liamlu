/* Opt-in Art Lab character. Original procedural meshes and API remain intact.
 * No textures, external assets, per-frame allocations, or player-data writes. */
(function(root){'use strict';
 const T=root.THREE, shared=new Map();
 const PALETTE={orange:0xf4c5a0,teal:0xf1bd9f,purple:0xd9a8a1};
 const THEMES={uniform:{top:0x303036,trim:0xddd8cb,pants:0x34353a,accent:0xd28f56},forest:{top:0x718b78,trim:0xe0d7bf,pants:0x635f53,accent:0xa2754b},ocean:{top:0x63869d,trim:0xe7e2d2,pants:0x354354,accent:0xb98258},rose:{top:0xc98d9a,trim:0xf0d8cf,pants:0x63525b,accent:0xaf687e},gold:{top:0xba975b,trim:0xf1dfb4,pants:0x4e4540,accent:0xa26b45},purple:{top:0x8e7d9c,trim:0xded5e3,pants:0x49424e,accent:0xb48379},violet:{top:0x8e7d9c,trim:0xded5e3,pants:0x49424e,accent:0xb48379}};
 const color=(v,f)=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^#?[a-f0-9]{6}$/i.test(v)?parseInt(v.replace('#',''),16):f;
 const baseGeo=(key,fn)=>{if(!shared.has(key))shared.set(key,fn());return shared.get(key);};
 const unitSphere=()=>baseGeo('sphere',()=>new T.SphereGeometry(1,16,10));
 const smallSphere=()=>baseGeo('small-sphere',()=>new T.SphereGeometry(1,12,6));
 function create(parent,options={}){
  const g=new T.Group();parent?.add(g);g.name='artlab-deluxe-character';g.scale.setScalar(Number(options.scale)||1);g.userData={modelType:'character',artToy:true,artLabCandidate:true,version:'deluxe.1'};
  const ownedG=new Set(),ownedM=new Set(),materials=new Map(),arms=[],legs=[],clothing=[];
  let disposed=false,skin=color(options.skin,PALETTE.orange),hairColor=color(options.hair,0xd2ad84),outfit='uniform',hairStyle='bob',baseColor=color(options.color,0x303036),profile={},blink=1,lastPhase=0,smileNode=null;
  const group=(p,x=0,y=0,z=0)=>{const n=new T.Group();n.position.set(x,y,z);p.add(n);return n;};
  const mat=(c,rough=.72)=>{const k=c+':'+rough;if(!materials.has(k)){const m=new T.MeshStandardMaterial({color:c,roughness:rough,metalness:0});materials.set(k,m);ownedM.add(m);}return materials.get(k);};
  const mesh=(p,geo,c,x=0,y=0,z=0,rough=.72)=>{const m=new T.Mesh(geo,c?.isMaterial?c:mat(c,rough));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;p.add(m);return m;};
  const ell=(p,c,x,y,z,sx,sy,sz,small=false,rough=.72)=>{const m=mesh(p,small?smallSphere():unitSphere(),c,x,y,z,rough);m.scale.set(sx,sy,sz);return m;};
  const curve=(p,points,r,c,segments=10,radial=5,rough=.72)=>{const q=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),geo=new T.TubeGeometry(q,segments,r,radial,false);ownedG.add(geo);return mesh(p,geo,c,0,0,0,rough);};
  function clear(p){p.traverse(n=>{if(!n.isMesh)return;if(ownedG.has(n.geometry)){n.geometry.dispose();ownedG.delete(n.geometry);}for(const m of(Array.isArray(n.material)?n.material:[n.material]))if(ownedM.has(m)&&!materials.has([...materials].find(([,v])=>v===m)?.[0])){m.dispose();ownedM.delete(m);}});p.clear();}
  function compile(p){if(!root.CozyStaticMesh?.compile)return;
   const before=[];p.traverse(n=>{if(n.isMesh)before.push(n.geometry);});root.CozyStaticMesh.compile(p,{mergeColorMaterials:true});
   for(const geo of before)if(ownedG.has(geo)){geo.dispose();ownedG.delete(geo);}
   p.traverse(n=>{if(!n.isMesh)return;if(![...shared.values()].includes(n.geometry))ownedG.add(n.geometry);for(const m of(Array.isArray(n.material)?n.material:[n.material]))if(![...materials.values()].includes(m))ownedM.add(m);});
  }
  // Curved tapered locks have a real cross-section and a rounded, narrow tip.
  function lock(p,points,width,c,depth=.5){
   const path=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),steps=8,sides=9,positions=[],indices=[],up=new T.Vector3(0,0,1);
   for(let i=0;i<=steps;i++){const u=i/steps,at=path.getPoint(u),tangent=path.getTangent(u).normalize(),right=new T.Vector3().crossVectors(tangent,up).normalize(),normal=new T.Vector3().crossVectors(right,tangent).normalize(),radius=width*(.35+.65*Math.sin(Math.PI*(.08+u*.87)))*Math.pow(1-u,.18)+.016;
    for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2;positions.push(at.x+right.x*Math.cos(a)*radius+normal.x*Math.sin(a)*radius*depth,at.y+right.y*Math.cos(a)*radius+normal.y*Math.sin(a)*radius*depth,at.z+right.z*Math.cos(a)*radius+normal.z*Math.sin(a)*radius*depth);}
   }
   for(let i=0;i<steps;i++)for(let j=0;j<sides;j++){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();ownedG.add(geo);return mesh(p,geo,c,0,0,0,.46);
  }
  const body=group(g),head=group(g,0,1.99,0),headSkin=group(head),face=group(head),hair=group(head),eyes=[],upperLids=[];
  function buildHead(){clear(headSkin);clear(face);eyes.length=0;upperLids.length=0;
   const geo=new T.SphereGeometry(.47,28,20),v=geo.attributes.position,colors=[];
   const base=new T.Color(skin),warm=new T.Color(0xefa19a);
   for(let i=0;i<v.count;i++){const x=v.getX(i),y=v.getY(i),z=v.getZ(i),jaw=y<0?1-.13*Math.pow(-y/.47,1.4):1-.035*y/.47;v.setXYZ(i,x*jaw,y*.98,z*.88);
    const cheeks=Math.exp(-((Math.abs(x)-.26)**2/.009+(y+.10)**2/.006+(z-.34)**2/.018))*.46,tint=base.clone().lerp(warm,cheeks);colors.push(tint.r,tint.g,tint.b);
   }geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();ownedG.add(geo);
   const skinMat=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.65});ownedM.add(skinMat);mesh(headSkin,geo,skinMat);
   for(const side of[-1,1]){ell(headSkin,skin,side*.447,-.035,-.005,.075,.101,.063,true);ell(headSkin,0xe5ac98,side*.478,-.04,.033,.024,.046,.018,true);}
   ell(headSkin,skin,0,-.1,.416,.044,.035,.046,true);ell(headSkin,0xe3aa94,0,-.117,.449,.023,.012,.007,true);compile(headSkin);
   const brows=group(face);for(const side of[-1,1]){const eye=group(face,side*.165,.015,.386);eye.rotation.y=side*.17;eyes.push(eye);
    ell(eye,0xfff7ec,0,0,0,.100,.115,.014,false,.4);
    ell(eye,0x8c5a36,0,-.002,.012,.080,.098,.012,false,.4);
    ell(eye,0x462f24,0,.014,.022,.061,.078,.006,false,.4);
    ell(eye,0x261f20,0,.013,.027,.043,.064,.004,false,.4);
    ell(eye,0xbd8c53,0,-.068,.023,.031,.007,.004,true,.4);
    ell(eye,0xfffbef,-.025,.048,.032,.019,.023,.004,true,.4);ell(eye,0xffedce,.026,-.033,.031,.008,.01,.003,true,.4);
    curve(eye,[[-.102,.037,.009],[-.08,.105,.014],[.02,.126,.01],[.1,.064,.006]],.010,0x48342c,12,5,.4);
    const lash=curve(eye,[[side*.075,.078,.005],[side*.113,.098,0],[side*.126,.116,-.002]],.007,0x48342c,5,4,.4);upperLids.push(lash);compile(eye);
    curve(brows,[[side*.079,.166,.376],[side*.154,.189,.366],[side*.245,.168,.344]],.015,0x947355,10,5);
   }
   compile(brows);const smile=group(face);smileNode=smile;smile.name='smile';curve(smile,[[-.075,-.179,.407],[-.032,-.196,.419],[.025,-.197,.42],[.076,-.178,.405]],.0085,0x9f6256,14,5);ell(smile,0xd49786,0,-.217,.403,.048,.009,.01,true);compile(smile);
  }
  function buildHair(style='bob',tone=hairColor){clear(hair);hairStyle=String(style||'bob').replace(/^hair-/,'');hairColor=color(tone,hairColor);const c=hairStyle==='silver'?0xbabec7:hairColor,dark=new T.Color(c).multiplyScalar(.78).getHex(),light=new T.Color(c).lerp(new T.Color(0xffe3b3),.18).getHex();
   const capGeo=new T.SphereGeometry(.486,26,14,0,Math.PI*2,0,Math.PI*.51);const capPositions=capGeo.attributes.position;for(let i=0;i<capPositions.count;i++){const z=capPositions.getZ(i),y=capPositions.getY(i);if(z>0&&y<.19)capPositions.setY(i,y+(.19-y)*Math.min(1,z/.25));}capGeo.computeVertexNormals();ownedG.add(capGeo);const cap=mesh(hair,capGeo,c,0,.043,-.018,.46);cap.scale.set(1,1,.91);
   for(let i=0;i<13;i++){const a=-Math.PI*.58+i/12*Math.PI*1.16,x=Math.sin(a)*.434,z=-Math.cos(a)*.38;
    const length=hairStyle==='pony'?.19:hairStyle==='braids'?.27:.45;
    lock(hair,[[x*.83,.30,z*.81],[x*1.065,.01,z],[x*1.04,-length,z*.87+.035]],.092,i%3===0?light:c,.57);
   }
   for(const side of[-1,1])lock(hair,[[side*.27,.35,.25],[side*.454,.04,.202],[side*.432,-.32,.12]],.085,c,.49);
   for(let i=0;i<8;i++){const x=-.34+i*.094,side=i<4?-1:1;lock(hair,[[x*.72,.424,.19],[x,.28,.385],[x+side*.017,.137+(i%3)*.013,.419]],.063,i%3===0?light:c,.43);}
   if(hairStyle==='pony'){
    ell(hair,dark,0,.075,-.45,.125,.12,.11);lock(hair,[[0,.1,-.45],[.08,-.22,-.58],[.16,-.65,-.35]],.17,c,.8);lock(hair,[[.08,.09,-.46],[.15,-.24,-.54],[.19,-.62,-.32]],.085,light,.7);ell(hair,0xc38d66,0,.075,-.48,.13,.035,.12,true);
   }else if(hairStyle==='braids')for(const side of[-1,1]){for(let i=0;i<5;i++)ell(hair,i%2?c:light,side*(.43+(i%2)*.026),-.20-i*.07,-.08,.083,.068,.075,true,.52);ell(hair,0xbd7f74,side*.45,-.54,-.07,.077,.029,.068,true);}
   for(const side of[-1,1])for(let i=0;i<3;i++)curve(hair,[[side*(.31+i*.035),.31-i*.025,.20-i*.027],[side*(.452+i*.004),.01,.19-i*.024],[side*(.418+i*.012),-.255-i*.018,.145-i*.027]],.0033,light,9,4,.46);
   compile(hair);
  }
  const theme=()=>outfit==='uniform'?{...THEMES.uniform,top:baseColor}:(THEMES[outfit]||{...THEMES.uniform,top:baseColor});
  function buildLeg(leg,theme){clear(leg);const pantGeo=new T.CapsuleGeometry(.108,.37,5,14);ownedG.add(pantGeo);const pant=mesh(leg,pantGeo,theme.pants,0,-.276,0);pant.scale.z=1.10;ell(leg,0x414046,0,-.54,.019,.116,.046,.128,true);
   ell(leg,0xe8e3d5,0,-.662,.072,.145,.096,.245);ell(leg,0xf8f2e7,0,-.626,.045,.132,.111,.205);ell(leg,0xc5b9aa,0,-.719,.086,.148,.022,.239);ell(leg,0xe9c9a6,.096,-.63,.081,.032,.027,.122,true);
   for(const y of[-.588,-.621,-.654])curve(leg,[[-.07,y,.203],[0,y+.015,.227],[.07,y,.203]],.009,0xfff9ec,5,4);
   curve(leg,[[.13,-.66,-.06],[.14,-.642,.06],[.115,-.66,.18]],.012,theme.accent,7,4);
   curve(leg,[[-.12,-.651,.17],[-.10,-.678,.238],[.08,-.678,.244],[.125,-.651,.173]],.007,0xd5c7b2,8,4);compile(leg);
  }
  for(const side of[-1,1]){const leg=group(g,side*.153,.828,0);legs.push(leg);}
  function buildBody(theme){clear(body);clothing.length=0;
   const torsoGeo=new T.LatheGeometry([new T.Vector2(0,0),new T.Vector2(.245,0),new T.Vector2(.29,.07),new T.Vector2(.293,.25),new T.Vector2(.255,.42),new T.Vector2(.18,.49),new T.Vector2(.10,.49)],22);ownedG.add(torsoGeo);const torso=mesh(body,torsoGeo,theme.top,0,.923,0);torso.scale.z=.73;clothing.push(torso);
   ell(body,theme.pants,0,.864,0,.256,.137,.179);ell(body,theme.top,0,.952,0,.284,.064,.211);ell(body,skin,0,1.45,0,.096,.13,.085,true);
   const collarGeo=new T.TorusGeometry(.114,.032,7,22);ownedG.add(collarGeo);const collar=mesh(body,collarGeo,theme.top,0,1.435,.01);collar.rotation.x=Math.PI/2;
   for(const side of[-1,1]){curve(body,[[side*.025,1.435,.115],[side*.124,1.379,.20],[side*.155,1.341,.213]],.023,theme.trim,7,5);curve(body,[[side*.238,1.264,.161],[side*.237,1.10,.174],[side*.222,.99,.166]],.006,0x555052,7,4);}
   curve(body,[[0,1.36,.207],[0,1.18,.219],[0,.967,.191]],.009,theme.trim,9,4);ell(body,0xc6baaa,0,1.31,.228,.021,.032,.015,true,.46);
   // Small bag, curved strap, cuffs, ribbed hems and zip remain true geometry.
   curve(body,[[-.20,1.39,.16],[-.11,1.23,.237],[.03,1.04,.254],[.25,.96,.165]],.022,0x807a6f,14,5);
   const bag=ell(body,0x77756d,.249,1.014,.098,.137,.145,.102);bag.rotation.z=-.12;ell(body,0x8e8b80,.252,1.038,.187,.111,.066,.018,true);
   for(const side of[-1,1])ell(body,theme.accent,side*.279,1.04,.004,.022,.022,.049,true);
   for(let i=0;i<11;i++){const a=-1.12+i*.224;curve(body,[[Math.sin(a)*.268,.946,Math.cos(a)*.205],[Math.sin(a)*.271,.988,Math.cos(a)*.207]],.0035,theme.trim,2,3);}
   if(outfit==='forest'||outfit==='ocean'){ell(body,theme.pants,0,1.18,-.234,.216,.24,.084);curve(body,[[-.17,1.39,-.077],[-.18,1.14,.18],[-.16,.98,.16]],.022,theme.trim,9,5);}
   compile(body);legs.forEach(l=>buildLeg(l,theme));
   for(let i=0;i<2;i++){const arm=arms[i],side=i?1:-1;clear(arm);const sleeveGeo=new T.CapsuleGeometry(.105,.20,5,14);ownedG.add(sleeveGeo);const sleeve=mesh(arm,sleeveGeo,theme.top,side*.01,-.155,.003);sleeve.scale.z=1.08;ell(arm,theme.trim,side*.026,-.332,.02,.112,.043,.118,true);
    ell(arm,skin,side*.028,-.418,.025,.087,.098,.079);ell(arm,skin,-side*.035,-.403,.087,.042,.058,.04,true);for(let f=0;f<3;f++)ell(arm,skin,side*.028+(f-1)*.034,-.472,.055,.018,.024,.026,true);
    curve(arm,[[-.07,-.27,.102],[0,-.291,.122],[.073,-.27,.102]],.006,theme.trim,6,4);compile(arm);
   }
  }
  for(const side of[-1,1])arms.push(group(g,side*.365,1.393,0));
  buildHead();buildHair(options.hairStyle||'bob',hairColor);buildBody(theme());
  function setAppearance(next={}){if(disposed)return;const nextSkin=PALETTE[next.skin]||skin,nextOutfit=String(next.outfit||'uniform').replace(/^outfit-/,''),nextHair=String(next.hair||'bob').replace(/^hair-/,''),nextTone=color(next.hairColor,({pony:0x6a4f3e,braids:0x6e4643,silver:0xb2b6bf})[nextHair]||color(options.hair,0x53473e));profile={...next};g.userData.avatarPreset=next.avatarPreset||'';
   if(nextSkin!==skin){skin=nextSkin;buildHead();buildBody(theme());}
   if(nextOutfit!==outfit){outfit=nextOutfit;buildBody(theme());}
   if(nextHair!==hairStyle||nextTone!==hairColor)buildHair(nextHair,nextTone);
  }
  function dispose(){if(disposed)return;disposed=true;for(const geo of ownedG)geo.dispose();for(const m of ownedM)m.dispose();ownedG.clear();ownedM.clear();materials.clear();g.clear();g.removeFromParent();}
  return {group:g,head,arms,legs,clothing,modelType:'character',setAppearance,setColor(c){if(disposed)return;const next=color(c,baseColor);if(next!==baseColor){baseColor=next;if(outfit==='uniform')buildBody(theme());}},setHairStyle(style,tone){if(!disposed)buildHair(style,color(tone,hairColor));},dispose,
   animate(phase,moving,sit=false,wave=false){if(disposed)return;lastPhase=Number(phase)||0;const t=lastPhase*.25,cycle=((t+1.3)%4.4),close=cycle<.13?Math.sin(cycle/.13*Math.PI):0;blink=1-close*.96;for(const eye of eyes)eye.scale.y=blink;if(smileNode)smileNode.scale.y=1+Math.sin(t*.7)*.045;
    g.position.y=sit?.34:moving?Math.abs(Math.sin(phase))*.026:Math.sin(t*1.6)*.008;body.scale.y=1+Math.sin(t*1.6)*.004;head.rotation.z=moving?Math.sin(phase*.5)*.018:Math.sin(t*.65)*.009;head.rotation.y=Math.sin(t*.47)*.018;
    legs.forEach((l,i)=>{l.rotation.x=sit?-1.16:moving?Math.sin(phase+i*Math.PI)*.43:0;l.rotation.z=sit?(i?-.04:.04):0;});arms.forEach((a,i)=>{a.rotation.x=sit?-.28:moving?-Math.sin(phase+i*Math.PI)*.33:Math.sin(t*.8+i)*.014;a.rotation.z=wave&&i===1?-2.1+Math.sin(phase*1.5)*.23:(i?-.065:.065);});
   },state(){return {version:'deluxe.1',hair:hairStyle,outfit,blink,phase:lastPhase,disposed,profile:{...profile},ownedGeometries:ownedG.size,ownedMaterials:ownedM.size,sharedGeometries:shared.size};}
  };
 }
 root.CozyAvatarDeluxe=Object.freeze({create,themes:Object.keys(THEMES),sharedStats:()=>({geometries:shared.size}),isSharedResource:r=>[...shared.values()].includes(r)});
})(typeof window==='undefined'?globalThis:window);
