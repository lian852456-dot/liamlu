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
 function create(parent,options={}){const portrait=root.CozyRefinedPortraitConfig.get(options.portraitPreset);if(!portrait)throw Error('PORTRAIT_PRESET_REQUIRED');
  const g=new T.Group();parent?.add(g);g.name='artlab-deluxe-character';g.scale.setScalar(Number(options.scale)||1);g.userData={modelType:'character',artToy:true,artLabCandidate:true,version:'photo-four-q2.1',portraitKey:portrait.key};
  const ownedG=new Set(),ownedM=new Set(),materials=new Map(),arms=[],legs=[],clothing=[];
  let disposed=false,skin=portrait.skinTone,hairColor=portrait.hairTone,outfit='uniform',hairStyle='bob',baseColor=color(options.color,0x303036),profile={},blink=1,lastPhase=0,smileNode=null;
  const group=(p,x=0,y=0,z=0)=>{const n=new T.Group();n.position.set(x,y,z);p.add(n);return n;};
  const mat=(c,rough=.72)=>{const k=c+':'+rough;if(!materials.has(k)){const m=new T.MeshStandardMaterial({color:c,roughness:rough,metalness:0});materials.set(k,m);ownedM.add(m);}return materials.get(k);};
  const mesh=(p,geo,c,x=0,y=0,z=0,rough=.72)=>{const m=new T.Mesh(geo,c?.isMaterial?c:mat(c,rough));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;p.add(m);return m;};
  const ell=(p,c,x,y,z,sx,sy,sz,small=false,rough=.84)=>{if(p===body){[x,y,z]=bodyPoint([x,y,z]);sx*=1.10;sy*=.78;sz*=1.10;}const m=mesh(p,small?smallSphere():unitSphere(),c,x,y,z,rough);m.scale.set(sx,sy,sz);return m;};
  const curve=(p,points,r,c,segments=10,radial=5,rough=.84)=>{if(p===body)points=points.map(bodyPoint);const q=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),geo=new T.TubeGeometry(q,segments,r,radial,false);ownedG.add(geo);return mesh(p,geo,c,0,0,0,rough);};
  function clear(p){if(p===hair){for(const child of [...hair.children])if(child.userData?.portraitHair)root.CozyRefinedPortraitHair.release(child);}if(p===hair)for(const child of [...p.children])if(child.userData.blenderHair)root.CozyHairGLB?.release(child);p.traverse(n=>{if(!n.isMesh)return;if(ownedG.has(n.geometry)){n.geometry.dispose();ownedG.delete(n.geometry);}for(const m of(Array.isArray(n.material)?n.material:[n.material]))if(ownedM.has(m)&&!materials.has([...materials].find(([,v])=>v===m)?.[0])){m.dispose();ownedM.delete(m);}});p.clear();}
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
  // Q2 uses authored shorter surfaces and new pivots, not a scaled finished avatar.
  const bodyProportions=group(g);
  const body=group(bodyProportions),head=group(g,0,1.43,0),headSkin=group(head),face=group(head),hair=group(head),eyes=[],upperLids=[];
  const skirt=group(g,0,.69,0);let dressActive=false,blackSkirtActive=false,skirtGeometry=null,skirtNeutral=null,skirtSeated=null;
  const bodyPoint=v=>[v[0]*1.10,v[1]*.68-.025,v[2]*1.10];
  function artMat(kind,tone=skin){const key='head-art:'+kind+':'+tone;if(!materials.has(key)){const material=root.CozyHeadArtIntegrated.material(kind,tone);material.roughness=kind==='skin'?.84:.86;material.metalness=0;materials.set(key,material);ownedM.add(material);}return materials.get(key);}
  function skinEll(c,x,y,z,sx,sy,sz,small=false){const geo=(small?smallSphere():unitSphere()).clone(),col=new T.Color(c),values=[];for(let i=0;i<geo.attributes.position.count;i++)values.push(col.r,col.g,col.b);geo.setAttribute('color',new T.Float32BufferAttribute(values,3));ownedG.add(geo);const m=mesh(headSkin,geo,artMat('skin'),x,y,z);m.scale.set(sx,sy,sz);return m;}
  function buildHead(){clear(headSkin);clear(face);eyes.length=0;upperLids.length=0;
   const geo=new T.SphereGeometry(.47,28,20),v=geo.attributes.position,colors=[];
   const base=new T.Color(skin),warm=new T.Color(0xefa19a);
   for(let i=0;i<v.count;i++){const x=v.getX(i),y=v.getY(i),z=v.getZ(i),jaw=y<0?1-portrait.jaw*.72*Math.pow(-y/.47,1.4):1-.035*y/.47;v.setXYZ(i,x*jaw*portrait.faceWidth,y*.98,z*.88);
    const cheeks=Math.exp(-((Math.abs(x)-.26)**2/.009+(y+.10)**2/.006+(z-.34)**2/.018))*.26,tint=base.clone().lerp(warm,cheeks);colors.push(tint.r,tint.g,tint.b);
   }geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();ownedG.add(geo);
   const skinMat=artMat('skin');mesh(headSkin,geo,skinMat);
   for(const side of[-1,1]){skinEll(skin,side*.447,-.035,-.005,.075,.101,.063,true);skinEll(0xe5ac98,side*.478,-.04,.033,.024,.046,.018,true);}
   skinEll(skin,0,-.1,.416,.036*portrait.noseX,.029,.037,true);skinEll(0xe3aa94,0,-.117,.449,.023,.012,.007,true);compile(headSkin);
   const brows=group(face);for(const side of[-1,1]){const eye=group(face,side*.165,.015,.386);eye.rotation.y=side*.17;eye.userData.eyeAspect=(portrait.eyeAspect||1)*.92;eye.scale.x=.92;eyes.push(eye);
    ell(eye,0xfff7ec,0,0,0,.100,.115,.014,false,.4);
    ell(eye,0x8c5a36,0,-.002,.012,.080,.098,.012,false,.4);
    ell(eye,0x462f24,0,.014,.022,.061,.078,.006,false,.4);
    ell(eye,0x261f20,0,.013,.027,.043,.064,.004,false,.4);
    ell(eye,0xbd8c53,0,-.068,.023,.031,.007,.004,true,.4);
    ell(eye,0xfffbef,-.025,.048,.032,.019,.023,.004,true,.4);ell(eye,0xffedce,.026,-.033,.031,.008,.01,.003,true,.4);
    curve(eye,[[-.102,.037,.009],[-.08,.105,.014],[.02,.126,.01],[.1,.064,.006]],.010,0x48342c,12,5,.4);
    if(!portrait.mask){const lash=curve(eye,[[side*.075,.078,.005],[side*.113,.098,0],[side*.126,.116,-.002]],.007,0x48342c,5,4,.4);upperLids.push(lash);}compile(eye);
    curve(brows,[[side*.079,.166,.376],[side*.154,.189,.366],[side*.245,.168,.344]],.015,portrait.brow,10,5);
   }
   compile(brows);if(portrait.glasses){const specs=group(face);specs.name='portrait-glasses';for(const side of[-1,1]){const frame=group(specs,side*.165,.014,.433);frame.rotation.y=side*.14;curve(frame,[[-.119,.098,.006],[-.125,.035,.014],[-.112,-.098,.012],[0,-.121,.008],[.113,-.096,.005],[.125,.04,.004],[.117,.101,0],[0,.115,0],[-.119,.098,.006]],.0065,0x756f61,30,5,.45);curve(frame,[[-.119,.098,.009],[0,.115,.009],[.117,.101,.009]],.0075,0x383737,12,5,.5);}curve(specs,[[-.044,.025,.46],[0,.041,.471],[.044,.025,.46]],.0055,0x817b6c,8,5,.5);for(const side of[-1,1])curve(specs,[[side*.28,.07,.44],[side*.36,.062,.32],[side*.438,.04,.03]],.005,0x655e55,12,5,.5);compile(specs);}if(portrait.earrings){const rings=group(face);for(const side of[-1,1]){const hoop=new T.TorusGeometry(.074,.007,6,28);ownedG.add(hoop);const m=mesh(rings,hoop,0xbeb8a6,side*.477,-.115,.047);m.name='photo-circle-earring';}compile(rings);}
   const smile=group(face);smileNode=smile;smile.name='smile';curve(smile,[[-.075,-.179+portrait.mouthCorner,.407],[-.032,-.196,.419],[.025,-.197,.42],[.076,-.178+portrait.mouthCorner,.405]],.0085,0x9f6256,14,5);ell(smile,0xd49786,0,-.217,.403,.048,.009,.01,true);smile.scale.x=portrait.mouthWidth;
   if(portrait.openSmile){ell(smile,0x91574b,0,-.184,.423,.077,portrait.mouthOpen||.030,.006,true);ell(smile,0xfff7e7,0,-.170,.431,.066,.012,.004,true);}
   compile(smile);
   if(portrait.mask){const mask=group(face);mask.name='photo-chin-mask';const positions=[],indices=[];for(let j=0;j<=4;j++)for(let i=0;i<=24;i++){const u=i/12-1,v=j/4;positions.push(u*.345,-.275-v*(.17*(1-.3*u*u))+.065*u*u,.432-.155*u*u-v*.065);if(i<24&&j<4){const a=j*25+i,b=a+25;indices.push(a,b,a+1,b,b+1,a+1);}}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();ownedG.add(geo);const cloth=mat(0x252527,.94);cloth.side=T.DoubleSide;mesh(mask,geo,cloth);for(const y of[-.315,-.355,-.395])curve(mask,[[-.29,y+.035,.318],[0,y,.441-(y+.315)*.3],[.29,y+.035,.318]],.003,0x3a3837,12,4);for(const side of[-1,1])curve(mask,[[side*.43,.012,.075],[side*.41,-.16,.27],[side*.34,-.235,.30]],.006,0x343333,8,4);compile(mask);}
  }
  function buildHair(style='portrait',tone=portrait.hairTone){clear(hair);hairStyle=String(style||'portrait').replace(/^hair-/,'');hairColor=color(tone,portrait.hairTone);const custom=['portrait','default',''].includes(hairStyle),imported=custom&&root.CozyRefinedPortraitHair.ready(portrait.key)?root.CozyRefinedPortraitHair.create(portrait.key,hairColor):hairStyle==='bob'&&root.CozyHairGLB?.ready()?root.CozyHairGLB.create(hairColor):null;if(imported){imported.scale.multiply(new T.Vector3(1.025,1,1.025));hair.add(imported);hair.userData.source=custom?'portrait-glb':'blender-glb';}else{root.CozyHeadArtIntegrated.hair(hair,custom?(portrait.key==='p1'?'default':portrait.key==='p3'?'pony':'bob'):hairStyle,artMat('hair',hairColor),ownedG);compile(hair);hair.userData.source='procedural-fallback';}}
  const staffOutfit=()=>portrait.uniform==='banded'&&outfit==='uniform'||['dress','black-skirt'].includes(portrait.uniform)&&outfit==='staff-uniform';
  const theme=()=>outfit==='uniform'&&portrait.uniform==='sleeveless'?{top:0x272629,trim:0x333034,pants:0xcdbd9d,accent:0xa39881}:['uniform','staff-uniform'].includes(outfit)?(portrait.uniform==='olive'?{...THEMES.forest,top:0x555847,trim:0xe0c6b1,pants:0x30302e,accent:0xa9674a}:{...THEMES.uniform,top:0xf6f2e9,trim:0xe8e2d8,pants:0x303238,accent:0xe97525}):(THEMES[outfit]||{...THEMES.uniform,top:baseColor});
  // All body surfaces use the same matte vertex-color material. Clothing and
  // hands can meet continuously without separate cylindrical joint pieces.
  function bodyMaterial(){const key='body-sculpt-vertex';if(!materials.has(key)){const m=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.88});materials.set(key,m);ownedM.add(m);}return materials.get(key);}
  function loft(parent,rings,{segments=24,shape=2,thumbSide=0,capEnds=true,inside=false,floral=false,textile=false}={}){
   if(parent===body)rings=rings.map(r=>({...r,y:r.y*.68-.025,rx:r.rx*1.10,rz:r.rz*1.10,x:(r.x||0)*1.10,z:(r.z||0)*1.10,slope:(r.slope||0)*.68,drape:(r.drape||0)*.68}));
   else if(legs.includes(parent))rings=rings.map(r=>({...r,y:r.y*.70,rx:r.rx*1.12,rz:r.rz*1.10}));
   else if(arms.includes(parent))rings=rings.map(r=>({...r,y:r.y*.77,rx:r.rx*1.13,rz:r.rz*1.11,hand:(r.hand||0)*1.1}));
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
   if(floral||textile){const uv=[];for(let i=0;i<rings.length;i++)for(let j=0;j<=segments;j++)uv.push(j/segments,i/(rings.length-1));while(uv.length<geo.attributes.position.count*2)uv.push(.5,.5);geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));}ownedG.add(geo);return mesh(parent,geo,floral?floralMaterial():textile?blackTextileMaterial():bodyMaterial());
  }
  function bodyCurve(parent,points,r,c,segments=10){const path=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),geo=new T.TubeGeometry(path,segments,r,5,false),color=new T.Color(c),values=[];for(let i=0;i<geo.attributes.position.count;i++)values.push(color.r,color.g,color.b);geo.setAttribute('color',new T.Float32BufferAttribute(values,3));ownedG.add(geo);return mesh(parent,geo,bodyMaterial());}
  function floralMaterial(){const key='dress-floral';if(!materials.has(key)){const size=128,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=x/size*4,v=y/size*4,ix=Math.floor(u),iy=Math.floor(v),dx=(u-ix-.5),dy=(v-iy-.5),angle=Math.atan2(dy,dx),r=Math.hypot(dx,dy),petal=.085+.035*Math.cos(angle*5),flower=r<petal,leaf=Math.abs(dx-.16)<.025&&Math.abs(dy+.12)<.08;const c=flower?[177,184,160]:leaf?[191,199,174]:[242,240,227],i=(y*size+x)*4;data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=255;}const texture=new T.DataTexture(data,size,size,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.needsUpdate=true;const m=new T.MeshStandardMaterial({map:texture,color:0xffffff,roughness:.92});m.userData.ownedTexture=texture;materials.set(key,m);ownedM.add(m);}return materials.get(key);}
  function blackTextileMaterial(){const key='black-jacquard';if(!materials.has(key)){const size=128,data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=x/size*6,v=y/size*5,swirl=Math.sin(u*5+Math.sin(v*3)*1.5)+Math.cos(v*6-u*2),line=Math.abs(swirl)<.17;const i=(y*size+x)*4,c=line?53:42;data[i]=c;data[i+1]=c-1;data[i+2]=c+2;data[i+3]=255;}const tex=new T.DataTexture(data,size,size,T.RGBAFormat);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.needsUpdate=true;const m=new T.MeshStandardMaterial({map:tex,color:0xffffff,roughness:.94});m.userData.ownedTexture=tex;materials.set(key,m);ownedM.add(m);}return materials.get(key);}
  function buildLeg(leg,t){clear(leg);const side=Math.sign(leg.position.x);
   // Relaxed cloth keeps the V3 leg endpoints and pivots. A fuller knee and
   // soft lower-leg drape lead to a small rolled hem, instead of hugging calf.
   loft(leg,[
    {y:.045,rx:.104,rz:.117,z:-.006,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:.005,rx:.124,rz:.130,z:-.007,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.075,rx:.132,rz:.137,z:-.003,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.17,rx:.134,rz:.139,x:side*.005,z:.010,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.265,rx:.130,rz:.136,x:side*.010,z:.021,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.34,rx:.127,rz:.130,x:side*.014,z:.020,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.43,rx:.121,rz:.121,x:side*.014,z:.008,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.505,rx:.114,rz:.112,x:side*.011,z:-.002,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.565,rx:.111,rz:.108,x:side*.009,z:-.007,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.583,rx:.115,rz:.111,x:side*.008,z:-.008,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.600,rx:.113,rz:.109,x:side*.008,z:-.008,c:dressActive||blackSkirtActive?skin:t.pants},
    {y:-.608,rx:.108,rz:.104,x:side*.008,z:-.008,c:dressActive||blackSkirtActive?skin:t.pants}
   ].map(r=>({...r,y:r.y*(.505/.653)+.045*(1-.505/.653),rx:r.rx*(dressActive||blackSkirtActive?.75:1.05),rz:r.rz*(dressActive||blackSkirtActive?.74:1.03)})),{segments:22});
   // One last-shaped shoe: heel, ankle, instep and toe blend into one shell.
   const shoe=group(leg,0,.315,0);shoe.scale.setScalar(.97);
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
  for(const side of[-1,1])legs.push(group(g,side*.159,.50,0));
  function buildBody(t){clear(body);clear(skirt);skirtGeometry=null;skirtNeutral=null;skirtSeated=null;clothing.length=0;dressActive=portrait.uniform==='dress'&&outfit==='uniform';if(dressActive){t={...t,top:0xf1efe3,trim:0xe5dfcb,pants:skin,accent:0xc7baa2};}
   blackSkirtActive=portrait.uniform==='black-skirt'&&outfit==='uniform';if(blackSkirtActive)t={...t,top:0x252428,trim:0x29272a,pants:skin,accent:0xbda184};skirt.visible=dressActive||blackSkirtActive;skirt.name=dressActive?'q2-floral-skirt':'q2-camel-skirt';
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
   ].filter(r=>(!dressActive||r.y<=1.305)&&(!blackSkirtActive||r.y>=1.055)).map(r=>staffOutfit()?{...r,c:r.y>1.26?0x292a2b:r.c}:r),{segments:28,floral:dressActive,textile:blackSkirtActive});clothing.push(coat);
   if(dressActive){loft(body,[{y:1.285,rx:.266,rz:.175,c:skin},{y:1.35,rx:.27,rz:.161,c:skin},{y:1.405,rx:.215,rz:.130,c:skin},{y:1.46,rx:.112,rz:.088,c:skin}],{segments:26});for(const side of[-1,1]){curve(body,[[side*.20,1.25,.18],[side*.237,1.405,.10],[side*.21,1.43,-.005],[side*.18,1.25,-.18]],.021,0xf2eddb,16,6);curve(body,[[side*.235,1.39,.08],[side*.295,1.445,.08],[side*.303,1.40,.09],[side*.237,1.39,.08],[side*.19,1.44,.10],[side*.183,1.39,.11]],.012,0xf1ead8,18,5);}const skirtSurface=loft(skirt,[{y:.045,rx:.25,rz:.19,c:t.top},{y:0,rx:.28,rz:.21,c:t.top},{y:-.10,rx:.33,rz:.24,c:t.top},{y:-.26,rx:.375,rz:.27,c:t.top},{y:-.36,rx:.39,rz:.278,c:t.top},{y:-.375,rx:.384,rz:.274,c:t.top}],{segments:40,floral:true});skirtGeometry=skirtSurface.geometry;skirtNeutral=new Float32Array(skirtGeometry.attributes.position.array);}
   if(blackSkirtActive){const cloth=loft(skirt,[{y:.042,rx:.327,rz:.252,c:0xb69a7a},{y:.018,rx:.331,rz:.254,c:0xc2a284},{y:-.04,rx:.344,rz:.262,c:0xc6a78b},{y:-.13,rx:.352,rz:.268,c:0xc6a78b},{y:-.25,rx:.362,rz:.274,c:0xbe9f82},{y:-.31,rx:.365,rz:.275,c:0xbe9f82},{y:-.32,rx:.360,rz:.270,c:0xb99a7e}],{segments:40});skirtGeometry=cloth.geometry;skirtNeutral=new Float32Array(skirtGeometry.attributes.position.array);}
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
   ].map(r=>({...r,c:staffOutfit()?0x292a2b:r.c})),{segments:24,capEnds:false});collar.name='artlab-collar-outer';collar.visible=!dressActive;
   const collarInside=loft(body,[
    {y:1.495,rx:.103,rz:.085,z:.002,c:t.top,drape:-.008},
    {y:1.490,rx:.097,rz:.080,z:.002,c:t.top,drape:-.008},
    {y:1.477,rx:.094,rz:.080,z:.002,c:t.top,drape:-.006},
    {y:1.445,rx:.093,rz:.085,z:.002,c:t.top,drape:-.004}
   ].map(r=>({...r,c:staffOutfit()?0x292a2b:r.c})),{segments:24,capEnds:false,inside:true});collarInside.name='artlab-collar-inner';collarInside.visible=!dressActive;
   // The references use crew-neck shirts and a plain sleeveless top, not jacket lapels.

   // Keep the same outfit/accessories as V1; only re-seat them on the new shell.
   if(portrait.bag===true){curve(body,[[-.20,1.39,.14],[-.11,1.23,.238],[.03,1.04,.268],[.26,.96,.181]],.022,0x807a6f,14,5);
   const bag=ell(body,0x77756d,.258,1.014,.112,.137,.145,.102);bag.rotation.z=-.12;ell(body,0x8e8b80,.261,1.038,.201,.111,.066,.018,true);
   }if(portrait.badge&&outfit==='uniform'){ell(body,0x6d6c65,-.17,1.27,.175,.047,.026,.014,true);ell(body,0xf2ede5,-.165,1.272,.189,.035,.017,.006,true);ell(body,0xe78230,-.196,1.273,.193,.010,.011,.006,true);}if(portrait.necklace&&outfit==='uniform')curve(body,[[-.13,1.435,.105],[-.09,1.36,.18],[0,1.338,.192],[.09,1.36,.18],[.13,1.435,.105]],.004,0xb6a16c,18,5);for(const side of[-1,1])ell(body,t.accent,side*.270,1.04,.004,.019,.020,.041,true);
   if(outfit==='forest'||outfit==='ocean'){ell(body,t.pants,0,1.18,-.234,.216,.24,.084);curve(body,[[-.17,1.39,-.077],[-.18,1.14,.18],[-.16,.98,.16]],.022,t.trim,9,5);}
   if(dressActive){clear(collar);clear(collarInside);collar.removeFromParent();collarInside.removeFromParent();}
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
    ].map(r=>({...r,c:staffOutfit()&&r.y>-.369?(r.y>-.100?0x292a2b:r.y<=-.195&&r.y>=-.265?0xe97525:0xf6f2e9):(['sleeveless','dress'].includes(portrait.uniform)&&outfit==='uniform'&&r.y<-.015?skin:r.c),y:r.y>=-.369?r.y*.90:r.y+.0369,rx:r.rx*1.015,rz:r.rz*1.015})),{segments:22,thumbSide:side});compile(arm);
   }
  }
  for(const side of[-1,1])arms.push(group(g,side*.326,.81,0));
  buildHead();buildHair('portrait',portrait.hairTone);buildBody(theme());
  root.CozyRefinedPortraitHair.load(portrait.key).then(()=>{if(!disposed&&['portrait','default',''].includes(hairStyle)&&hair.userData.source!=='portrait-glb')buildHair(hairStyle,hairColor);}).catch(()=>{});
  function setAppearance(next={}){if(disposed)return;const nextSkin=next.skin==='orange'||!next.skin?portrait.skinTone:PALETTE[next.skin]||skin,nextOutfit=String(next.outfit||'uniform').replace(/^outfit-/,''),nextHair=String(next.hair||'portrait').replace(/^hair-/,''),nextTone=color(next.hairColor,({pony:0x6a4f3e,braids:0x6e4643,silver:0xb2b6bf})[nextHair]||portrait.hairTone);profile={...next};g.userData.avatarPreset=next.avatarPreset||'';
   if(nextSkin!==skin){skin=nextSkin;buildHead();buildBody(theme());}
   if(nextOutfit!==outfit){outfit=nextOutfit;buildBody(theme());}
   if(nextHair!==hairStyle||nextTone!==hairColor)buildHair(nextHair,nextTone);
  }
  function dispose(){if(disposed)return;disposed=true;clear(hair);for(const geo of ownedG)geo.dispose();for(const m of ownedM){m.userData.ownedTexture?.dispose();m.dispose();}ownedG.clear();ownedM.clear();materials.clear();g.clear();g.removeFromParent();}
  return {group:g,head,arms,legs,clothing,modelType:'character',setAppearance,setColor(c){if(disposed)return;const next=color(c,baseColor);if(next!==baseColor){baseColor=next;if(outfit==='uniform')buildBody(theme());}},setHairStyle(style,tone){if(!disposed)buildHair(style,color(tone,hairColor));},dispose,
   animate(phase,moving,sit=false,wave=false){if(disposed)return;lastPhase=Number(phase)||0;const t=lastPhase*.25,cycle=((t+1.3)%4.4),close=cycle<.13?Math.sin(cycle/.13*Math.PI):0;blink=1-close*.96;for(const eye of eyes)eye.scale.y=blink*eye.userData.eyeAspect;if(smileNode)smileNode.scale.y=1+Math.sin(t*.7)*.045;
    g.position.y=sit?.46:moving?Math.abs(Math.sin(phase))*.026:Math.sin(t*1.6)*.008;body.scale.y=1+Math.sin(t*1.6)*.003;if(skirtGeometry&&skirtSeated!==sit){const a=skirtGeometry.attributes.position;for(let i=0;i<a.count;i++){const x=skirtNeutral[i*3],y=skirtNeutral[i*3+1],z=skirtNeutral[i*3+2],w=Math.max(0,Math.min(1,(.045-y)/.34));a.setXYZ(i,x,sit?Math.max(-.165,y*.55):y,sit?z+w*.13*(.5+.5*z/.278):z);}a.needsUpdate=true;skirtGeometry.computeVertexNormals();skirtGeometry.computeBoundingBox();skirtGeometry.computeBoundingSphere();skirtSeated=sit;}skirt.rotation.x=!sit&&moving?Math.sin(phase)*.035:0;skirt.position.z=0;head.rotation.z=moving?Math.sin(phase*.5)*.018:Math.sin(t*.65)*.009;head.rotation.y=Math.sin(t*.47)*.018;
    legs.forEach((l,i)=>{l.rotation.x=sit?-1.16:moving?Math.sin(phase+i*Math.PI)*.43:0;l.rotation.z=sit?(i?-.04:.04):0;});arms.forEach((a,i)=>{a.rotation.x=sit?-.28:moving?-Math.sin(phase+i*Math.PI)*.33:Math.sin(t*.8+i)*.014;a.rotation.z=wave&&i===1?-2.1+Math.sin(phase*1.5)*.23:(i?-.065:.065);});
   },state(){return {version:'photo-four-q2.1',portraitKey:portrait.key,hair:hairStyle,hairSource:hair.userData.source,outfit,blink,phase:lastPhase,disposed,profile:{...profile},ownedGeometries:ownedG.size,ownedMaterials:ownedM.size,sharedGeometries:shared.size};}
  };
 }
 root.CozyRefinedAvatarPortraits=Object.freeze({create,themes:Object.keys(THEMES),sharedStats:()=>({geometries:shared.size}),isSharedResource:r=>[...shared.values()].includes(r)});
})(typeof window==='undefined'?globalThis:window);
