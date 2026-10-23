/* Explicitly mounted only by a future approved adapter. No automatic collection. */
(function(root) {
  'use strict';
  function createPlatformUsageCollector(options) {
    const o=options, scope=o.scope||root, doc=o.document||scope.document;
    const mono=o.monotonic||(()=>scope.performance.now()), wall=o.wall||Date.now;
    const uuid=o.uuid||(()=>scope.crypto.randomUUID());
    const tab=uuid(),visit=uuid();
    let feature=null, lease=null, epoch=0,queue=[],flight=null,timer=null,last=null,lastWall=null,lastActivity=-Infinity;
    let dropped=0,ready=false,closed=false,owns=true,lastFlush=0,failures=0,nextSend=0;
    const listeners=[];
    const stats=()=>({queued:queue.length,dropped,ready,failures});
    function visible(){return !doc.hidden&&doc.visibilityState==='visible'&&doc.hasFocus()&&owns;}
    function push(row) {
      if(!lease||closed)return;
      queue=queue.filter(x=>{const keep=x.at>=wall()-86400000;if(!keep)dropped++;return keep;});
      if(queue.length>=200){dropped++;return;}
      queue.push({id:uuid(),v:1,type:row.type,feature,visit,tab,at:wall(),...row});
    }
    function tick() {
      const t=mono(),w=wall(),prior=last,priorWall=lastWall;
      last=t;lastWall=w;
      if(!ready||!lease||w>=lease.until){ready=false;return;}
      // Sleep, backwards/manual wall-clock changes and long timer gaps are unknown.
      if(prior===null||t<prior||t-prior>30000||Math.abs((w-priorWall)-(t-prior))>2000)return;
      if(visible()) {
        const end=Math.min(t,lastActivity+60000);
        const ms=Math.min(15000,Math.max(0,end-prior));
        if(ms>0)push({type:'engaged_interval',start:Math.round(priorWall),end:Math.round(priorWall+ms)});
      }
      if(w-lastFlush>=60000)void flush();
    }
    async function flush() {
      if(flight||!ready||!queue.length||wall()<nextSend)return flight;
      const generation=epoch,batch=queue.slice(0,20),original=lease;
      lastFlush=wall();
      const operation=(async()=>{
        try {
          // Proof is held by the adapter; queue contains no credentials or personal identifiers.
          const result=await o.send(batch,original);
          if(generation!==epoch)return;
          if(result?.status!=='ok'||!result.ack)throw Error('USAGE_ACK_UNKNOWN');
          const ack=result.ack;
          if(!['accepted','duplicate','rejected'].every(k=>Array.isArray(ack[k])))throw Error('USAGE_ACK_UNKNOWN');
          const ids=new Set([...ack.accepted,...ack.duplicate,...ack.rejected]);
          const sent=new Set(batch.map(x=>x.id));
          if([...ids].some(id=>!sent.has(id))||ids.size!==batch.length)throw Error('USAGE_ACK_UNKNOWN');
          dropped+=ack.rejected.length;queue=queue.filter(x=>!ids.has(x.id));failures=0;nextSend=0;
        } catch {
          if(generation!==epoch)return;
          failures++;nextSend=wall()+Math.min(60000,1000*2**Math.min(6,failures))*(.75+(o.random||Math.random)()*.5);
        }
      })();
      flight=operation;try{return await operation;}finally{if(flight===operation)flight=null;}
    }
    function activity() {
      if(!ready||!visible())return;
      // Close idle time before starting a new active span.
      tick();lastActivity=mono();
      channel?.postMessage({type:'claim',tab,at:wall()});
    }
    async function resume() {
      const generation=++epoch;ready=false;last=null;lastWall=null;
      if(closed||!visible()||!feature)return;
      try {
        const next=await o.validate();
        if(generation!==epoch||closed||!visible())return;
        if(!next||!next.id||!next.actor||next.until<=wall()||next.from>wall())throw Error();
        // Never borrow a new identity/lease to backfill an old queue.
        if(lease&&(lease.actor!==next.actor||lease.id!==next.id)){dropped+=queue.length;queue=[];}
        lease={...next};ready=true;lastActivity=mono();last=mono();lastWall=wall();
      } catch {if(generation===epoch){dropped+=queue.length;queue=[];lease=null;}}
    }
    function pause() {tick();epoch++;ready=false;last=null;lastWall=null;}
    function clear() {pause();dropped+=queue.length;queue=[];lease=null;}
    function on(target,event,fn){target.addEventListener(event,fn,{passive:true});listeners.push(()=>target.removeEventListener(event,fn));}
    let channel=null;
    try {
      if(scope.BroadcastChannel) {
        channel=new scope.BroadcastChannel('north12b_usage_foreground_v1');
        channel.onmessage=event=>{
          const m=event.data;
          if(m?.type==='claim'&&m.tab!==tab&&Number.isFinite(m.at)&&Math.abs(wall()-m.at)<5000&&!doc.hasFocus()){tick();owns=false;pause();}
        };
      }
    }catch{}
    on(doc,'pointerdown',activity);on(doc,'touchstart',activity);on(doc,'scroll',activity);
    on(doc,'visibilitychange',()=>{if(doc.hidden)pause();else{owns=true;void resume();}});
    on(scope,'blur',pause);on(scope,'focus',()=>{owns=true;void resume();});
    on(scope,'pagehide',pause);on(scope,'pageshow',()=>{owns=true;void resume();});on(doc,'freeze',pause);
    on(scope,'storage',e=>{if(e.key==='north12b_portal_logout_event_v1')clear();});
    const api={
      async start(id) {
        if(!['home','kpi','awards','personal'].includes(id))throw Error('USAGE_FEATURE_INVALID');
        tick();feature=id;await resume();if(ready)push({type:'feature_open'});
        if(!timer)timer=scope.setInterval(tick,15000);
      },
      // Integrators must call these after the real feature is usable or a classified failure occurs.
      ready(latency){if(ready&&Number.isSafeInteger(latency)&&latency>=0&&latency<=120000)push({type:'feature_ready',latency});},
      error(error){if(ready&&['network','timeout','auth','format','service'].includes(error))push({type:'client_error',error});},
      tick,flush,activity,pause,resume,clear,stats,
      stop(){clear();closed=true;if(timer)scope.clearInterval(timer);listeners.forEach(fn=>fn());channel?.close();}
    };
    return Object.freeze(api);
  }
  if(typeof module==='object'&&module.exports)module.exports=createPlatformUsageCollector;
  else root.createPlatformUsageCollector=createPlatformUsageCollector;
})(typeof globalThis==='object'?globalThis:this);
