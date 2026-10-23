const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(process.env.D24_GAS_SOURCE||path.join(__dirname,'../gas/Code.gs'),'utf8');
const start=source.indexOf('function checkSegAndNotify(seg) {');
assert.ok(start>=0);const end=source.indexOf('\n// ═',start);assert.ok(end>start);const code=source.slice(start,end);
for(const [time,skip] of [['2026-10-23T15:59:59Z',false],['2026-10-23T16:00:00Z',true],['2026-10-24T15:59:59Z',true],['2026-10-24T16:00:00Z',false]])for(const seg of [16,21])for(const filled of [false,true])test(`${time} segment ${seg} ${filled?'complete':'missing'} reports ${skip?'skip':'retain normal notification'}`,()=>{
 const mails=[];let reads=0;const NativeDate=Date;class FixedDate extends NativeDate{constructor(...x){super(...(x.length?x:[time]));}}
 const ctx={Date:FixedDate,Utilities:{formatDate:(d,tz,fmt)=>{assert.equal(tz,'Asia/Taipei');assert.equal(fmt,'yyyy-MM-dd');return new Intl.DateTimeFormat('sv-SE',{timeZone:tz}).format(d);}},STORES:['SYNTH_STORE_1','SYNTH_STORE_2'],readData:(date,segment)=>{reads++;assert.equal(segment,seg);return filled?Object.fromEntries(['SYNTH_STORE_1','SYNTH_STORE_2'].map(s=>[s,{aq999:1,haosu:2,rt1399:3}])):{};},MailApp:{sendEmail:(...x)=>mails.push(x)},NOTIFY_EMAIL:'synthetic@example.invalid',ScriptApp:new Proxy({},{get:()=>{throw Error('TRIGGER_MUTATION_FORBIDDEN');}})};
 vm.createContext(ctx);vm.runInContext(code,ctx);const result=ctx.checkSegAndNotify(seg);
 assert.equal(reads,skip?0:1);assert.equal(mails.length,skip?0:1);
 if(skip){assert.equal(result.status,'skipped');assert.equal(result.date,'2026-10-24');assert.equal(result.segment,seg);}else{assert.match(mails[0][1],new RegExp(seg+':00'));assert.match(mails[0][1],filled?/全數回報完成/:/未回報/);}
});
