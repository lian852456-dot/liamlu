import {randomUUID} from 'node:crypto';
import {GameError} from './game-store.mjs';
const kinds=new Set(['greet','highfive','stumble']);
const shape=(b,keys)=>b&&typeof b==='object'&&!Array.isArray(b)&&Object.keys(b).every(k=>keys.includes(k));
export class SocialInteractions {
 constructor({clients,position,send,name,now=()=>Date.now()}){Object.assign(this,{clients,position,send,name,now});}
 nearby(a,b){const p=this.position(a.uid),q=this.position(b.uid);return p.scene===q.scene&&(p.scene==='outdoor'||p.zone===q.zone)&&Math.hypot(p.x-q.x,p.z-q.z)<=2.6;}
 handle(c,b){const fail=code=>{throw new GameError(code,409);};
  if(b.type!=='interactionRequest')return false;
  if(!shape(b,['type','targetId','kind'])||typeof b.targetId!=='string'||!kinds.has(b.kind))fail('INTERACTION_INVALID');
  const target=this.clients.get(b.targetId);if(!target||target===c||!this.nearby(c,target))fail('INTERACTION_UNAVAILABLE');
  const now=this.now();if(now-(c.lastSocialAt??-Infinity)<5000||now<(c.socialBusyUntil||0)||now<(target.socialBusyUntil||0))fail('INTERACTION_COOLDOWN');
  c.lastSocialAt=now;const duration=b.kind==='stumble'?2600:b.kind==='highfive'?1700:1500;c.socialBusyUntil=target.socialBusyUntil=now+duration+500;
  const message={type:'interactionPlay',id:randomUUID(),fromId:c.uid,targetId:target.uid,kind:b.kind,serverTime:now,duration};
  for(const watcher of this.clients.values()){const p=this.position(watcher.uid),a=this.position(target.uid),f=this.position(c.uid);if(p.scene===a.scene&&(p.scene==='outdoor'||p.zone===a.zone)&&Math.min(Math.hypot(p.x-a.x,p.z-a.z),Math.hypot(p.x-f.x,p.z-f.z))<34)this.send(watcher,message);}
  return true;
 }
}
