(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.CozyRenderPolicy=api;})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 function select({width,height,dpr=1,touchPoints=0,coarse=false}={}){
  const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1),mobile=touchPoints>0||coarse||Math.min(w,h)<600;
  return{mobile,pixelRatio:mobile?Math.min(Math.max(.5,Number(dpr)||1),1,Math.sqrt(900000/(w*h))):Math.min(Number(dpr)||1,1.65),antialias:!mobile,preserveDrawingBuffer:false,contactShading:!mobile,shadowSize:mobile?512:2048,maxFps:mobile?30:60,shadowIntervalMs:mobile?200:0};
 }
 return{select};
});
