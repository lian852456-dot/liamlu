/* Native depth-based contact shading. The scene remains real, interactive 3D.
 * One half-resolution depth pass and one edge-aware composite; no second scene
 * traversal or shadow map. Unsupported float targets keep the direct renderer.
 */
(function(){'use strict';const T=THREE;
 const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
 const viewPosition=`vec3 viewPosition(vec2 uv,float depth){vec4 p=projectionInverse*vec4(uv*2.-1.,depth*2.-1.,1.);return p.xyz/p.w;}`;
 function create(renderer){
  if(!renderer.extensions.has('EXT_color_buffer_float'))return null;
  const source=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,samples:2,depthBuffer:true});source.depthTexture=new T.DepthTexture(1,1,T.UnsignedIntType);source.depthTexture.minFilter=source.depthTexture.magFilter=T.NearestFilter;
  const shade=new T.WebGLRenderTarget(1,1,{type:T.UnsignedByteType,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false});
  const projectionInverse=new T.Matrix4(),resolution=new T.Vector2(1,1),shadeResolution=new T.Vector2(1,1);
  const ao=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{depthMap:{value:source.depthTexture},projectionInverse:{value:projectionInverse},resolution:{value:resolution},projectionScale:{value:1}},vertexShader:vertex,fragmentShader:`
   precision highp float;varying vec2 vUv;uniform sampler2D depthMap;uniform mat4 projectionInverse;uniform vec2 resolution;uniform float projectionScale;
   ${viewPosition}
   vec3 at(vec2 uv){return viewPosition(uv,texture2D(depthMap,uv).r);}
   void main(){float depth=texture2D(depthMap,vUv).r;if(depth>=.999999){gl_FragColor=vec4(1.);return;}vec3 p=viewPosition(vUv,depth);vec2 pixel=2.5/resolution;
    vec3 l=at(vUv-vec2(pixel.x,0.)),r=at(vUv+vec2(pixel.x,0.)),b=at(vUv-vec2(0.,pixel.y)),t=at(vUv+vec2(0.,pixel.y));
    vec3 dx=abs(l.z-p.z)<abs(r.z-p.z)?p-l:r-p,dy=abs(b.z-p.z)<abs(t.z-p.z)?p-b:t-p,n=normalize(cross(dx,dy));if(dot(n,-p)<0.)n=-n;
    float radius=.72,screenRadius=clamp(radius*projectionScale/max(.1,-p.z),.0005,.12),occlusion=0.;
    float rotation=mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y)*2.,4.)*1.5707963;
    for(int i=0;i<12;i++){float f=float(i)+.5,angle=f*2.3999632+rotation,ring=sqrt(f/12.);vec2 offset=vec2(cos(angle)*resolution.y/resolution.x,sin(angle))*screenRadius*ring;
     vec2 uv=clamp(vUv+offset,pixel,1.-pixel);float sd=texture2D(depthMap,uv).r;vec3 delta=viewPosition(uv,sd)-p;float distance=length(delta);
     float hemisphere=max(0.,dot(n,delta)/max(distance,.0001)-.2),range=1.-smoothstep(radius*.2,radius*1.3,distance);occlusion+=hemisphere*range*step(sd,.999998);
    }
    float amount=1.-occlusion*.54;amount=mix(1.,clamp(amount,.68,1.),1.-smoothstep(35.,85.,-p.z));gl_FragColor=vec4(vec3(amount),1.);
   }`});
  const composite=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:true,uniforms:{colorMap:{value:source.texture},depthMap:{value:source.depthTexture},shadeMap:{value:shade.texture},projectionInverse:{value:projectionInverse},shadeResolution:{value:shadeResolution}},vertexShader:vertex,fragmentShader:`
   precision highp float;varying vec2 vUv;uniform sampler2D colorMap,depthMap,shadeMap;uniform mat4 projectionInverse;uniform vec2 shadeResolution;
   ${viewPosition}
   void main(){float depth=texture2D(depthMap,vUv).r,z=viewPosition(vUv,depth).z;vec2 pixel=1./shadeResolution;float total=0.,weight=0.;
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 uv=clamp(vUv+vec2(float(x),float(y))*pixel*.7,pixel*.5,1.-pixel*.5);float sampleZ=viewPosition(uv,texture2D(depthMap,uv).r).z;float w=exp(-abs(sampleZ-z)*18.)*(x==0&&y==0?2.:1.);total+=texture2D(shadeMap,uv).r*w;weight+=w;}
    float contact=total/max(weight,.00001);gl_FragColor=texture2D(colorMap,vUv);if(depth>=.999999){
    #include <colorspace_fragment>
    return;}gl_FragColor.rgb*=mix(1.,contact,.86);
    #include <tonemapping_fragment>
    float luminance=dot(gl_FragColor.rgb,vec3(.2126,.7152,.0722));gl_FragColor.rgb=mix(vec3(luminance),gl_FragColor.rgb,1.13);
    #include <colorspace_fragment>
   }`});
  const quadScene=new T.Scene(),camera=new T.Camera(),quad=new T.Mesh(new T.PlaneGeometry(2,2),ao);quad.frustumCulled=false;quadScene.add(quad);let width=0,height=0,sceneCalls=0,sceneTriangles=0,checked=false,enabled=true,fallbackReason='';
  function checkTarget(target){renderer.setRenderTarget(target);const gl=renderer.getContext();return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;}
  function direct(scene,view){renderer.setRenderTarget(null);renderer.render(scene,view);sceneCalls=renderer.info.render.calls;sceneTriangles=renderer.info.render.triangles;}
  return{resize(w,h){const samples=innerWidth<600?0:2;if(w===width&&h===height&&source.samples===samples)return;width=w;height=h;source.samples=samples;source.setSize(w,h);const sw=Math.max(1,Math.ceil(w/2)),sh=Math.max(1,Math.ceil(h/2));shade.setSize(sw,sh);resolution.set(w,h);shadeResolution.set(sw,sh);checked=false;},reset(){checked=false;enabled=true;fallbackReason='';},render(scene,view){
   if(!enabled){direct(scene,view);return;}
   if(!checked){checked=true;if(!checkTarget(source)||!checkTarget(shade)){enabled=false;fallbackReason='offscreen-framebuffer-unavailable';renderer.setRenderTarget(null);window.dispatchEvent(new CustomEvent('cozy-renderer-fallback'));direct(scene,view);return;}}
   projectionInverse.copy(view.projectionMatrixInverse);ao.uniforms.projectionScale.value=view.projectionMatrix.elements[5]*.5;renderer.setRenderTarget(source);renderer.render(scene,view);sceneCalls=renderer.info.render.calls;sceneTriangles=renderer.info.render.triangles;quad.material=ao;renderer.setRenderTarget(shade);renderer.render(quadScene,camera);quad.material=composite;renderer.setRenderTarget(null);renderer.render(quadScene,camera);
  },stats(){return{enabled,fallbackReason,drawCalls:sceneCalls+(enabled?2:0),triangles:sceneTriangles+(enabled?4:0),width,height,samples:12,contactRadius:.72,minimumAmbient:.68,offscreenSamples:source.samples,scale:.5}},dispose(){source.dispose();shade.dispose();quad.geometry.dispose();ao.dispose();composite.dispose();}};
 }
 window.CozyAmbientOcclusion={create};
})();
