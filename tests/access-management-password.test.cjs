'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../access-management.js'),'utf8');
function fixture({confirm=true,failRotation=false,delayDerive=false}={}){
 const elements=new Map(),requests=[];let version=7,release;
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,hidden:false,replaceChildren(){},append(){}});return elements.get(id);};
 const subtle=crypto.webcrypto.subtle;
 const ctx=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[],createElement:()=>({append(){}})},window:{addEventListener(){}},AbortController,TextEncoder,Uint8Array,confirm:()=>confirm,
 crypto:{getRandomValues:a=>crypto.webcrypto.getRandomValues(a),subtle:{importKey:(...a)=>subtle.importKey(...a),deriveBits:async(...a)=>{if(delayDerive)await new Promise(r=>release=r);return subtle.deriveBits(...a);}}},
 fetch:async(url,options)=>{const p=JSON.parse(options.body);requests.push(p);if(p.action==='employee_admin_rotate_password'){if(failRotation)throw Error('SYNTHETIC_NETWORK_FAILURE');version++;return {ok:true,json:async()=>({status:'ok',passwordEpoch:version})};}return {ok:true,json:async()=>p.action==='employee_admin_list'?{status:'ok',passwordEpoch:version,roster:{updatedAt:1,validUntil:2},users:[]}:{status:'ok',requests:[]}};}});
 vm.runInContext(source,ctx);
 return {el,requests,release:()=>release?.(),ready:()=>Boolean(release),unlock:async()=>{el('secret').value='SYNTHETIC_ADMIN';await el('unlock').onsubmit({preventDefault(){}});},change:async(password='SYNTHETIC_NEW_PASSWORD')=>{el('new-password').value=password;el('confirm-password').value=password;await el('change-password').onsubmit({preventDefault(){}});}};
}
test('password UI sends only a fresh PBKDF2 verifier and reads back the incremented version',async()=>{
 const f=fixture();await f.unlock();await f.change();const p=f.requests.find(x=>x.action==='employee_admin_rotate_password');assert.ok(p);assert.equal(p.expectedEpoch,7);assert.equal(p.verifier.iterations,600000);assert.match(p.verifier.salt,/^[a-f0-9]{64}$/);assert.equal(p.verifier.digest,crypto.pbkdf2Sync('SYNTHETIC_NEW_PASSWORD',Buffer.from(p.verifier.salt,'hex'),600000,32,'sha256').toString('hex'));assert.equal(JSON.stringify(f.requests).includes('SYNTHETIC_NEW_PASSWORD'),false);assert.equal(f.el('new-password').value,'');assert.equal(f.el('confirm-password').value,'');assert.match(f.el('password-message').textContent,/已變更並讀回/);assert.match(f.el('password-version').textContent,/8/);
});
test('mismatch and declined confirmation cannot send a rotation request',async()=>{
 const f=fixture();await f.unlock();f.el('new-password').value='SYNTHETIC_NEW_PASSWORD';f.el('confirm-password').value='SYNTHETIC_DIFFERENT_PASSWORD';await f.el('change-password').onsubmit({preventDefault(){}});assert.equal(f.requests.some(p=>p.action==='employee_admin_rotate_password'),false);
 const g=fixture({confirm:false});await g.unlock();await g.change();assert.equal(g.requests.some(p=>p.action==='employee_admin_rotate_password'),false);
});
test('locking during derivation cancels submission and clears both password fields',async()=>{
 const f=fixture({delayDerive:true});await f.unlock();const pending=f.change();while(!f.ready())await new Promise(r=>setImmediate(r));f.el('lock').onclick();f.release();await pending;assert.equal(f.requests.some(p=>p.action==='employee_admin_rotate_password'),false);assert.equal(f.el('new-password').value,'');assert.equal(f.el('confirm-password').value,'');assert.equal(f.el('management').hidden,true);assert.equal(f.el('save-password').disabled,false);
});
test('ambiguous network outcome clears passwords and never automatically retries',async()=>{
 const f=fixture({failRotation:true});await f.unlock();await f.change();assert.equal(f.requests.filter(p=>p.action==='employee_admin_rotate_password').length,1);assert.match(f.el('password-message').textContent,/不要直接重送/);assert.equal(f.el('new-password').value,'');assert.equal(f.el('confirm-password').value,'');
});

test('ten-character passwords are accepted while nine characters are rejected',async()=>{
 const f=fixture();await f.unlock();await f.change('SYNTH12345');assert.equal(f.requests.filter(p=>p.action==='employee_admin_rotate_password').length,1);
 const g=fixture();await g.unlock();await g.change('SYNTH1234');assert.equal(g.requests.some(p=>p.action==='employee_admin_rotate_password'),false);assert.match(g.el('password-message').textContent,/10～128/);
});
