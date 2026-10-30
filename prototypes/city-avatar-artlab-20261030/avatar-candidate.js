/* Isolated local-player adapter. No version field ever enters a profile/packet. */
(function(root){'use strict';
 const T=root.THREE,M=root.CozyModels,original=M.character,instances=new Set();let version='new',enabled=root.__ARTLAB_AVATAR_ENABLED!==false;const previewActors=new Set((Array.isArray(root.__ARTLAB_PREVIEW_ACTORS)?root.__ARTLAB_PREVIEW_ACTORS:[]).filter(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)));
 function create(parent,options={}){
  const wrapper=new T.Group();parent?.add(wrapper);wrapper.userData={modelType:'character',artLabDemo:true};if(options.artLabActorId)wrapper.userData.renderActorId=options.artLabActorId;
  let active=null,disposed=false,profile={},baseColor=options.color,lastHeading=0,lastTime=0;
  function rebuild(){active?.dispose?.();active=!enabled?original(wrapper,options):version==='new'?root.CozyAvatarDeluxe.create(wrapper,options):version==='v1'?root.CozyAvatarBlenderV1.create(wrapper,options):root.CozyAvatarIntegrated.create(wrapper,options);if(baseColor!==undefined)active.setColor?.(baseColor);active.setAppearance?.(profile);wrapper.userData.avatarVersion=enabled?version:'legacy';}
  const api={group:wrapper,get head(){return active.head;},get arms(){return active.arms;},get legs(){return active.legs;},get clothing(){return active.clothing;},modelType:'character',get active(){return active;},get profile(){return {...profile};},get version(){return wrapper.userData.avatarVersion;},
   setAppearance(p={}){profile={...p};active.setAppearance?.(p);},setColor(c){baseColor=c;active.setColor?.(c);},setHairStyle(...a){active.setHairStyle?.(...a);},
   animate(...a){if(disposed)return;active.animate?.(...a);wrapper.position.y=0;const now=performance.now(),dt=lastTime?Math.min(.1,(now-lastTime)/1000):.033;lastTime=now;
    const target=wrapper.rotation.y,difference=Math.atan2(Math.sin(target-lastHeading),Math.cos(target-lastHeading));lastHeading+=difference*(1-Math.exp(-dt*13));active.group.rotation.y=lastHeading-target;
   },switch(){if(!disposed)rebuild();},dispose(){if(disposed)return;disposed=true;active?.dispose?.();wrapper.clear();wrapper.removeFromParent();instances.delete(api);}
  };rebuild();instances.add(api);return api;
 }
 M.character=(parent,options={})=>options.artLabDemo===true||previewActors.has(options.artLabActorId)?create(parent,options):original(parent,options);
 root.CozyAvatarCandidate=Object.freeze({create,setEnabled(next){if(typeof next!=='boolean'||next===enabled)return;enabled=next;for(const i of instances)i.switch();},get enabled(){return enabled;},get previewActors(){return [...previewActors];},setVersion(next){if(!['new','v1','old'].includes(next))return;if(next!==version){version=next;for(const i of instances)i.switch();}},get version(){return version;},get instances(){return [...instances];},originalFactory:original});
})(window);
