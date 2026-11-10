import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {GameError} from './game-store.mjs';
import {taipeiDate} from './game-config.mjs';
import {answerSupervisorQuestion} from './supervisor-knowledge.mjs';
const require=createRequire(import.meta.url),R=require('./scene-rules.js'),N=require('./nav.js');
import {SUPERVISOR_RULES} from './supervisor-rules.mjs';
export {SUPERVISOR_RULES};
const check=(value,code,status=409)=>{if(!value)throw new GameError(code,status)};
const fields=(body,keys)=>check(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(k=>keys.includes(k)),'INVALID_FIELDS',400);

// One connected, swept-clear circuit visits nine doors and four road corners.
export function supervisorCircuit(){
 const stops=[R.storeDoors.jiuquan,{x:-30,z:-34},{x:50,z:-34},R.storeDoors.yongji,R.storeDoors.sanchuang,R.storeDoors.fuxingnan,R.storeDoors.tonghua,R.storeDoors.liuzhangli,{x:50,z:66},{x:-30,z:66},R.storeDoors.wanda,R.storeDoors.hangzhounan,R.storeDoors.dadaocheng];
 const segments=[];let duration=0;
 for(let i=0;i<stops.length;i++){
  let from=stops[i];check(!N.blocked(from,R.obstacles.outdoor,R.bounds.outdoor),'SUPERVISOR_ROUTE_INVALID');
  segments.push({from,to:from,start:duration,end:duration+5});duration+=5;
  const route=N.route(from,stops[(i+1)%stops.length],R.obstacles.outdoor,R.bounds.outdoor);check(route.length,'SUPERVISOR_ROUTE_INVALID');
  for(const to of route){check(N.clear(from,to,R.obstacles.outdoor,R.bounds.outdoor),'SUPERVISOR_ROUTE_INVALID');const seconds=Math.hypot(to.x-from.x,to.z-from.z)/SUPERVISOR_RULES.speed;if(seconds>0){segments.push({from,to,start:duration,end:duration+seconds});duration+=seconds;}from=to;}
 }
 return {stops,segments,duration};
}
export class SupervisorService{
 constructor(store,{now=()=>Date.now(),position,isConnected}={}){
  this.store=store;this.now=now;this.position=position;this.isConnected=isConnected;this.circuit=supervisorCircuit();
  store.db.exec(`CREATE TABLE IF NOT EXISTS v43_supervisor_encounters(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),date TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,questions INTEGER NOT NULL DEFAULT 0,supported INTEGER NOT NULL DEFAULT 0,completed INTEGER NOT NULL DEFAULT 0,closed INTEGER NOT NULL DEFAULT 0,reward INTEGER NOT NULL DEFAULT 0);CREATE INDEX IF NOT EXISTS v43_supervisor_user ON v43_supervisor_encounters(user_id,created);`);
  if(!store.get("SELECT value FROM v4_metadata WHERE key='supervisor-clock-v1'"))this.clock({elapsed:0,at:now(),holdUntil:0,holdId:null});
 }
 clock(value){if(value){this.store.run("INSERT OR REPLACE INTO v4_metadata VALUES('supervisor-clock-v1',?)",JSON.stringify(value));return value;}return JSON.parse(this.store.get("SELECT value FROM v4_metadata WHERE key='supervisor-clock-v1'").value);}
 progress(clock=this.clock()){return clock.elapsed+Math.max(0,this.now()-Math.max(clock.at,clock.holdUntil||0))/1000;}
 snapshot(){const clock=this.clock(),elapsed=this.progress(clock),t=((elapsed%this.circuit.duration)+this.circuit.duration)%this.circuit.duration,segment=this.circuit.segments.find(s=>t<s.end)||this.circuit.segments[0],u=Math.max(0,Math.min(1,(t-segment.start)/(segment.end-segment.start))),paused=clock.holdUntil>this.now(),pose={x:segment.from.x+(segment.to.x-segment.from.x)*u,z:segment.from.z+(segment.to.z-segment.from.z)*u};return{id:'supervisor',name:SUPERVISOR_RULES.name,...pose,heading:Math.atan2(segment.to.x-segment.from.x,segment.to.z-segment.from.z),moving:!paused&&Math.hypot(segment.to.x-segment.from.x,segment.to.z-segment.from.z)>.01,paused,serverTime:this.now(),rules:SUPERVISOR_RULES};}
 nearby(uid){this.store.user(uid);check(this.isConnected(uid),'SUPERVISOR_CONNECTION_REQUIRED');const player=this.position(uid),npc=this.snapshot();check(player.scene==='outdoor'&&Math.hypot(player.x-npc.x,player.z-npc.z)<=2.4,'SUPERVISOR_TOO_FAR');return npc;}
 encounter(uid,id){check(typeof id==='string','INVALID_ENCOUNTER',400);const row=this.store.get('SELECT * FROM v43_supervisor_encounters WHERE id=? AND user_id=?',id,uid);check(row,'INVALID_ENCOUNTER',403);return row;}
 liveEncounter(uid,id){const row=this.encounter(uid,id);check(!row.closed&&!row.completed&&row.expires>this.now(),'SUPERVISOR_ENCOUNTER_EXPIRED');this.nearby(uid);return row;}
 release(id){const clock=this.clock();if(clock.holdId===id)this.clock({elapsed:this.progress(clock),at:this.now(),holdUntil:0,holdId:null});}
 start(uid,body){fields(body,['requestId']);return this.store.idempotent(uid,body.requestId,'supervisor-start',{},()=>{
  this.nearby(uid);const clock=this.clock();
  if(clock.holdUntil>this.now()){
   const active=this.store.get('SELECT * FROM v43_supervisor_encounters WHERE id=?',clock.holdId);check(active?.user_id===uid,'SUPERVISOR_BUSY');return {encounter:this.publicEncounter(active),supervisor:this.snapshot()};
  }
  const previous=this.store.get('SELECT created FROM v43_supervisor_encounters WHERE user_id=? ORDER BY created DESC LIMIT 1',uid);check(!previous||this.now()-previous.created>=SUPERVISOR_RULES.cooldownMs,'SUPERVISOR_COOLDOWN');
  const row={id:randomUUID(),user_id:uid,date:taipeiDate(this.now()),created:this.now(),expires:this.now()+SUPERVISOR_RULES.encounterMs,questions:0,supported:0,completed:0,closed:0,reward:0};
  this.store.run('INSERT INTO v43_supervisor_encounters VALUES(?,?,?,?,?,?,?,?,?,?)',...Object.values(row));this.clock({elapsed:this.progress(clock),at:this.now(),holdUntil:row.expires,holdId:row.id});
  return {encounter:this.publicEncounter(row),supervisor:this.snapshot()};
 });}
 publicEncounter(row){return{id:row.id,created:row.created,expires:row.expires,questions:row.questions,readyAt:row.supported?row.supported+SUPERVISOR_RULES.minimumTalkMs:null,completed:!!row.completed,reward:row.reward,eligible:!this.store.get("SELECT id FROM ledger WHERE user_id=? AND kind='SUPERVISOR_REWARD' AND source=?",row.user_id,row.date),rules:SUPERVISOR_RULES,serverTime:this.now()};}
 ask(uid,body){fields(body,['encounterId','question']);check(typeof body.question==='string'&&body.question.trim().length>0&&body.question.length<=500,'INVALID_QUESTION',400);return this.store.tx(()=>{const row=this.liveEncounter(uid,body.encounterId);check(row.questions<12,'SUPERVISOR_QUESTION_LIMIT',429);const response=answerSupervisorQuestion(body.question,{profile:this.store.user(uid),wallet:this.store.wallet(uid),date:taipeiDate(this.now())});this.store.run('UPDATE v43_supervisor_encounters SET questions=questions+1,supported=CASE WHEN supported=0 AND ?=1 THEN ? ELSE supported END WHERE id=?',response.supported?1:0,this.now(),row.id);return{...response,encounter:this.publicEncounter({...row,questions:row.questions+1,supported:row.supported||(response.supported?this.now():0)})};});}
 complete(uid,body){fields(body,['encounterId','requestId']);return this.store.idempotent(uid,body.requestId,'supervisor-complete',{encounterId:body.encounterId},()=>{
  const prior=this.encounter(uid,body.encounterId);if(prior.completed)return{receipt:{encounterId:prior.id,coins:prior.reward,alreadyCompleted:true},...this.store.bootstrap(uid)};
  const row=this.liveEncounter(uid,body.encounterId);check(row.supported&&this.now()-row.supported>=SUPERVISOR_RULES.minimumTalkMs,'SUPERVISOR_TALK_REQUIRED');check(row.date===taipeiDate(this.now()),'SUPERVISOR_ENCOUNTER_EXPIRED');
  const awarded=this.store.get("SELECT id FROM ledger WHERE user_id=? AND kind='SUPERVISOR_REWARD' AND source=?",uid,row.date),coins=awarded?0:SUPERVISOR_RULES.coins;
  if(coins){this.store.run('UPDATE wallets SET coins=coins+? WHERE user_id=?',coins,uid);this.store.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',randomUUID(),uid,'SUPERVISOR_REWARD',coins,0,row.date,this.now());this.store.audit(uid,'SUPERVISOR_REWARD',row.id,{coins,date:row.date});}
  this.store.run('UPDATE v43_supervisor_encounters SET completed=1,closed=1,reward=? WHERE id=?',coins,row.id);this.release(row.id);return{receipt:{encounterId:row.id,coins,alreadyClaimed:!!awarded},...this.store.bootstrap(uid)};
 });}
 end(uid,body){fields(body,['encounterId']);return this.store.tx(()=>{const row=this.encounter(uid,body.encounterId);this.store.run('UPDATE v43_supervisor_encounters SET closed=1 WHERE id=?',row.id);this.release(row.id);return{ok:true,supervisor:this.snapshot()};});}
}
