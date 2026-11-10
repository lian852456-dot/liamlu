/* Reusable native 3D mixed-use Taipei street houses. */
(function(){'use strict';
 const T=THREE,M=window.CozyModels,cache=new Map(),wallGeometry=new Map();
 function isSharedResource(resource){for(const value of cache.values())if(value===resource)return true;for(const value of wallGeometry.values())if(value===resource)return true;return false}
 function hashValue(value){let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
 function mat(color,kind='solid'){const key=color+':'+kind;if(!cache.has(key)){const options={color,roughness:.8};if(kind==='glass')Object.assign(options,{roughness:.16,metalness:.05,transparent:true,opacity:.2,depthWrite:false});if(kind==='warm')Object.assign(options,{roughness:.78,emissive:color,emissiveIntensity:.7});if(kind==='daylit-room')Object.assign(options,{roughness:.65,emissive:color,emissiveIntensity:1.38});if(kind==='lamp')Object.assign(options,{roughness:.42,emissive:color,emissiveIntensity:1.22});cache.set(key,new T.MeshStandardMaterial(options))}return cache.get(key)}
 function wall(color,kind='plaster'){return window.CozyArchitecture?.wall(color,kind)||mat(color)}
 function box(...args){return M.box(...args)}
 function plant(parent,x,y,z,scale=.5,flower=false){const g=M.plant(parent,x,z,scale,flower);g.position.y=y;return g}
 function panel(parent,w,h,holes,material,x,y,z,rotation=0){const key=JSON.stringify([w,h,holes]);let geometry=wallGeometry.get(key);if(!geometry){const shape=new T.Shape();shape.moveTo(-w/2,-h/2);shape.lineTo(w/2,-h/2);shape.lineTo(w/2,h/2);shape.lineTo(-w/2,h/2);shape.closePath();for(const hole of holes){const path=new T.Path(),a=hole.x-hole.w/2,b=hole.y-hole.h/2;path.moveTo(a,b);path.lineTo(a,b+hole.h);path.lineTo(a+hole.w,b+hole.h);path.lineTo(a+hole.w,b);path.closePath();shape.holes.push(path)}geometry=new T.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:false,steps:1,curveSegments:1});geometry.translate(0,0,-.08);const positions=geometry.attributes.position,uv=geometry.attributes.uv;for(let i=0;i<positions.count;i++)uv.setXY(i,positions.getX(i)/w+.5,positions.getY(i)/h+.5);wallGeometry.set(key,geometry)}if(material.userData?.archColor!=null&&window.CozyArchitecture?.panel)material=window.CozyArchitecture.panel(material.userData.archColor,material.userData.archKind,w,h,holes);const mesh=M.mesh(geometry,material,parent,x,y,z);mesh.rotation.y=rotation;return mesh}
 function signFor(kind,seed){const families=[{label:'小城麵包',sub:'BAKERY & DAILY',accent:0xe58a3c,goods:0},{label:'良食堂',sub:'WARM FOOD',accent:0xbc7b3d,goods:1},{label:'日常花屋',sub:'FLOWERS & LIFE',accent:0xd17a66,goods:2},{label:'巷口茶屋',sub:'TEA & SLOW LIFE',accent:0x408b76,goods:3}],key=String(kind||'');return families[/flower|花/.test(key)?2:/food|食|餐/.test(key)?1:/tea|茶/.test(key)?3:/bakery|bread|麵包/.test(key)?0:hashValue(seed)%4]}
 function verticalSign(parent,x,y,z,style,variant){
  const goods=style.goods,labels=['麵包','食堂','花屋','茶屋'],textColor=variant===1?'#5b5547':'#fff1d8';
  const boardColor=variant===0?style.accent:(variant===1?0xf1dfbd:0x4e7d6b),edgeColor=variant===1?style.accent:0xf3c38d;
  box(parent,.34,1.48,.14,boardColor,x,y,z,.045);box(parent,.4,.08,.17,edgeColor,x,y+.76,z,.03);box(parent,.4,.08,.17,edgeColor,x,y-.76,z,.03);
  for(const [i,ch]of[...labels[goods]].entries())M.text(parent,ch,x,y+(.5-i)*.4,z+.09,2.1,textColor);
  if(variant===0){for(const py of[y-.38,y-.05,y+.28])box(parent,.06,.16,.19,edgeColor,x-.13,py,z+.025,.018)}
  else if(variant===1){for(const py of[y-.45,y+.45])box(parent,.2,.035,.19,style.accent,x,py,z+.025,.012);}
  else {M.sphere(parent,.055,0xf4bb73,x,y-.35,z+.1,1,.65,.42);M.sphere(parent,.055,0xf4bb73,x,y+.35,z+.1,1,.65,.42);}
 }
 function signMotif(parent,goods,x,y,z){
  if(goods===0){M.sphere(parent,.13,0xe2aa60,x,y,z+.1,1.35,.75,.45);for(const dx of[-.07,.07])M.sphere(parent,.022,0xf5d69d,x+dx,y+.055,z+.16,1,1,.6)}
  else if(goods===1){M.cyl(parent,.16,.13,.06,0xd19b6c,x,y-.035,z+.11,12);M.sphere(parent,.105,0xe8b36f,x,y+.045,z+.11,1,.48,.55);box(parent,.24,.025,.035,0xf2dfbb,x,y+.105,z+.12,.01)}
  else if(goods===2){M.sphere(parent,.055,0xf1bf8f,x,y,z+.12,1,1,.65);for(let i=0;i<4;i++){const a=i*Math.PI/2;M.sphere(parent,.07,0xe8a1a0,x+Math.cos(a)*.1,y+Math.sin(a)*.1,z+.12,.9,1,.55)} }
  else {M.cyl(parent,.1,.12,.14,0xd8b878,x,y-.01,z+.11,12);M.cyl(parent,.16,.16,.025,0xf1dfbc,x,y-.095,z+.11,12);box(parent,.035,.08,.035,0xd8b878,x+.13,y+.015,z+.11,.012)}
 }
 function build(parent,options={}){
  const w=Math.max(2.8,Number(options.w)||4.6),d=Math.max(2.8,Number(options.d)||5.2),rawRequestedHeight=Math.max(3.25,Number(options.height)||7.4),store=!!options.store,branded=store&&options.brand==='taiwan-mobile';
  const seed=options.seed??options.label??options.kind??'street',hash=hashValue(seed),style=signFor(options.kind,seed),label=String(options.label||style.label),g=M.group(parent);
  const edgeProfile=String(seed).startsWith('edge-'),coreFloorMix=!store&&!edgeProfile&&rawRequestedHeight>=5.4,profile=hash%8;
  // Keep the source height for traceability, while giving core blocks a
  // stable low/mid/tall rhythm. Two eighths are compact one-storey houses,
  // three eighths are two storeys, and the remaining three are three storeys.
  const accentFloors=!store&&!edgeProfile?Math.min(5,Math.max(0,Math.floor(Number(options.accentFloors)||0))):0;
  const floors=accentFloors|| (coreFloorMix?(profile<2?1:(profile<5?2:3)):(rawRequestedHeight>6.6?3:rawRequestedHeight>4.3?2:1));
  const compactTallStreet=!store&&!edgeProfile&&floors===3&&rawRequestedHeight>6.6;
  const baseHeight=accentFloors?3.35+(accentFloors-1)*Math.max(2.15,Math.min(3,Number(options.upperFloorHeight)||2.15)):coreFloorMix?(floors===1?3.35:floors===2?Number(Math.max(4.9,Math.min(5.7,rawRequestedHeight*.9)).toFixed(3)):Number(Math.max(6.2,rawRequestedHeight*.84).toFixed(3))):(store&&rawRequestedHeight<=4.3?3.9:rawRequestedHeight),height=baseHeight+(branded?.6:0);
  const side=options.facadeSide;g.rotation.y=typeof side==='number'?(side<0?Math.PI:0):side==='back'?Math.PI:side==='left'?-Math.PI/2:side==='right'?Math.PI/2:0;
  const cornerRetail=coreFloorMix&&(profile===2||profile===6);
  const shopLike=/(bakery|bread|food|flower|tea|shop|cafe|麵包|食堂|花|茶|店)/i.test(`${options.kind||''} ${label}`),nearShopDetail=!store&&!edgeProfile&&shopLike&&(profile===1||profile===5);
  g.userData={modelType:store?'shop':'street-building',artToy:true,footprint:{width:w,depth:d},baseFootprint:{width:w,depth:d},w,d,height,rawRequestedHeight,compactTallStreet,edgeProfile,profile,floors,accentFloors,cornerRetail,nearShopDetail,branded,brandSign:branded,label,seed,kind:options.kind||'bakery'};
  const facadeStyle=options.surface==='tile'||store?0:hash%3;const groundH=branded?4.45:(store?3.85:3.35),upperH=(height-groundH)/Math.max(1,floors-1),front=d/2,back=-d/2;
  // Warm cream, peach, terracotta and clear blue-green alternate across the
  // block so the native buildings keep the reference's lively Taipei palette.
  const facadeColors=[0xf1dfc3,0xd49170,0xd9c3a4,0x83b2a4,0xe7be76,0xbf7e65,0xb0cec0,0xf3d7b4],facade=options.facadeColor??(store?0xf1dfc3:facadeColors[hash%facadeColors.length]),sideColor=facade,accent=store?0xf08724:style.accent,frame=branded?0x66727b:(store?0x4d806d:0xb79e7b),trim=0xffefda,green=0x4e7d6b,glass=mat(0x8fb8b1,'glass'),room=mat(store?0xe5b273:0xf1ba6d,store?'warm':'daylit-room'),lamp=mat(0xffd99a,'lamp');
  // A few stable profiles pull upper floors inward, creating stepped Taipei
  // rooflines while keeping the ground footprint and entry plane unchanged.
  const setbackProfile=coreFloorMix&&floors>1?[0,.24,.42,.14,.3,.48,.18,.34][profile]:0;
  function levelMetrics(floor){
   if(floor===0)return {w,d,front,back,inset:0};
   const maxInset=Math.max(0,Math.min((w-2.8)/2-.06,(d-2.8)/2-.06));
   const inset=Math.min(setbackProfile*(floor===floors-1?1:floor>1?.48:.2),maxInset);
   return {w:w-inset*2,d:d-inset*1.55,front:front-inset,back:back+inset*.55,inset};
  }
  box(g,w,.18,d,wall(0xd4c3a7),0,.09,0,.04);box(g,w-.25,.08,d-.25,0xb49c77,0,.22,0,.02);
  // A real shell with a recessed, back-facing facade. The back used to be a
  // solid wall, which made the reverse side read as an unfinished slab in the
  // overview camera. Keep the same footprint while cutting only a few native
  // window holes (ground floor sparse, upper floors 2–3 windows).
  const backWindows=[];
  for(let floor=0;floor<floors;floor++){
   const level=levelMetrics(floor),base=floor===0?0:groundH+(floor-1)*upperH,fh=floor===0?groundH:upperH,wh=Math.min(1.2,fh*.5),wy=base+fh*.55;
   const count=floor===0?1:Math.min(3,level.w>5.2?3:2),ww=Math.min(1.25,(level.w-.7)/count-.16),step=(level.w-.7)/count;
   for(let i=0;i<count;i++)backWindows.push({floor,x:(i-(count-1)/2)*step,w:ww,h:wh,wy,base,fh,back:level.back});
   panel(g,level.w,fh,backWindows.filter(hole=>hole.floor===floor).map(({x,w:ww,h,wy:windowY,base:panelBase,fh:panelHeight})=>({x,y:windowY-(panelBase+panelHeight/2),w:ww,h})),wall(sideColor),0,base+fh/2,level.back);
  }
  for(const [index,hole]of backWindows.entries()){
   const win=M.group(g,hole.x,hole.wy,hole.back-.08);win.rotation.y=Math.PI;
   windowPane(win,hole.w,hole.h,hole.floor,true,hole.floor>0&&((hash+hole.floor+index)%4===0));
  }
  for(const s of[-1,1]){
   const sideWindows=[];
   for(let floor=0;floor<floors;floor++){
    const level=levelMetrics(floor),base=floor===0?0:groundH+(floor-1)*upperH,fh=floor===0?groundH:upperH,wy=base+fh*.55,retailSide=cornerRetail&&floor===0;
    const count=retailSide?1:2,ww=retailSide?Math.min(1.6,level.d*.44):Math.min(1.2,level.d*.22),step=(level.d-.7)/count;
    for(let i=0;i<count;i++)sideWindows.push({floor,u:retailSide?0:(i===0?-level.d*.23:level.d*.19),x:retailSide?0:(i-(count-1)/2)*step,wy,w:ww,h:retailSide?Math.min(1.55,fh*.66):Math.min(1.2,fh*.5),retailSide,level,base,fh});
    panel(g,level.d,fh,sideWindows.filter(hole=>hole.floor===floor).map(({x,wy:windowY,w:ww,h,base:panelBase,fh:panelHeight})=>({x,y:windowY-(panelBase+panelHeight/2),w:ww,h})),wall(sideColor),s*level.w/2,base+fh/2,(level.front+level.back)/2,s*Math.PI/2);
   }
   for(const [index,hole]of sideWindows.entries()){
    const windowGroup=M.group(g,s*hole.level.w/2,hole.wy,-s*hole.u);windowGroup.rotation.y=s*Math.PI/2;
    windowPane(windowGroup,hole.w,hole.h,hole.floor,true,hole.floor>0&&((hash+hole.floor+index)%4===0));
    if(hole.retailSide)sideRetailProducts(windowGroup,hole.w,hole.h,style.goods);
   }
  }
  function windowPane(parent,ww,hh,floor=0,sideWindow=false,warmUpper=false){
   // Inset room, sill, jambs, timber mullion and glass live at distinct depths.
   const depth=floor===0?1.0:.34,paneRoom=floor===0||warmUpper?room:mat(hash%2?0x776e59:0x5c736b);box(parent,ww+.05,hh+.05,.09,0x59635a,0,0,-depth,.012);box(parent,ww-.1,hh-.1,.035,paneRoom,0,0,-depth+.05,.006);if(floor===0){for(const x of[-ww/2,ww/2])box(parent,.06,hh,.95,wall(0xd9c5a4),x,0,-.48,.008);for(const y of[-hh/2,hh/2])box(parent,ww,.06,.95,wall(0xd9c5a4),0,y,-.48,.008)}
   if(floor>0){for(const s of[-1,1])box(parent,ww*.19,hh-.1,.05,wall(0xe2d5bd),s*ww*.31,0,-.22,.012)}
   const glazing=box(parent,ww-.05,hh-.05,.02,floor===0?mat(0xe9e0bf,'glass'):glass,0,0,.015,.005);glazing.castShadow=false;const reflection=box(parent,ww*.07,hh*.84,.008,mat(0xe5eee4,'glass'),-ww*.23,0,.035,.001);reflection.rotation.z=-.16;reflection.castShadow=false;
   for(const dx of[-ww/2,ww/2])box(parent,.055,hh+.1,.14,frame,dx,0,.015,.012);for(const dy of[-hh/2,hh/2])box(parent,ww+.1,.055,.14,frame,0,dy,.015,.012);
   box(parent,.045,hh,.1,frame,0,0,.06,.008);if(floor>0)box(parent,ww,.045,.09,frame,0,hh*.05,.06,.008);box(parent,ww+.22,.075,.27,trim,0,-hh/2-.06,.035,.015);
   if(!sideWindow&&floor>0&&hash%3===0){const ac=box(parent,.46,.28,.3,0xc6c5b6,ww*.45,-hh*.5-.3,-.02,.025);for(let k=0;k<4;k++)box(parent,.34,.012,.025,0x858e83,ww*.45,-hh*.5-.38+k*.05,.15,.003)}
  }
  function sideRetailProducts(parent,ww,hh,goods){
   // One shallow shelf and two native goods make selected corner windows
   // readable without turning every side facade into a full shopfront.
   const shelfY=-hh*.28;box(parent,ww*.72,.09,.4,0xba895e,0,shelfY,-.38,.015);box(parent,ww*.42,.025,.08,0xf5ead2,0,shelfY+.17,-.43,.006);
   for(const [index,x]of[-ww*.22,ww*.22].entries()){
    if(goods===0){M.sphere(parent,.14,0xe2aa60,x,shelfY+.2,-.38,1.25,.7,.8);box(parent,.18,.025,.1,0xc98751,x,shelfY+.1,-.4,.008)}
    else if(goods===1){M.cyl(parent,.12,.09,.07,0xefdec1,x,shelfY+.2,-.38,12);M.sphere(parent,.08,0xd7a15c,x,shelfY+.25,-.38,1,.5,1)}
    else if(goods===2){plant(parent,x,shelfY+.06,-.4,.24,true)}
    else {M.cyl(parent,.06,.05,.16,0xd9bd86,x,shelfY+.22,-.39,10);M.cyl(parent,.07,.07,.02,0xf5e6c3,x,shelfY+.31,-.39,10)}
   }
  }
  function storefrontMerchandise(parent,ww,goods,mainStore=false){
   // Main stores get two legible paper bags/boxes and a wood header shelf;
   // ordinary shops use the same native tray vocabulary with a distinct
   // product silhouette for bread, food, flowers, and tea.
   if(mainStore){
    box(parent,ww*.58,.055,.28,0x9b6d4e,0,.94,-.47,.015);
    for(const [index,x]of[-ww*.38,ww*.38].entries()){
     const paper=index?0xf0c99f:0xe9b27d;box(parent,.22,.28,.17,paper,x,-.28,-.47,.022);box(parent,.16,.032,.035,0xffedcf,x,-.12,-.57,.008);
     for(const dx of[-.045,.045])box(parent,.022,.11,.022,0x8b6447,x+dx,-.1,-.52,.004);
    }
   }else{
    const kind=['bread','food','flower','tea'][goods]||'daily';
    const display=M.group(parent);
    display.name=`ordinary-window-display-${kind}`;
    display.userData={ordinaryPresentation:true,displayKind:kind,goods,footprintSafe:true};
    const trayW=Math.min(1.08,Math.max(.62,ww*.78));
    box(display,trayW,.07,.38,0x9b6d4e,0,-.28,-.44,.015);
    box(display,trayW*.82,.04,.08,0xc79a6e,0,-.18,-.45,.008);
    if(goods===0){
     for(const [index,x]of[-.24,0,.24].entries()){
      M.sphere(display,.13,index===1?0xe6b56b:0xd99350,x,-.05,-.43,1.2,.72,.82);
      box(display,.18,.025,.1,0xc98751,x,-.17,-.43,.008);
     }
    }else if(goods===1){
     for(const x of[-.23,.23]){
      M.cyl(display,.12,.09,.07,0xefdec1,x,-.02,-.43,12);
      M.sphere(display,.08,0xd7a15c,x,.04,-.43,1,.5,1);
      box(display,.2,.028,.09,0xf8e4bd,x,-.16,-.43,.008);
     }
    }else if(goods===2){
     for(const [index,x]of[-.25,.25].entries()){
      box(display,.22,.16,.2,index?0xd28b73:0xc8796d,x,-.05,-.43,.02);
      // Keep the ordinary flower display cheap: a native pot, short stem,
      // and a compact blossom read clearly through the window without
      // pulling in the higher-cost balcony plant assembly.
      M.cyl(display,.018,.018,.1,0x71977e,x,.07,-.43,6);
      M.sphere(display,.11,index?0xe8a1a0:0xf0b08f,x,.14,-.43,.9,1,.68);
     }
    }else{
     for(const [index,x]of[-.24,.24].entries()){
      M.cyl(display,.075,.06,.16,0xd9bd86,x,-.01,-.43,10);
      M.cyl(display,.09,.09,.025,0xf5e6c3,x,.085,-.43,10);
      box(display,.18,.025,.08,0xf1d5a8,x,-.13,-.43,.008);
      if(index===0)box(display,.035,.08,.035,0x8b6447,x+.12,.01,-.43,.012);
     }
    }
    display.userData.itemCount=goods===0?3:2;
   }
  }
  function ordinaryFrontagePlanters(parent,w,front,goods){
   const kind=['bread','food','flower','tea'][goods]||'daily';
   const group=M.group(parent);
   group.name=`ordinary-frontage-planters-${kind}`;
   group.userData={ordinaryPresentation:true,displayKind:`${kind}-planters`,footprintSafe:true,planterCount:2};
   const potColors=[0xc98751,0xa77b59,0xd27b78,0x71977e];
   for(const [index,x]of[-w*.34,w*.34].entries()){
    box(group,.3,.13,.22,potColors[goods]||0xa77b59,x,.12,front+.01,.025);
    if(goods===2){
     M.cyl(group,.018,.018,.1,0x71977e,x,.24,front+.01,6);
     M.sphere(group,.12,index?0xe8a1a0:0xf0b08f,x,.31,front+.01,.9,1,.68);
    }else plant(group,x,.2,front+.01,.36,false);
   }
   // A pair of shallow, category-specific displays fills the sidewalk edge
   // beside the door while stopping at front+.25, inside the .35m blocked
   // padding. Keeping them in this shared group preserves the draw budget.
   const low=M.group(group);low.name=`ordinary-low-display-${kind}`;
   const displayW=Math.min(.94,Math.max(.85,w*.2)),displayX=Math.max(w*.27,.49+displayW/2+.04),displayZ=front+.09;
   for(const [index,side]of[-1,1].entries()){
    const display=M.group(low);display.name=`ordinary-low-display-${kind}-${index}`;
    const x=side*displayX;
    if(goods===0){
     box(display,.88,.18,.32,0x9b6d4e,x,.22,displayZ,.02);box(display,.78,.05,.26,0xc79a6e,x,.36,displayZ-.01,.01);
     for(const dx of[-.22,.22])M.sphere(display,.12,0xe2aa60,x+dx,.53,displayZ-.02,1,.75,.7);
    }else if(goods===1){
     box(display,.9,.5,.32,0x9b6d4e,x,.26,displayZ,.02);box(display,.82,.05,.26,0xc79a6e,x,.55,displayZ-.01,.01);
     for(const dx of[-.17,.17]){M.cyl(display,.085,.07,.1,0xefdec1,x+dx,.68,displayZ-.02,10);M.sphere(display,.065,0xd7a15c,x+dx,.76,displayZ-.02,1,.65,1)}
    }else if(goods===2){
     box(display,.92,.22,.32,0xd28b73,x,.2,displayZ,.02);box(display,.84,.07,.26,0xc8796d,x,.38,displayZ-.01,.01);
     for(const dx of[-.22,.22])M.sphere(display,.13,dx<0?0xf0b08f:0xe8a1a0,x+dx,.7,displayZ-.02,.9,1,.68);
    }else{
     box(display,.9,.5,.32,0x71977e,x,.26,displayZ,.02);box(display,.82,.05,.26,0x9b6d4e,x,.55,displayZ-.01,.01);
     for(const dx of[-.16,.16]){M.cyl(display,.075,.06,.18,0xd9bd86,x+dx,.68,displayZ-.02,10);M.cyl(display,.085,.085,.025,0xf5e6c3,x+dx,.79,displayZ-.02,10)}
    }
   }
   group.userData.lowDisplayKind=kind;group.userData.lowDisplayCount=2;group.userData.lowDisplayWidth=displayW;
   return group;
  }
  const doorW=store?1.2:.98,doorH=2.3,post=.15,bayW=(w-doorW-post*4)/2,bayX=doorW/2+post+bayW/2,doorFrame=branded?0x566675:green;g.userData.windowLightAnchors=[{x:-bayX,y:1.65,z:front-.4},{x:bayX,y:1.65,z:front-.4}];
  for(const x of[-w/2+.08,-doorW/2-.08,doorW/2+.08,w/2-.08])box(g,.16,groundH,.25,wall(trim),x,groundH/2,front,.025);
  for(const x of[-bayX,bayX]){
   const win=M.group(g,x,1.35,front-.08);windowPane(win,bayW,2.2,0);M.windowSpill?.(g,x,front+.48,bayW+1);
   // Deep enough to read as a shop, with genuine shelves and distinct merchandise.
   box(win,bayW-.12,.11,.54,0xba895e,0,-.65,-.38,.018);box(win,bayW-.12,.09,.42,0xc79a6e,0,.05,-.4,.015);box(win,bayW-.12,.075,.4,0xc79a6e,0,.65,-.4,.015);
   for(let shelf=0;shelf<3;shelf++)for(let i=0;i<3;i++){const u=(i-1)*(bayW*.26),y=-.5+shelf*.6;
    if(store){const phone=M.phone?M.phone(win,u,y,-.39,[0x5f9b99,0xdb9a77,0x7e8baf][i]):box(win,.27,.46,.08,[0x5f9b99,0xdb9a77,0x7e8baf][i],u,y,-.39,.025);phone.rotation.x=-.13;box(win,.24,.065,.22,0xd7bd9a,u,y-.31,-.35,.012);box(win,.19,.035,.012,0xf5ead2,u,y-.26,-.48,.006)}
    else if(style.goods===0){M.sphere(win,.18,0xe2aa60,u,y,-.38,1.3,.72,.82);box(win,.3,.045,.2,0xf1d7a3,u,y-.13,-.37,.012);box(win,.22,.025,.11,0xc98751,u,y+.13,-.37,.01)}
    else if(style.goods===1){M.cyl(win,.16,.12,.08,0xefdec1,u,y-.06,-.38,12);M.sphere(win,.11,0xd7a15c,u,y+.04,-.38,1,.52,1);box(win,.2,.028,.09,0xf8e4bd,u,y-.16,-.38,.008)}
    else if(style.goods===2){plant(win,u,y-.24,-.4,.34,true);box(win,.18,.028,.12,0xf4dfc0,u,y-.03,-.42,.008)}
    else {M.cyl(win,.07,.055,.2,0xd9bd86,u,y,-.39,10);M.cyl(win,.08,.08,.025,0xf5e6c3,u,y+.11,-.39,10);box(win,.18,.025,.08,0xf1d5a8,u,y-.13,-.4,.008)}
   }
   if(store||nearShopDetail||(!store&&!branded&&shopLike))storefrontMerchandise(win,bayW,style.goods,store);
   for(const dx of[-bayW*.24,bayW*.24]){box(win,.025,.32,.025,0x6b6450,dx,1.02,-.6,.004);M.sphere(win,.13,lamp,dx,.85,-.6,1,.7,1);}
  }
  box(g,doorW,doorH,.06,room,0,doorH/2+.18,front-.55,.015);for(const x of[-doorW/2,doorW/2]){box(g,.08,doorH,.14,doorFrame,x,doorH/2+.18,front+.02,.015);if(store&&!branded)box(g,.1,doorH+.12,.12,0x9b6d4e,x,doorH/2+.18,front-.08,.018)}box(g,doorW,.08,.14,doorFrame,0,doorH+.18,front+.02,.015);if(store&&!branded)box(g,doorW+.1,.08,.12,0x9b6d4e,0,doorH+.19,front-.08,.018);const doorGlass=box(g,doorW-.14,doorH-.08,.025,glass,0,doorH/2+.18,front+.025,.005);doorGlass.castShadow=false;box(g,.045,.35,.08,0xa98d58,doorW*.28,1.15,front+.11,.012);
  if(branded){const tile=wall(0xa8c5ae,'tile');for(const x of[-doorW/2-.11,doorW/2+.11])box(g,.12,doorH+.24,.18,tile,x,doorH/2+.18,front+.055,.022);box(g,doorW+.3,.12,.18,tile,0,doorH+.34,front+.055,.022)}
  box(g,w,.25,.25,wall(trim),0,groundH-.1,front,.02);
  if(floors===1&&height>groundH+.05)box(g,w,height-groundH,.18,wall(facade),0,(height+groundH)/2,front,.025);
  // The canopy projects OUT over the sidewalk; its front edge slopes down.
  if(!branded){const awningY=store?2.58:2.61,awningDepth=store?1.12:1.08,awningFront=front+(store?.98:.94),awningSegments=store?1:Math.max(8,Math.round(w*2.4)),stripeWidth=(w-.12)/awningSegments;
   for(let i=0;i<awningSegments;i++){const color=store?0x9ebda0:(i%2?0xf1d6b1:accent),x=-(w-.12)/2+(i+.5)*stripeWidth,cloth=box(g,stripeWidth+.005,.065,awningDepth,color,x,awningY,front+.43,.015);cloth.rotation.x=.18;box(g,stripeWidth+.005,.15,.055,color,x,awningY-.17,awningFront,.012)}
   if(store){for(const x of[-w*.28,0,w*.28]){const seam=box(g,.018,.07,awningDepth*.92,0x7fa88a,x,awningY+.008,front+.43,.022);seam.rotation.x=.18}box(g,w-.1,.045,.06,0x6f987b,0,awningY-.17,awningFront+.025,.014)}
  }
  const signY=store?3.5:3.0,signW=w-.24;if(!branded){box(g,signW,store?1.25:.65,.2,store?0xffefd5:0xf0d8b0,0,signY,front+.04,.04);box(g,signW,store?.72:.1,.23,accent,0,signY-(store?.57:.31),front+.055,.02)}
  if(store&&!branded){const tile=wall(0xa8c5ae,'tile');box(g,signW+.14,.09,.2,tile,0,signY+.67,front+.07,.03);box(g,signW+.12,.08,.2,0xe7b15a,0,signY-.96,front+.08,.025)}
  if(store){for(const x of[-w*.36,w*.36]){box(g,.025,.39,.025,0x6a6556,x,2.4,front+.45,.004);M.cyl(g,.14,.11,.065,0x697160,x,2.18,front+.45,12);M.sphere(g,.13,lamp,x,1.99,front+.45,1,1.35,1);}for(const x of[-doorW/2-.32,doorW/2+.32])plant(g,x,.2,front+.24,.62,false);}
  if(!store&&!branded&&shopLike){
   ordinaryFrontagePlanters(g,w,front,style.goods);
   g.userData.ordinaryPresentation=true;
   g.userData.ordinaryDisplayKind=['bread','food','flower','tea'][style.goods]||'daily';
   g.userData.ordinaryDisplayStats={windowDisplays:2,doorPlanters:2,footprintSafe:true};
  }
  if(!branded){const motifX=(hash%2?-1:1)*signW*.38;signMotif(g,style.goods,motifX,signY+.02,front+.13)}
  if(branded){g.userData.labelAnchor=null;window.CozyTaiwanBrand?.apply?.(g,{w,d,storeName:options.brandStoreName||label,signY})}
  else if(store){g.userData.labelAnchor={x:signW*.07,y:signY+.07,z:front+.17,width:signW*.66};box(g,.74,.7,.08,green,-signW*.41,signY,front+.18,.05);const logoCanvas=document.createElement('canvas');logoCanvas.width=logoCanvas.height=128;const lc=logoCanvas.getContext('2d');lc.fillStyle='#fff1d8';lc.font='bold 113px Georgia,serif';lc.textAlign='center';lc.textBaseline='middle';lc.fillText('b.',67,71);const logoTexture=new T.CanvasTexture(logoCanvas);logoTexture.colorSpace=T.SRGBColorSpace;const logo=M.mesh(new T.PlaneGeometry(.64,.64),new T.MeshBasicMaterial({map:logoTexture,transparent:true,depthWrite:false}),g,-signW*.41,signY,front+.23);logo.castShadow=false;M.text(g,'台灣大哥大',0,signY-.33,front+.19,w*.3,'#fff3dd');if(floors>1&&hash%4===0)verticalSign(g,(hash%2?-1:1)*w*.44,3.86,front+.16,style,hash%3)}
  else {M.text(g,['麵包','食堂','花店','咖啡'].includes(label)?style.label:label,0,signY+.02,front+.18,w*.82,'#6a5944');if(floors>1&&hash%3!==2)verticalSign(g,(hash%2?-1:1)*w*.44,3.86,front+.16,style,hash%3)}
  for(let floor=1;floor<floors;floor++){
   const level=levelMetrics(floor),windowVariant=store?0:(hash+floor*5+profile)%3,base=groundH+(floor-1)*upperH,winH=Math.min(windowVariant===1?1.18:facadeStyle===1?1.65:1.42,upperH*.64),wy=base+upperH*.56,count=windowVariant===2?2:facadeStyle===0||level.w>6?3:2,ww=Math.min(1.55,(level.w-.65)/count-(facadeStyle===0?.12:.28)),step=(level.w-.7)/count,holes=[];
   for(let i=0;i<count;i++)holes.push({x:(i-(count-1)/2)*step,y:wy-(base+upperH/2),w:ww,h:winH});
   panel(g,level.w,upperH,holes,wall(facade,options.surface||(store||hash%3===0?'tile':'plaster')),0,base+upperH/2,level.front);
   for(const [index,hole]of holes.entries()){const win=M.group(g,hole.x,wy,level.front+.005);windowPane(win,ww,winH,floor,false,floor>0&&((hash+floor+index)%4===0))}
   if(!store&&windowVariant===1)for(const hole of holes)box(g,hole.w+.16,.075,.18,wall(0xe3bf8e),hole.x,wy+winH/2+.1,level.front+.1,.018);
   box(g,level.w+.12,.11,level.d+.06,wall(trim),0,base+.015,(level.front+level.back)/2,.025);
   if(facadeStyle===0||((hash+floor)%4!==1&&facadeStyle!==2)||store){const balconyY=wy-winH/2-.19;box(g,level.w-.55,.12,.65,wall(0xd0c0a3),0,balconyY,level.front+.22,.025);box(g,level.w-.62,.045,.055,green,0,balconyY+.55,level.front+.52,.008);for(let x=-level.w/2+.4;x<level.w/2-.3;x+=.3)box(g,.035,.5,.035,green,x,balconyY+.28,level.front+.52,.006);
    for(const [i,x]of[-level.w*.29,level.w*.29].entries()){if((hash+floor+i)%3===0){plant(g,x,balconyY+.08,level.front+.28,.5,true);continue}const bw=level.w*(.17+((hash+i+floor)%3)*.04);box(g,bw,.23,.32,0xa67b59,x,balconyY+.2,level.front+.28,.025);const bush=M.bush(g,x,level.front+.28,bw*.95,.35);bush.position.y=balconyY+.25;if((hash+floor+i)%2)plant(g,x,balconyY+.2,level.front+.28,.3,true)}
    if(!store&&(options.surface==='tile'||hash%3===0)){
     const hedgeW=level.w*.55,hedgeZ=level.front+.31;box(g,hedgeW,.2,.34,0xa67b59,0,balconyY+.18,hedgeZ,.025);
     for(const [i,part]of[-.35,0,.35].entries()){const x=part*hedgeW,bush=M.bush(g,x,hedgeZ,hedgeW*.35,.34);bush.position.y=balconyY+.35;if(i!==1||((hash+floor)%2===0))plant(g,x,balconyY+.29,hedgeZ,.25,true)}
    }
    if((hash+floor)%3===0||(store&&floor===1&&hash%2===0)){
     const acSide=(hash+floor)%2?-1:1,acX=acSide*level.w*.34,acY=balconyY+.58,acZ=level.front+.43;
     box(g,.46,.3,.24,0xd0cec1,acX,acY,acZ,.035);for(let k=0;k<4;k++)box(g,.32,.018,.035,0x7f8981,acX,acY-.09+k*.055,acZ+.14,.004);
     const drop=M.cyl(g,.026,.026,.62,0x737f78,acX+acSide*.24,acY-.25,acZ+.02,8);const elbow=M.cyl(g,.026,.026,.18,0x737f78,acX+acSide*.15,acY-.54,acZ+.02,8);elbow.rotation.z=Math.PI/2;
    }
   }
  }
  if(!store&&hash%4===0){const art=M.group(g,-w/2-.1,height*.59,-.08);art.rotation.y=-Math.PI/2;box(art,.82,1.55,.04,wall(0xe3c7a1),0,0,0,.02);M.sphere(art,.28,0xd6a16d,0,.1,.045,1,1,.16);for(const x of[-.19,.19]){const ear=M.mesh(new T.ConeGeometry(.105,.22,3),0xd6a16d,art,x,.37,.045);ear.rotation.z=x<0?.22:-.22}M.sphere(art,.2,0xf1dec1,0,.01,.08,1,.65,.12);for(const x of[-.09,.09])M.sphere(art,.023,0x4d645a,x,.14,.1,1,1,.2);M.sphere(art,.025,0x8e6b54,0,.025,.115,1,.6,.2);M.text(art,'小城日常',0,-.42,.08,.66,'#718573')}
  // Accessible-looking roof terrace: seeded pergola, rooftop tree, or restrained equipment garden.
  const topLevel=levelMetrics(Math.max(0,floors-1)),roofW=topLevel.w,roofD=topLevel.d,roofFront=topLevel.front,roofBack=topLevel.back,roofCenter=(roofFront+roofBack)/2;
  const roofFloor=height+.18,roofVariant=store?hash%3:hash%4;
  box(g,roofW+.14,.16,roofD+.12,wall(trim),0,height+.02,roofCenter,.035);box(g,roofW-.25,.035,roofD-.25,wall(0xcac3af,'tile'),0,height+.12,roofCenter,.008);
  for(const x of[-roofW/2,roofW/2])box(g,.14,.38,roofD,wall(facade),x,height+.3,roofCenter,.025);for(const z of[roofBack,roofFront])box(g,roofW,.38,.14,wall(facade),0,height+.3,z,.025);
  if(roofVariant===0&&(floors>1||store||(coreFloorMix&&floors===1))){
   const pw=roofW*.44,pd=roofD*.36,px=-roofW*.16,pz=roofCenter-roofD*.18,wood=0xa67b59;
   for(const x of[px-pw*.43,px+pw*.43])for(const z of[pz-pd*.43,pz+pd*.43])box(g,.1,1.2,.1,wood,x,roofFloor+.6,z,.02);
   for(const x of[px-pw*.38,px-pw*.13,px+pw*.13,px+pw*.38])box(g,.08,.08,pd*.86,wood,x,roofFloor+1.19,pz,.012);
   box(g,.58,.06,.42,wood,px,roofFloor+.48,pz,.02);for(const x of[px-.34,px+.34]){box(g,.08,.4,.08,wood,x,roofFloor+.25,pz,.015);box(g,.35,.06,.32,wood,x,roofFloor+.45,pz,.018);box(g,.06,.34,.05,wood,x,roofFloor+.62,pz+.1,.012)}
   for(const x of[px-pw*.28,px+pw*.28]){const flower=box(g,.46,.2,.26,0xb68d63,x,roofFloor+.28,pz+pd*.38,.025);const bush=M.bush(g,x,pz+pd*.38,.25,.46);bush.position.y=roofFloor+.4;if((hash+Math.round(x*10))%2)plant(g,x,roofFloor+.32,pz+pd*.38,.34,true)}
  }else if(roofVariant===1&&(floors>1||store||(coreFloorMix&&floors===1))){
   const tx=roofW*.08,tz=roofCenter-roofD*.16,tree=M.tree(g,tx,tz,.32+(hash%3)*.04,hash%2===0);tree.position.y=roofFloor;
   for(const x of[tx-roofW*.28,tx+roofW*.28]){box(g,.46,.2,.28,0xb68d63,x,roofFloor+.22,tz+.22,.025);const bush=M.bush(g,x,tz+.22,.25,.44);bush.position.y=roofFloor+.35;if((hash+Math.round(x*10))%2)plant(g,x,roofFloor+.3,tz+.22,.32,true)}
  }
  if(!store&&roofVariant===2&&floors>1){
   // A compact native rooftop room gives this profile a warm terracotta cap
   // instead of repeating the same flat equipment silhouette.
   const rw=Math.min(2.15,roofW*.5),rd=Math.min(1.7,roofD*.38),cx=roofW*.16,cz=roofCenter-roofD*.12;
   box(g,rw,.72,rd,wall(hash%2?0xe4c79f:0xd5b08c),cx,roofFloor+.36,cz,.035);
   const pane=box(g,rw*.52,.34,.025,glass,cx,roofFloor+.39,cz+rd/2+.02,.006);pane.castShadow=false;
   for(const x of[-1,0,1])box(g,.035,.4,.04,trim,cx+x*rw*.22,roofFloor+.39,cz+rd/2+.04,.006);
   box(g,rw+.16,.1,rd+.12,wall(0xc47f5f,'brick'),cx,roofFloor+.76,cz,.025);
  }else if(!store&&roofVariant===3&&floors>1){
   // A few low rooftop rooms and terracotta gables break the repeated flat
   // parapet silhouette without changing the building's street footprint.
   const rw=Math.min(2.1,roofW*.42),rd=Math.min(1.9,roofD*.4),cx=-roofW*.17,cz=roofCenter-roofD*.17,ry=roofFloor+.95;
   box(g,rw,.95,rd,wall(hash%2?0xb8977c:0xa4aca0),cx,roofFloor+.475,cz,.035);
   const pane=box(g,rw*.58,.48,.025,glass,cx,roofFloor+.53,cz+rd/2+.02,.006);pane.castShadow=false;for(const x of[-1,0,1])box(g,.035,.53,.04,trim,cx+x*rw*.3,roofFloor+.53,cz+rd/2+.04,.006);
   const rise=.4,half=rd*.55,angle=Math.atan2(rise,half),length=Math.hypot(rise,half),roof=wall(0xbc7d58,'brick');
   const gable=new T.Shape();gable.moveTo(-rd/2,0);gable.lineTo(rd/2,0);gable.lineTo(0,rise);gable.closePath();const attic=M.mesh(new T.ExtrudeGeometry(gable,{depth:rw,bevelEnabled:false}),wall(0xb8977c),g,cx-rw/2,ry,cz);attic.rotation.y=Math.PI/2;
   for(const side of[-1,1]){const tile=box(g,rw+.18,.08,length,roof,cx,ry+rise*.5,cz+side*half*.5,.02);tile.rotation.x=side*angle;}
   box(g,rw+.24,.075,.12,0xd3986d,cx,ry+rise,cz,.025);
  }
  const tankX=roofW*.28,tankZ=roofCenter-roofD*.26;M.cyl(g,.3,.3,.65,0xb7b7a4,tankX,roofFloor+.3,tankZ,16);M.cyl(g,.33,.33,.045,0xe0d6bb,tankX,roofFloor+.64,tankZ,16);
  if(store&&roofVariant===2){for(const [i,x]of[-roofW*.2,-roofW*.03].entries()){const z=roofCenter-roofD*.16;box(g,1.12,.58,.84,0xe6e0ce,x,roofFloor+.31,z,.045);M.cyl(g,.25,.25,.025,0x909a92,x,roofFloor+.615,z,16);for(let k=0;k<5;k++)box(g,.82,.018,.025,0x8d9991,x,roofFloor+.12+k*.08,z+.44,.003);}}
  const acX=roofW*.26,acZ=roofCenter+roofD*.15;box(g,.72,.43,.62,0xd8d5c5,acX,roofFloor+.2,acZ,.035);for(let i=0;i<6;i++)box(g,.6,.017,.035,0x8b958b,acX,roofFloor+.03+i*.055,acZ+.33,.004);M.cyl(g,.2,.2,.025,0x919b91,acX,roofFloor+.43,acZ,14);
  const boxCount=store?1:1+((hash>>>2)%2);for(let i=0;i<boxCount;i++){const x=(i?-.24:.25)*roofW*.58,z=roofFront-.5-(i%2)*.42,bs=.62+((hash+i)%3)*.1;box(g,roofW*.19,.27,.46,0xb2ad89,x,roofFloor+.18,z,.025);const bush=M.bush(g,x,z,roofW*.22*bs,.48);bush.position.y=roofFloor+.34;if((hash+i)%2)plant(g,x,roofFloor+.25,z,.38,true)}
  if(!branded)for(const x of[-w/2+.23,w/2-.23])plant(g,x,.2,front+.2,.55,hash%2===0);
  M.contactShadow?.(g,w+.5,d+.5);g.userData.setLabel=next=>{g.userData.label=String(next||label);return null};return g;
 }
 function marketCorner(parent,options={}){
  const w=Math.max(4.5,Number(options.w)||5.4),d=Math.max(5.2,Number(options.d)||5.6),height=Math.max(3.5,Math.min(4.2,Number(options.height)||3.9));
  const x=Number(options.x)||0,y=Number(options.y)||0,z=Number(options.z)||0,rotation=Number(options.rotationY??options.rotation)||0,g=M.group(parent,x,y,z);
  g.rotation.y=rotation;
  const shell=M.group(g);shell.name='market-corner-static-shell';
  const front=d/2-.25,wood=0x9a5942,deep=0x6b3933,trim=0xf5d4a1,roof=0xe3a064,display=mat(0xffbd70,'daylit-room'),lamp=mat(0xff743d,'lamp'),warm=mat(0xffd99a,'warm');
  g.userData={modelType:'market-corner',decorativeOnly:true,staticOnly:true,artToy:true,footprint:{width:w,depth:d},baseFootprint:{width:w,depth:d},w,d,height,label:'小城夜市',seed:options.seed??'market-corner',entryDepth:Math.min(1.25,d*.24)};
  box(shell,w-.22,.16,d-.22,0xc9a97b,0,.08,0,.035);
  box(shell,w-.36,.18,.16,wood,0,.33,-d/2+.18,.025);
  const postY=(height+.06)/2;
  for(const px of[-w/2+.16,w/2-.16])box(shell,.22,height-.06,.22,wood,px,postY,front-.08,.025);
  box(shell,w-.28,.28,.26,deep,0,height-.22,front-.08,.025);
  // Keep the entrance sky-open from the long lens: two narrow structural
  // beams frame the stalls while each stall's striped awning provides shade.
  box(shell,w-.3,.16,.24,roof,0,height-.12,front-.1,.03);
  box(shell,w-.54,.13,.22,roof,0,height-.12,-d/2+.28,.025);
  const signW=w-.76,signY=height-.73,sign=box(shell,signW,.6,.1,deep,0,signY,front-.2,.025);sign.name='market-night-sign';
  box(shell,signW+.06,.07,.13,trim,0,signY+.34,front-.2,.012);box(shell,signW+.06,.07,.13,trim,0,signY-.34,front-.2,.012);
  M.text(shell,'小城夜市',0,signY,front-.14,signW*.72,'#fff0cf');
  const lanternCount=5,lanternSpacing=Math.min(.82,w*.145);
  for(let i=0;i<lanternCount;i++){
   const lx=(i-(lanternCount-1)/2)*lanternSpacing,ly=height-1.16,lz=front-.43;
   const hook=M.cyl(shell,.018,.018,.2,wood,lx,ly+.16,lz,6);hook.name='market-lantern-hook';
   const body=M.sphere(shell,.15,lamp,lx,ly,lz,1,.92,.82);body.name='market-lantern';
   M.cyl(shell,.11,.11,.035,trim,lx,ly+.15,lz,8);M.cyl(shell,.11,.11,.035,trim,lx,ly-.15,lz,8);
  }
  const stallW=Math.min(1.45,(w-.9)/3),stallZ=.42,stallDepth=.96,stallXs=[-stallW*1.15,0,stallW*1.15],stallLabels=['滷味','蒸籠','甜點'],stripeColors=[0xd75d40,0xf3c28c];
  for(let stall=0;stall<3;stall++){
   const sx=stallXs[stall],counterY=.93,displayY=1.55,awningY=2.1,stallFront=stallZ+.5;
   box(shell,stallW,.82,stallDepth,wood,sx,counterY,stallZ,.025);
   box(shell,stallW-.1,.08,stallDepth+.06,trim,sx,1.34,stallZ,.012);
   const window=box(shell,stallW-.12,.72,.05,display,sx,displayY,stallZ-.45,.008);window.name='market-warm-window';
   for(const dx of[-(stallW-.16)/2,(stallW-.16)/2])box(shell,.04,.76,.08,wood,sx+dx,displayY,stallZ-.4,.008);
   for(let stripe=0;stripe<5;stripe++){
    const stripeW=(stallW+.04)/5,cloth=box(shell,stripeW,.07,.7,stripeColors[(stripe+stall)%2],sx-stallW/2+.02+(stripe+.5)*stripeW,awningY,stallZ+.12,.012);cloth.rotation.x=.16;cloth.name='market-striped-awning';
   }
   const plaque=box(shell,stallW*.82,.25,.08,stall%2?0x8c5b40:0xe06a42,sx,2.38,stallZ+.5,.015);plaque.name='market-stall-sign';
   M.text(shell,stallLabels[stall],sx,2.38,stallZ+.55,stallW*.68,'#fff2d2');
   for(const dx of[-stallW*.22,stallW*.22]){
    M.sphere(shell,.085,lamp,sx+dx,1.83,stallFront-.05,1,1,.7);
    M.cyl(shell,.13,.11,0.08,0xd8d2bd,sx+dx,1.42,stallFront-.16,10);M.cyl(shell,.15,.15,.025,0xf5e5c6,sx+dx,1.49,stallFront-.16,10);
   }
   if(stall===1){for(const sy of[1.52,1.68]){M.cyl(shell,.16,.13,.07,0xe9dfce,sx,sy,stallFront-.17,12);M.cyl(shell,.18,.18,.025,0xf7edda,sx,sy+.045,stallFront-.17,12);}}
   else if(stall===0){for(const dx of[-.22,0,.22])M.sphere(shell,.09,0xe7a35e,sx+dx,1.49,stallFront-.17,1,.55,.82);}
   else {for(const dx of[-.23,0,.23])M.sphere(shell,.085,0xf2be78,sx+dx,1.53,stallFront-.17,1,.8,.7);}
  }
  // Leave the center aisle open so the shallow decorative entry still reveals
  // the counters, warm windows, and steamers from a +Z camera.
  if(typeof M.character==='function'){
   const vendor=M.character(g,{color:0xe5814c,hair:0x53473e,hairStyle:'default',scale:.62});vendor.group.name='market-static-vendor';vendor.group.position.set(-.72,0,1.16);vendor.group.userData={modelType:'character',marketRole:'vendor',decorativeStatic:true};
   const guest=M.character(g,{color:0x559b93,hair:0x6e4b38,hairStyle:'bob',scale:.6});guest.group.name='market-static-guest';guest.group.position.set(.72,0,1.16);guest.group.userData={modelType:'character',marketRole:'guest',decorativeStatic:true};
  }
  if(window.CozyStaticMesh?.compile)window.CozyStaticMesh.compile(shell,{mergeColorMaterials:true});
  g.userData.marketStats={stallCount:3,stallLabels:['滷味','蒸籠','甜點'],lanternCount,signText:'小城夜市',warmDisplayCount:3,actorCount:g.children.filter(child=>child.userData?.modelType==='character').length,staticDrawUnits:shell.userData.staticCompilation?.drawUnits||shell.children.length,sharedShell:true};
  return g;
 }
 window.CozyStreetKit={build,building:build,marketCorner,isSharedResource};
})();
