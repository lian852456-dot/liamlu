/* One native 3D context per open preview; draft changes never save or spend. */
(function(){'use strict';
 const colors=Object.freeze({orange:0xe5814c,sunny:0xe1b05e,forest:0x6a9d8e,violet:0x9b86bc,rose:0xd7838f,ocean:0x5e92b5,gold:0xc8983e,purple:0x9b86bc,teal:0x559b93});
 function colorFor(profile={}){const outfit=String(profile.outfit||'').replace(/^outfit-/,'');return colors[outfit]||colors[profile.character]||colors.orange;}
 window.CozyAppearancePreview={colorFor,mount(host,profile){
  const T=window.THREE,M=window.CozyModels,mobile=(navigator.maxTouchPoints||0)>0||Math.min(innerWidth,innerHeight)<600,renderer=new T.WebGLRenderer({antialias:!mobile,alpha:false,preserveDrawingBuffer:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1:1.5));renderer.setClearColor(0xf4ead5);renderer.outputColorSpace=T.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.setAttribute('aria-label','可旋轉的3D外觀預覽');canvas.style.cssText='display:block;width:100%;height:100%;margin:auto;border-radius:18px;touch-action:none';host.append(canvas);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.1,30);camera.position.set(0,1.35,5.2);camera.lookAt(0,1.1,0);scene.add(new T.HemisphereLight(0xffffff,0xadb69e,2));const sun=new T.DirectionalLight(0xffead1,2.5);sun.position.set(-3,5,4);scene.add(sun);
  const model=M.character(scene,{color:colorFor(profile)});
  const base=new T.Mesh(new T.CylinderGeometry(.8,.85,.06,32),new T.MeshStandardMaterial({color:0xd2d4bf}));base.position.y=-.03;scene.add(base);
  let lastPresented=0,frameId,stopped=false,startX=0,angle=0,drag=false,width=0,height=0;
  function update(next){if(stopped)return;model.setColor(colorFor(next));model.setAppearance({...next,hair:next.hair||'',outfit:next.outfit||''});}
  update(profile);
  canvas.addEventListener('pointerdown',e=>{drag=true;startX=e.clientX;canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!drag)return;angle+=(e.clientX-startX)*.018;startX=e.clientX});canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointercancel',()=>drag=false);
  function frame(now){if(stopped)return;if(document.hidden||(mobile&&lastPresented&&now-lastPresented<32)){frameId=requestAnimationFrame(frame);return;}lastPresented=now;const w=Math.round(host.clientWidth)||280,h=Math.round(host.clientHeight)||250;if(width!==w||height!==h){width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}model.group.rotation.y=angle;model.animate?.(now*.002,false,false,false);renderer.render(scene,camera);frameId=requestAnimationFrame(frame)}
  frameId=requestAnimationFrame(frame);
  const dispose=()=>{if(stopped)return;stopped=true;cancelAnimationFrame(frameId);model.dispose?.();base.geometry.dispose();base.material.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();};dispose.update=update;return dispose;
 }};
})();
