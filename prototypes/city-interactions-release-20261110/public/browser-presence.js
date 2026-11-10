(function(){'use strict';
  const OPEN=1;
  const RETRIES=[1000,2000,4000,8000];
  function create(options={}){
    let socket=null,provider=null,closed=false,suspended=false,replaced=false,ready=false,timer=null,retryTimer=null,
      retry=0,seq=0,lastSentAt=0,lastHeartbeat=0,lastSignature='',lastTransition='',handshakeTimer=null,lastMessageAt=0;
    const stats={sent:0,received:0,posesSent:0,heartbeats:0,corrections:0,reconnects:0};
    const call=(name,...args)=>{const fn=options[name];if(typeof fn==='function')fn(...args);};
    const status=value=>call('onStatus',value);
    function url(){const scheme=location.protocol==='https:'?'wss:':'ws:';return scheme+'//'+location.host+'/api/live';}
    function clearRetry(){if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}}
    function clearHandshake(){if(handshakeTimer){clearTimeout(handshakeTimer);handshakeTimer=null;}}
    function abandon(ws){if(ws!==socket)return;socket=null;ready=false;clearHandshake();try{ws.close();}catch{}schedule();}
    function send(message){if(!socket||socket.readyState!==OPEN)return false;socket.send(JSON.stringify(message));stats.sent++;if(message.type==='pose'){stats.posesSent++;if(!message.transition)stats.heartbeats++;}return true;}
    function poseForSend(){
      if(typeof provider!=='function')return null;
      const raw=provider();if(!raw||typeof raw!=='object')return null;
      const pose={scene:raw.scene,zone:raw.zone||'jiuquan',x:Number(raw.x),z:Number(raw.z),heading:Number(raw.heading||0),moving:!!raw.moving};
      if(raw.action)pose.action=raw.action;
      if(raw.transition&&raw.transition!==lastTransition)pose.transition=raw.transition;
      return pose;
    }
    function pump(force=false){
      if(!socket||socket.readyState!==OPEN||suspended||replaced||!ready)return;
      const pose=poseForSend();if(!pose||!Number.isFinite(pose.x)||!Number.isFinite(pose.z))return;
      const signature=JSON.stringify(pose),now=Date.now(),changed=signature!==lastSignature;
      if(!force&&changed&&now-lastSentAt<100)return;
      if(!force&&!changed&&now-lastHeartbeat<2000)return;
      const message={type:'pose',seq:++seq,...pose};
      if(send(message)){lastSentAt=now;lastHeartbeat=now;if(changed)lastSignature=signature;if(pose.transition)lastTransition=pose.transition;call('onPoseSent',message);}
    }
    function schedule(){
      if(closed||suspended||replaced||retryTimer)return;
      const wait=RETRIES[Math.min(retry,RETRIES.length-1)];retry=Math.min(retry+1,RETRIES.length-1);
      stats.reconnects++;status('reconnecting');retryTimer=setTimeout(()=>{retryTimer=null;connect();},wait);
    }
    function connect(){
      if(closed||suspended||replaced||document.hidden)return;
      clearRetry();if(socket&&(socket.readyState===0||socket.readyState===OPEN))return;
      status('connecting');ready=false;let ws;
      try{ws=new WebSocket(url());}catch(error){status('unavailable');call('onError',error);schedule();return;}
      socket=ws;
      clearHandshake();handshakeTimer=setTimeout(()=>abandon(ws),10000);
      ws.addEventListener('open',()=>{if(ws!==socket)return;retry=0;status('connected');send({type:'hello',csrf:options.csrf||''});});
      ws.addEventListener('message',event=>{if(ws!==socket)return;let data;try{data=JSON.parse(event.data);}catch{return;}lastMessageAt=Date.now();stats.received++;if(data?.type==='welcome'){clearHandshake();ready=true;seq=0;lastSignature='';lastTransition='';lastSentAt=Date.now();lastHeartbeat=Date.now();call('onWelcome',data);const pose=poseForSend();if(pose){lastSignature=JSON.stringify(pose);if(pose.transition)lastTransition=pose.transition;}}else if(data?.type==='snapshot')call('onSnapshot',data);else if(data?.type==='poseAck')call('onAck',data);else if(data?.type==='correction'){stats.corrections++;lastSignature='';lastTransition='';call('onCorrection',data);}if(data&&data.type)call('onMessage',data);});
      ws.addEventListener('error',error=>{if(ws===socket)call('onError',error);});
      ws.addEventListener('close',event=>{if(ws!==socket)return;socket=null;ready=false;clearHandshake();
        const reason=String(event.reason||'').toUpperCase();
        if(event.code===4001||reason.includes('REPLACED')){replaced=true;status('replaced');call('onReplaced',event);return;}
        if(event.code===1008&&['SESSION_EXPIRED','LOGGED_OUT','CSRF_DENIED'].some(code=>reason.includes(code))){closed=true;clearRetry();status('expired');call('onTerminal',event);return;}
        if(closed||suspended){status('offline');return;}status('offline');schedule();
      });
    }
    function close({suspend=false,sendLastPose=false}={}){if(sendLastPose&&ready) pump(true);suspended=!!suspend;ready=false;clearRetry();clearHandshake();if(socket){const ws=socket;socket=null;try{ws.close(1000,suspend?'PAGE_HIDDEN':'CLIENT_STOP');}catch{};}status(suspend?'suspended':'offline');}
    function resume(){if(closed||replaced)return;suspended=false;if(socket?.readyState===OPEN&&ready)return;retry=0;status('resuming');connect();}
    function takeover(){if(closed)return;replaced=false;suspended=false;ready=false;retry=0;seq=0;lastSignature='';lastTransition='';status('taking-over');connect();}
    timer=setInterval(()=>pump(false),50);
    const healthTimer=setInterval(()=>{if(closed||suspended||replaced||document.hidden)return;if(socket?.readyState===OPEN&&ready&&Date.now()-lastMessageAt>15000)abandon(socket);else if(!socket&&!retryTimer)connect();},1000);
    return{connect,close,resume,takeover,sendPose:()=>pump(true),sendPlayground(message){return ready&&!suspended&&!replaced&&['playgroundJoin','playgroundLeave','playgroundInput'].includes(message?.type)?send(message):false;},sendInteraction(message){return ready&&!suspended&&!replaced&&['interactionPreference','interactionRequest','interactionResponse'].includes(message?.type)?send(message):false;},setPoseProvider(fn){provider=fn;},stop(){closed=true;clearRetry();clearInterval(timer);clearInterval(healthTimer);close();},getState(){return{connected:!!socket&&socket.readyState===OPEN&&ready,connecting:!!socket&&!ready,replaced,suspended,seq,stats:{...stats}};}};
  }
  window.CityPresence={create};
})();
