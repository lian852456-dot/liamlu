/* Real GLB decode, GPU resource counters, repeated swaps, head turns and offline fallback.
 * Desktop engines only; renderer counters are not resident Safari/GPU memory. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit,chromiumOptions}=require('./browser-runtime.cjs');
(async()=>{const out={physicalIphoneUat:false,gpuResidentBytesMeasured:false,cyclesPerEngine:40,engines:{}};
 for(const [engine,kind]of[['chromium',chromium],['webkit',webkit]]){
  const browser=await kind.launch(engine==='chromium'?chromiumOptions:{headless:true});
  try{const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.goto('http://127.0.0.1:4714/studio.html');await p.waitForFunction(()=>window.AvatarArtLabStudio?.metrics().frames>10);
   const rows=await p.evaluate(async()=>{const s=AvatarArtLabStudio,rows=[];const wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    // Warm every used model/material path before testing for growth.
    for(const version of['old','v1','new'])for(const hair of['bob','pony']){s.control('version',version);s.control('hair',hair);await wait();}
    s.control('version','new');s.control('hair','bob');await wait();rows.push({cycle:0,...s.metrics()});
    for(let i=1;i<=40;i++){s.control('version','old');await wait();s.control('version','v1');await wait();s.control('outfit',['uniform','forest','ocean','rose'][i%4]);await wait();s.control('version','new');s.control('hair','pony');await wait();s.control('hair','bob');s.control('motion',i%2?'walk':'idle');await wait();if(i%5===0)rows.push({cycle:i,...s.metrics()});}
    return rows;
   });
   for(const r of rows){assert.equal(r.contextLost,false);assert.equal(r.hairAsset.liveInstances,1);assert.equal(r.hairAssetV1.liveInstances,0);assert.equal(r.hairAssetV1.created,r.hairAssetV1.released);assert.equal(r.hairAsset.created-r.hairAsset.released,1);assert.equal(r.textures,rows[0].textures);assert.ok(r.geometries<=rows[0].geometries+1,`geometry plateau ${engine}: ${r.geometries}`);}
   await p.evaluate(()=>{const s=AvatarArtLabStudio,animate=s.model.animate.bind(s.model);s.model.animate=()=>animate(0,false,false,false);s.control('view','quarter');});
   const turns=[];
   for(const yaw of[-45,0,45]){await p.evaluate(y=>{const m=AvatarArtLabStudio.model,base=m.animate.bind(m);m.animate=()=>{base();m.head.rotation.y=y*Math.PI/180;};},yaw);await p.waitForTimeout(500);const data=await p.evaluate(()=>{const m=AvatarArtLabStudio.model,h=m.head,asset=h.getObjectByName('blender-short-bob-instance');return{parentedToHead:!!asset&&asset.parent.parent===h,assetLocalMatrix:asset.matrix.toArray(),headYaw:h.rotation.y,source:m.active.state().hairSource,contextLost:AvatarArtLabStudio.metrics().contextLost};});assert.equal(data.parentedToHead,true);assert.equal(data.source,'blender-glb');turns.push({yaw,...data});await p.screenshot({path:`evidence/blender-hair-v2/${engine}-turn-${yaw}.png`});}
   const teardown=await p.evaluate(async()=>{const before=AvatarArtLabStudio.metrics();CozyHairGLB.dispose();CozyHairGLBV1.dispose();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{before,after:AvatarArtLabStudio.metrics(),cache:CozyHairGLB.stats()};});assert.equal(teardown.cache.liveInstances,0);assert.equal(teardown.cache.ready,false);assert.ok(teardown.after.textures<=teardown.before.textures-6,'cache textures released');assert.ok(teardown.after.geometries<teardown.before.geometries,'cache geometry released');
   await context.close();
   const failure=await browser.newContext({viewport:{width:390,height:844}});await failure.route('**/assets/hair-glb-v2/short-bob-v2.glb',r=>r.abort());const offline=await failure.newPage();await offline.goto('http://127.0.0.1:4714/studio.html');await offline.waitForFunction(()=>window.AvatarArtLabStudio?.metrics().frames>8);const fallback=await offline.evaluate(()=>({state:AvatarArtLabStudio.model.active.state(),asset:CozyHairGLB.stats(),contextLost:AvatarArtLabStudio.metrics().contextLost}));assert.equal(fallback.state.hairSource,'procedural');assert.ok(fallback.asset.error);assert.equal(fallback.contextLost,false);await failure.close();assert.deepEqual(errors,[]);
   out.engines[engine]={rows,turns,fallback,teardown,errors,pass:true};console.log(engine+' real asset / 40 swap cycles / turns / fallback passed');
  }finally{await browser.close();}
 }
 out.pass=true;fs.writeFileSync('evidence/blender-hair-v2/memory-browser.json',JSON.stringify(out,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
