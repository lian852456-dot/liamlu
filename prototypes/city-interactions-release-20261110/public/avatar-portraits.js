/* Opt-in Art Lab character. Original procedural meshes and API remain intact.
 * Shared head texture maps; no external services, per-frame generation or data writes. */
(function(root){'use strict';
 const T=root.THREE, shared=new Map();
 const PALETTE={orange:0xf4c5a0,teal:0xf1bd9f,purple:0xd9a8a1};
 const THEMES={uniform:{top:0x303036,trim:0xddd8cb,pants:0x34353a,accent:0xd28f56},forest:{top:0x718b78,trim:0xe0d7bf,pants:0x635f53,accent:0xa2754b},ocean:{top:0x63869d,trim:0xe7e2d2,pants:0x354354,accent:0xb98258},rose:{top:0xc98d9a,trim:0xf0d8cf,pants:0x63525b,accent:0xaf687e},gold:{top:0xba975b,trim:0xf1dfb4,pants:0x4e4540,accent:0xa26b45},purple:{top:0x8e7d9c,trim:0xded5e3,pants:0x49424e,accent:0xb48379},violet:{top:0x8e7d9c,trim:0xded5e3,pants:0x49424e,accent:0xb48379}};
 const color=(v,f)=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&/^#?[a-f0-9]{6}$/i.test(v)?parseInt(v.replace('#',''),16):f;
 const baseGeo=(key,fn)=>{if(!shared.has(key))shared.set(key,fn());return shared.get(key);};
 const unitSphere=()=>baseGeo('sphere',()=>new T.SphereGeometry(1,16,10));
 const smallSphere=()=>baseGeo('small-sphere',()=>new T.SphereGeometry(1,12,6));
 function create(parent,options={}){const portrait=root.CozyPortraitConfig.get(options.portraitPreset);if(!portrait)throw Error('PORTRAIT_PRESET_REQUIRED');
  const g=new T.Group();parent?.add(g);g.name='artlab-deluxe-character';g.scale.setScalar(Number(options.scale)||1);g.userData={modelType:'character',artToy:true,artLabCandidate:true,version:'portrait-trial.1',portraitKey:portrait.key};
  const ownedG=new Set(),ownedM=new Set(),materials=new Map(),arms=[],legs=[],clothing=[];
  let disposed=false,skin=portrait.skinTone,hairColor=portrait.hairTone,outfit='uniform',hairStyle='bob',baseColor=color(options.color,0x303036),profile={},blink=1,lastPhase=0,smileNode=null;
  const group=(p,x=0,y=0,z=0)=>{const n=new T.Group();n.position.set(x,y,z);p.add(n);return n;};
  const mat=(c,rough=.72)=>{const k=c+':'+rough;if(!materials.has(k)){const m=new T.MeshStandardMaterial({color:c,roughness:rough,metalness:0});materials.set(k,m);ownedM.add(m);}return materials.get(k);};
  const mesh=(p,geo,c,x=0,y=0,z=0,rough=.72)=>{const m=new T.Mesh(geo,c?.isMaterial?c:mat(c,rough));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;p.add(m);return m;};
  const ell=(p,c,x,y,z,sx,sy,sz,small=false,rough=.72)=>{const m=mesh(p,small?smallSphere():unitSphere(),c,x,y,z,rough);m.scale.set(sx,sy,sz);return m;};
  const curve=(p,points,r,c,segments=10,radial=5,rough=.72)=>{const q=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),geo=new T.TubeGeometry(q,segments,r,radial,false);ownedG.add(geo);return mesh(p,geo,c,0,0,0,rough);};
  function clear(p){if(p===hair){for(const child of [...hair.children])if(child.userData?.portraitHair)root.CozyPortraitHair.release(child);}if(p===hair)for(const child of [...p.children])if(child.userData.blenderHair)root.CozyHairGLB?.release(child);p.traverse(n=>{if(!n.isMesh)return;if(ownedG.has(n.geometry)){n.geometry.dispose();ownedG.delete(n.geometry);}for(const m of(Array.isArray(n.material)?n.material:[n.material]))if(ownedM.has(m)&&!materials.has([...materials].find(([,v])=>v===m)?.[0])){m.dispose();ownedM.delete(m);}});p.clear();}
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
  const bodyProportions=group(g,0,1.238-1.444*(.458/.542),0);bodyProportions.scale.set(1.04,.458/.542,1.06);
  const body=group(bodyProportions),head=group(g,0,1.784,0),headSkin=group(head),face=group(head),hair=group(head),eyes=[],upperLids=[];
  function artMat(kind,tone=skin){const key='head-art:'+kind+':'+tone;if(!materials.has(key)){const material=root.CozyHeadArtIntegrated.material(kind,tone);materials.set(key,material);ownedM.add(material);}return materials.get(key);}
  function skinEll(c,x,y,z,sx,sy,sz,small=false){const geo=(small?smallSphere():unitSphere()).clone(),col=new T.Color(c),values=[];for(let i=0;i<geo.attributes.position.count;i++)values.push(col.r,col.g,col.b);geo.setAttribute('color',new T.Float32BufferAttribute(values,3));ownedG.add(geo);const m=mesh(headSkin,geo,artMat('skin'),x,y,z);m.scale.set(sx,sy,sz);return m;}
  function buildHead(){clear(headSkin);clear(face);eyes.length=0;upperLids.length=0;
   const geo=new T.SphereGeometry(.47,28,20),v=geo.attributes.position,colors=[];
   const base=new T.Color(skin),warm=new T.Color(0xefa19a);
   for(let i=0;i<v.count;i++){const x=v.getX(i),y=v.getY(i),z=v.getZ(i),jaw=y<0?1-portrait.jaw*Math.pow(-y/.47,1.4):1-.035*y/.47;v.setXYZ(i,x*jaw*portrait.faceWidth,y*.98,z*.88);
    const cheeks=Math.exp(-((Math.abs(x)-.26)**2/.009+(y+.10)**2/.006+(z-.34)**2/.018))*.26,tint=base.clone().lerp(warm,cheeks);colors.push(tint.r,tint.g,tint.b);
   }geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();ownedG.add(geo);
   const skinMat=artMat('skin');mesh(headSkin,geo,skinMat);
   for(const side of[-1,1]){skinEll(skin,side*.447,-.035,-.005,.075,.101,.063,true);skinEll(0xe5ac98,side*.478,-.04,.033,.024,.046,.018,true);}
   skinEll(skin,0,-.1,.416,.044*portrait.noseX,.035,.046,true);skinEll(0xe3aa94,0,-.117,.449,.023,.012,.007,true);compile(headSkin);
   const brows=group(face);for(const side of[-1,1]){const eye=group(face,side*.165,.015,.386);eye.rotation.y=side*.17;eyes.push(eye);
    ell(eye,0xfff7ec,0,0,0,.100,.115,.014,false,.4);
    ell(eye,0x8c5a36,0,-.002,.012,.080,.098,.012,false,.4);
    ell(eye,0x462f24,0,.014,.022,.061,.078,.006,false,.4);
    ell(eye,0x261f20,0,.013,.027,.043,.064,.004,false,.4);
    ell(eye,0xbd8c53,0,-.068,.023,.031,.007,.004,true,.4);
    ell(eye,0xfffbef,-.025,.048,.032,.019,.023,.004,true,.4);ell(eye,0xffedce,.026,-.033,.031,.008,.01,.003,true,.4);
    curve(eye,[[-.102,.037,.009],[-.08,.105,.014],[.02,.126,.01],[.1,.064,.006]],.010,0x48342c,12,5,.4);
    const lash=curve(eye,[[side*.075,.078,.005],[side*.113,.098,0],[side*.126,.116,-.002]],.007,0x48342c,5,4,.4);upperLids.push(lash);compile(eye);
    curve(brows,[[side*.079,.166,.376],[side*.154,.189,.366],[side*.245,.168,.344]],.015,portrait.brow,10,5);
   }
   compile(brows);if(portrait.glasses){const specs=group(face);specs.name='portrait-glasses';for(const side of[-1,1]){const frame=group(specs,side*.165,.014,.433);frame.rotation.y=side*.14;curve(frame,[[-.119,.098,.006],[-.125,.035,.014],[-.112,-.098,.012],[0,-.121,.008],[.113,-.096,.005],[.125,.04,.004],[.117,.101,0],[0,.115,0],[-.119,.098,.006]],.0065,0x756f61,30,5,.45);curve(frame,[[-.119,.098,.009],[0,.115,.009],[.117,.101,.009]],.0075,0x383737,12,5,.5);}curve(specs,[[-.044,.025,.46],[0,.041,.471],[.044,.025,.46]],.0055,0x817b6c,8,5,.5);for(const side of[-1,1])curve(specs,[[side*.28,.07,.44],[side*.36,.062,.32],[side*.438,.04,.03]],.005,0x655e55,12,5,.5);compile(specs);}const smile=group(face);smileNode=smile;smile.name='smile';curve(smile,[[-.075,-.179+portrait.mouthCorner,.407],[-.032,-.196,.419],[.025,-.197,.42],[.076,-.178+portrait.mouthCorner,.405]],.0085,0x9f6256,14,5);ell(smile,0xd49786,0,-.217,.403,.048,.009,.01,true);smile.scale.x=portrait.mouthWidth;compile(smile);
  }
  function buildHair(style='portrait',tone=portrait.hairTone){clear(hair);hairStyle=String(style||'portrait').replace(/^hair-/,'');hairColor=color(tone,portrait.hairTone);const custom=['portrait','default',''].includes(hairStyle),imported=custom&&root.CozyPortraitHair.ready(portrait.key)?root.CozyPortraitHair.create(portrait.key,hairColor):hairStyle==='bob'&&root.CozyHairGLB?.ready()?root.CozyHairGLB.create(hairColor):null;if(imported){hair.add(imported);hair.userData.source=custom?'portrait-glb':'blender-glb';}else{root.CozyHeadArtIntegrated.hair(hair,custom?(portrait.key==='b'?'default':portrait.key==='a'?'pony':'bob'):hairStyle,artMat('hair',hairColor),ownedG);compile(hair);hair.userData.source='procedural-fallback';}}
  const theme=()=>outfit==='uniform'?(portrait.uniform==='olive'?{...THEMES.forest,top:0x555847,trim:0xe0c6b1,pants:0x30302e,accent:0xa9674a}:{...THEMES.uniform,top:0xf6f2e9,trim:0xe8e2d8,pants:0x303238,accent:0xe97525}):(THEMES[outfit]||{...THEMES.uniform,top:baseColor});
  // All body surfaces use the same matte vertex-color material. Clothing and
  // hands can meet continuously without separate cylindrical joint pieces.
  function bodyMaterial(){const key='body-sculpt-vertex';if(!materials.has(key)){const m=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.72});materials.set(key,m);ownedM.add(m);}return materials.get(key);}
  function loft(parent,rings,{segments=24,shape=2,thumbSide=0,capEnds=true,inside=false}={}){
   const positions=[],colors=[],indices=[],step=segments+1,ascending=rings[rings.length-1].y>rings[0].y;
   for(let i=0;i<rings.length;i++){const r=rings[i],c=new T.Color(r.c);
    for(let j=0;j<=segments;j++){const a=j/segments*Math.PI*2,co=Math.cos(a),si=Math.sin(a),u=Math.sign(co)*Math.pow(Math.abs(co),2/shape),v=Math.sign(si)*Math.pow(Math.abs(si),2/shape);
     const thumb=thumbSide&&r.hand?Math.pow(Math.max(0,-thumbSide*co*.83+si*.56),8)*r.hand:0;
     positions.push((r.x||0)+(r.rx+thumb)*u,r.y-(r.slope||0)*Math.pow(Math.abs(co),1.5)-(r.drape||0)*(.5+.5*si),(r.z||0)+(r.rz+thumb*.65)*v);colors.push(c.r,c.g,c.b);
    }
   }
   for(let i=0;i<rings.length-1;i++)for(let j=0;j<segments;j++){const a=i*step+j,b=a+step;indices.push(...(ascending?[a,b,a+1,b,b+1,a+1]:[a,a+1,b,b,a+1,b+1]));}
   for(const end of(capEnds?[0,rings.length-1]:[])){const r=rings[end],c=new T.Color(r.c),center=positions.length/3;positions.push(r.x||0,r.y,r.z||0);colors.push(c.r,c.g,c.b);for(let j=0;j<segments;j++){const a=end*step+j;indices.push(...((end===0)===ascending?[center,a,a+1]:[center,a+1,a]));}}
   if(inside)for(let i=0;i<indices.length;i+=3){const b=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=b;}
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();const n=geo.attributes.normal;
   for(let i=0;i<rings.length;i++){const a=i*step,b=a+segments,v=new T.Vector3(n.getX(a)+n.getX(b),n.getY(a)+n.getY(b),n.getZ(a)+n.getZ(b)).normalize();n.setXYZ(a,v.x,v.y,v.z);n.setXYZ(b,v.x,v.y,v.z);}
   ownedG.add(geo);return mesh(parent,geo,bodyMaterial());
  }
  function bodyCurve(parent,points,r,c,segments=10){const path=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),geo=new T.TubeGeometry(path,segments,r,5,false),color=new T.Color(c),values=[];for(let i=0;i<geo.attributes.position.count;i++)values.push(color.r,color.g,color.b);geo.setAttribute('color',new T.Float32BufferAttribute(values,3));ownedG.add(geo);return mesh(parent,geo,bodyMaterial());}
  function buildLeg(leg,t){clear(leg);const side=Math.sign(leg.position.x);
   // Relaxed cloth keeps the V3 leg endpoints and pivots. A fuller knee and
   // soft lower-leg drape lead to a small rolled hem, instead of hugging calf.
   loft(leg,[
    {y:.045,rx:.104,rz:.117,z:-.006,c:t.pants},
    {y:.005,rx:.124,rz:.130,z:-.007,c:t.pants},
    {y:-.075,rx:.132,rz:.137,z:-.003,c:t.pants},
    {y:-.17,rx:.134,rz:.139,x:side*.005,z:.010,c:t.pants},
    {y:-.265,rx:.130,rz:.136,x:side*.010,z:.021,c:t.pants},
    {y:-.34,rx:.127,rz:.130,x:side*.014,z:.020,c:t.pants},
    {y:-.43,rx:.121,rz:.121,x:side*.014,z:.008,c:t.pants},
    {y:-.505,rx:.114,rz:.112,x:side*.011,z:-.002,c:t.pants},
    {y:-.565,rx:.111,rz:.108,x:side*.009,z:-.007,c:t.pants},
    {y:-.583,rx:.115,rz:.111,x:side*.008,z:-.008,c:t.pants},
    {y:-.600,rx:.113,rz:.109,x:side*.008,z:-.008,c:t.pants},
    {y:-.608,rx:.108,rz:.104,x:side*.008,z:-.008,c:t.pants}
   ].map(r=>({...r,y:r.y*(.505/.653)+.045*(1-.505/.653),rx:r.rx*1.05,rz:r.rz*1.03})),{segments:22});
   // One last-shaped shoe: heel, ankle, instep and toe blend into one shell.
   const shoe=group(leg,0,.1196,0);shoe.scale.setScalar(.94);
   loft(shoe,[
    {y:-.800,rx:.132,rz:.191,z:.052,c:0xc5b9aa},
    {y:-.785,rx:.147,rz:.214,z:.055,c:0xe5dece},
    {y:-.754,rx:.150,rz:.219,z:.057,c:0xf4eee2},
    {y:-.728,rx:.146,rz:.213,z:.053,c:0xf7f1e6},
    {y:-.696,rx:.136,rz:.197,z:.042,c:0xf7f1e6},
    {y:-.658,rx:.123,rz:.163,z:.017,c:0xf7f1e6},
    {y:-.622,rx:.104,rz:.120,z:-.010,c:0xf7f1e6},
    {y:-.592,rx:.085,rz:.090,z:-.025,c:0xddd6c8},
    {y:-.578,rx:.079,rz:.081,z:-.027,c:0xddd6c8}
   ].map(r=>({...r,y:r.y-.04})),{segments:24,shape:2});
   for(const [y,z]of[[-.665,.173],[-.690,.202],[-.715,.223]])bodyCurve(shoe,[[-.066,y,z],[0,y+.01,z+.012],[.066,y,z]],.008,0xfff9ed,5);
   bodyCurve(shoe,[[side*.137,-.731,-.021],[side*.147,-.719,.071],[side*.126,-.738,.174]],.010,t.accent,7);
   compile(leg);
  }
  for(const side of[-1,1])legs.push(group(g,side*.142,.680,0));
  function buildBody(t){clear(body);clothing.length=0;
   // A single curved jacket silhouette, from rounded hem to dropped shoulder.
   const coat=loft(body,[
    {y:.891,rx:.246,rz:.193,z:.009,c:t.top,drape:.009},
    {y:.902,rx:.263,rz:.207,z:.011,c:t.top,drape:.012},
    {y:.925,rx:.276,rz:.221,z:.013,c:t.top,drape:.013},
    {y:.972,rx:.293,rz:.231,z:.015,c:t.top,drape:.008},
    {y:1.055,rx:.309,rz:.236,z:.014,c:t.top},
    {y:1.145,rx:.302,rz:.227,z:.008,c:t.top},
    {y:1.235,rx:.291,rz:.210,z:.003,c:t.top},
    {y:1.305,rx:.282,rz:.190,z:0,c:t.top,slope:.022},
    {y:1.354,rx:.255,rz:.166,z:0,c:t.top,slope:.026},
    {y:1.391,rx:.220,rz:.140,z:0,c:t.top,slope:.018},
    {y:1.425,rx:.151,rz:.112,z:0,c:t.top,slope:.007},
    {y:1.444,rx:.104,rz:.090,z:0,c:t.top}
   ].map(r=>portrait.uniform==='banded'&&outfit==='uniform'?{...r,c:r.y>1.26?0x292a2b:r.c}:r),{segments:28});clothing.push(coat);
   // Hips flow under the hem into the two thighs, without a separate oval pad.
   loft(body,[{y:.953,rx:.224,rz:.171,c:t.pants},{y:.905,rx:.244,rz:.178,c:t.pants},{y:.847,rx:.222,rz:.166,z:-.004,c:t.pants},{y:.816,rx:.174,rz:.143,z:-.004,c:t.pants},{y:.805,rx:.105,rz:.109,c:t.pants}],{segments:26});
   // A broad seated neck base is hidden by a soft collar. Head, jaw, height,
   // shoulder shell and every animation pivot stay exactly at the V4 baseline.
   const neck=loft(body,[
    {y:1.410,rx:.110,rz:.096,c:skin},
    {y:1.453,rx:.098,rz:.088,c:skin},
    {y:1.505,rx:.085,rz:.078,c:skin},
    {y:1.546,rx:.079,rz:.074,c:skin},
    {y:1.566,rx:.076,rz:.071,c:skin}
   ],{segments:22});neck.name='artlab-neck-seat';
   // Two open surfaces meet at a rolled lip, leaving a real neckline opening.
   const collar=loft(body,[
    {y:1.378,rx:.205,rz:.145,z:.002,c:t.top},
    {y:1.408,rx:.176,rz:.129,z:.002,c:t.top,drape:-.002},
    {y:1.442,rx:.146,rz:.108,z:.002,c:t.top,drape:-.004},
    {y:1.470,rx:.120,rz:.096,z:.002,c:t.top,drape:-.006},
    {y:1.488,rx:.108,rz:.088,z:.002,c:t.top,drape:-.008},
    {y:1.495,rx:.103,rz:.085,z:.002,c:t.top,drape:-.008}
   ].map(r=>({...r,c:portrait.uniform==='banded'&&outfit==='uniform'?0x292a2b:r.c})),{segments:24,capEnds:false});collar.name='artlab-collar-outer';
   const collarInside=loft(body,[
    {y:1.495,rx:.103,rz:.085,z:.002,c:t.top,drape:-.008},
    {y:1.490,rx:.097,rz:.080,z:.002,c:t.top,drape:-.008},
    {y:1.477,rx:.094,rz:.080,z:.002,c:t.top,drape:-.006},
    {y:1.445,rx:.093,rz:.085,z:.002,c:t.top,drape:-.004}
   ].map(r=>({...r,c:portrait.uniform==='banded'&&outfit==='uniform'?0x292a2b:r.c})),{segments:24,capEnds:false,inside:true});collarInside.name='artlab-collar-inner';
   for(const side of[-1,1]){curve(body,[[side*.025,1.435,.111],[side*.119,1.381,.153],[side*.158,1.342,.169]],.020,t.trim,7,5);curve(body,[[side*.243,1.25,.155],[side*.257,1.11,.153],[side*.247,.981,.157]],.0045,0x555052,7,4);}
   curve(body,[[0,1.36,.167],[0,1.18,.245],[0,.942,.239]],.008,t.trim,10,4);ell(body,0xc6baaa,0,1.31,.205,.019,.029,.013,true,.46);
   // Keep the same outfit/accessories as V1; only re-seat them on the new shell.
   if(portrait.uniform!=='banded'||outfit!=='uniform'){curve(body,[[-.20,1.39,.14],[-.11,1.23,.238],[.03,1.04,.268],[.26,.96,.181]],.022,0x807a6f,14,5);
   const bag=ell(body,0x77756d,.258,1.014,.112,.137,.145,.102);bag.rotation.z=-.12;ell(body,0x8e8b80,.261,1.038,.201,.111,.066,.018,true);
   }if(portrait.badge&&outfit==='uniform'){ell(body,0x6d6c65,-.17,1.27,.175,.047,.026,.014,true);ell(body,0xf2ede5,-.165,1.272,.189,.035,.017,.006,true);ell(body,0xe78230,-.196,1.273,.193,.010,.011,.006,true);}for(const side of[-1,1])ell(body,t.accent,side*.270,1.04,.004,.019,.020,.041,true);
   if(outfit==='forest'||outfit==='ocean'){ell(body,t.pants,0,1.18,-.234,.216,.24,.084);curve(body,[[-.17,1.39,-.077],[-.18,1.14,.18],[-.16,.98,.16]],.022,t.trim,9,5);}
   compile(body);legs.forEach(l=>buildLeg(l,t));
   for(let i=0;i<2;i++){const arm=arms[i],side=i?1:-1;clear(arm);
    // The sleeve starts inside the sloping shoulder, curves at the elbow and
    // narrows into a small wrist. Skin and cuff are continuous vertex bands.
    loft(arm,[
     {y:.060,x:-side*.055,rx:.008,rz:.012,z:-.006,c:t.top},
     {y:.040,x:-side*.040,rx:.042,rz:.058,z:-.005,c:t.top},
     {y:.010,x:-side*.020,rx:.078,rz:.091,z:-.003,c:t.top},
     {y:-.035,x:side*.010,rx:.102,rz:.109,z:0,c:t.top},
     {y:-.090,x:side*.031,rx:.106,rz:.108,z:.005,c:t.top},
     {y:-.120,x:side*.043,rx:.106,rz:.105,z:.008,c:t.top},
     {y:-.195,x:side*.057,rx:.101,rz:.100,z:.024,c:t.top},
     {y:-.265,x:side*.064,rx:.093,rz:.091,z:.039,c:t.top},
     {y:-.320,x:side*.063,rx:.082,rz:.081,z:.043,c:t.top},
     {y:-.335,x:side*.062,rx:.080,rz:.079,z:.044,c:t.trim},
     {y:-.348,x:side*.061,rx:.079,rz:.078,z:.045,c:t.trim},
     {y:-.359,x:side*.060,rx:.074,rz:.072,z:.046,c:t.trim},
     {y:-.369,x:side*.060,rx:.060,rz:.055,z:.047,c:skin},
     {y:-.390,x:side*.061,rx:.059,rz:.049,z:.049,c:skin,hand:.012},
     {y:-.419,x:side*.063,rx:.066,rz:.051,z:.052,c:skin,hand:.026},
     {y:-.450,x:side*.064,rx:.066,rz:.050,z:.053,c:skin,hand:.024},
     {y:-.479,x:side*.063,rx:.049,rz:.040,z:.053,c:skin,hand:.009},
     {y:-.492,x:side*.062,rx:.014,rz:.017,z:.052,c:skin}
    ].map(r=>({...r,c:portrait.uniform==='banded'&&outfit==='uniform'&&r.y>-.369?(r.y<=-.195&&r.y>=-.265?0xe97525:0xf6f2e9):r.c,y:r.y>=-.369?r.y*.90:r.y+.0369,rx:r.rx*1.015,rz:r.rz*1.015})),{segments:22,thumbSide:side});compile(arm);
   }
  }
  for(const side of[-1,1])arms.push(group(g,side*.292,1.132,0));
  buildHead();buildHair('portrait',portrait.hairTone);buildBody(theme());
  root.CozyPortraitHair.load(portrait.key).then(()=>{if(!disposed&&['portrait','default',''].includes(hairStyle)&&hair.userData.source!=='portrait-glb')buildHair(hairStyle,hairColor);}).catch(()=>{});
  function setAppearance(next={}){if(disposed)return;const nextSkin=next.skin==='orange'||!next.skin?portrait.skinTone:PALETTE[next.skin]||skin,nextOutfit=String(next.outfit||'uniform').replace(/^outfit-/,''),nextHair=String(next.hair||'portrait').replace(/^hair-/,''),nextTone=color(next.hairColor,({pony:0x6a4f3e,braids:0x6e4643,silver:0xb2b6bf})[nextHair]||portrait.hairTone);profile={...next};g.userData.avatarPreset=next.avatarPreset||'';
   if(nextSkin!==skin){skin=nextSkin;buildHead();buildBody(theme());}
   if(nextOutfit!==outfit){outfit=nextOutfit;buildBody(theme());}
   if(nextHair!==hairStyle||nextTone!==hairColor)buildHair(nextHair,nextTone);
  }
  function dispose(){if(disposed)return;disposed=true;clear(hair);for(const geo of ownedG)geo.dispose();for(const m of ownedM)m.dispose();ownedG.clear();ownedM.clear();materials.clear();g.clear();g.removeFromParent();}
  return {group:g,head,arms,legs,clothing,modelType:'character',setAppearance,setColor(c){if(disposed)return;const next=color(c,baseColor);if(next!==baseColor){baseColor=next;if(outfit==='uniform')buildBody(theme());}},setHairStyle(style,tone){if(!disposed)buildHair(style,color(tone,hairColor));},dispose,
   animate(phase,moving,sit=false,wave=false){if(disposed)return;lastPhase=Number(phase)||0;const t=lastPhase*.25,cycle=((t+1.3)%4.4),close=cycle<.13?Math.sin(cycle/.13*Math.PI):0;blink=1-close*.96;for(const eye of eyes)eye.scale.y=blink;if(smileNode)smileNode.scale.y=1+Math.sin(t*.7)*.045;
    g.position.y=sit?.34:moving?Math.abs(Math.sin(phase))*.026:Math.sin(t*1.6)*.008;body.scale.y=1+Math.sin(t*1.6)*.004;head.rotation.z=moving?Math.sin(phase*.5)*.018:Math.sin(t*.65)*.009;head.rotation.y=Math.sin(t*.47)*.018;
    legs.forEach((l,i)=>{l.rotation.x=sit?-1.16:moving?Math.sin(phase+i*Math.PI)*.43:0;l.rotation.z=sit?(i?-.04:.04):0;});arms.forEach((a,i)=>{a.rotation.x=sit?-.28:moving?-Math.sin(phase+i*Math.PI)*.33:Math.sin(t*.8+i)*.014;a.rotation.z=wave&&i===1?-2.1+Math.sin(phase*1.5)*.23:(i?-.065:.065);});
   },state(){return {version:'portrait-trial.1',portraitKey:portrait.key,hair:hairStyle,hairSource:hair.userData.source,outfit,blink,phase:lastPhase,disposed,profile:{...profile},ownedGeometries:ownedG.size,ownedMaterials:ownedM.size,sharedGeometries:shared.size};}
  };
 }
 root.CozyAvatarPortraits=Object.freeze({create,themes:Object.keys(THEMES),sharedStats:()=>({geometries:shared.size}),isSharedResource:r=>[...shared.values()].includes(r)});
})(typeof window==='undefined'?globalThis:window);
