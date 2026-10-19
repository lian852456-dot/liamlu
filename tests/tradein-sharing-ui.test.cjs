const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../tradein-sharing.mjs'),'utf8');
function fixture(shared=new Map(),denyStorage=false){
  const nodes=new Map(),requests=[],session=shared,local=new Map(),events=new Map();let handle=async()=>({status:'ok',cases:[]});
  function element(tag='div'){return {tag,value:'',hidden:false,disabled:false,checked:false,files:[],textContent:'',dataset:{},children:[],listeners:{},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(k,fn){this.listeners[k]=fn;},focus(){},reset(){for(const id of ['shareInputStore','shareInputAuthor','shareScenario','shareApproach','shareOutcome'])get(id).value='';get('shareImage').files=[];get('shareConsent').checked=false;get('shareRemoveImage').checked=false;}};}
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};get('periodMonth').value='2026-10';get('shareType').value='成功成交';get('shareView').value='daily';
  const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>{if(denyStorage)throw Error("STORAGE_DENIED");map.set(k,v);},removeItem:k=>map.delete(k)}),clock=new Map();let time=0;
  const ctx=vm.createContext({document:{hidden:false,getElementById:get,createElement:element,addEventListener:(name,fn)=>events.set('document:'+name,fn)},window:{TradeinPerformanceCore:{STORES:[['SYNTHETIC','永吉']]},addEventListener:(name,fn)=>events.set(name,fn)},sessionStorage:storage(session),localStorage:storage(local),AbortController,Date,FileReader:class{readAsDataURL(){this.result='data:image/png;base64,U1lOVEhFVElD';this.onload();}},crypto:{randomUUID:()=> 'SYNTHETIC_UUID_000001'},setTimeout:fn=>{clock.set(++time,fn);return time;},clearTimeout:id=>clock.delete(id),fetch:async(url,options)=>{const p=JSON.parse(options.body);requests.push(p);return {ok:true,json:async()=>handle(p)};}});
  vm.runInContext(source,ctx);
  function login(){session.set('north12b_password_session_v1',JSON.stringify({v:1,owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',deviceId:'SYNTHETIC_DEVICE',token:'SYNTHETIC_TOKEN',expiresAt:Date.now()+60000,logoutEpoch:''}));}
  function fill(){for(const [id,v] of [['shareInputStore','永吉'],['shareInputAuthor','合成姓名'],['shareScenario','合成情境'],['shareApproach','合成話術'],['shareOutcome','合成心得']])get(id).value=v;get('shareConsent').checked=true;}
  return {get,session,events,requests,login,fill,document:ctx.document,clock,run:s=>vm.runInContext(s,ctx),input:id=>get('shareForm').listeners.input({target:{id}}),handle:fn=>handle=fn,refresh:()=>vm.runInContext('load()',ctx),submit:()=>get('shareForm').listeners.submit({preventDefault(){}})};
}
const row={id:'SYNTHETIC_CASE_0001',month:'2026-10',version:1,store:'永吉',author:'合成姓名',authorUnverified:true,type:'成功成交',scenario:'<img src=x onerror=alert(1)>',approach:'合成話術',outcome:'合成心得',createdAt:'2026-10-19T00:00:00Z',createdDate:'2026-10-19',updatedAt:'2026-10-19T00:00:00Z',editable:false};
test('anonymous bounded list safely renders unverified names and peer text without auth proof',async()=>{
  const f=fixture();f.handle(async()=>({status:'ok',cases:[row]}));await f.refresh();assert.equal(f.requests[0].action,'tradein_sharing_public_list');assert.equal(f.requests[0].start,f.requests[0].end);assert.ok(!('token' in f.requests[0]));
  const card=f.get('shareList').children[0];assert.equal(card.children.find(x=>x.textContent===row.scenario).tag,'p');assert.ok(card.children.some(x=>x.textContent.includes('自填未驗證')));assert.ok(!card.children.some(x=>x.tag==='img'));
});
test('private list requires original login and logout suppresses late response and clears private editor',async()=>{
  const f=fixture();f.get('sharePrivate').checked=true;await f.refresh();assert.equal(f.requests.length,0);
  f.login();f.get('sharePrivate').checked=true;f.fill();let release;f.handle(()=>new Promise(resolve=>release=resolve));const pending=f.refresh();await new Promise(setImmediate);f.events.get('portal-before-logout')();release({status:'ok',profile:{store:'永吉',author:'舊＊名'},cases:[row]});await pending;
  assert.equal(f.get('shareList').children.length,0);assert.equal(f.get('sharePrivate').checked,false);assert.equal(f.get('shareScenario').value,'');assert.equal(f.get('shareRefresh').disabled,false);
});
test('ambiguous create blocks retry until readback and never automatically resends',async()=>{
  const f=fixture();f.fill();f.handle(p=>{if(p.action.endsWith('_create'))throw Error('SYNTHETIC_NETWORK_FAILURE');return {status:'ok',cases:[],found:false};});await f.submit();await f.submit();assert.equal(f.requests.filter(p=>p.action.endsWith('_create')).length,1);assert.match(f.get('shareMessage').textContent,/先按「讀取分享」/);await f.refresh();
  assert.ok(f.requests.some(p=>p.action.endsWith('_receipt')));assert.equal(f.requests.filter(p=>p.action.endsWith('_create')).length,1);
});
test('lost create response is resolved by receipt without issuing a second write',async()=>{
  const f=fixture();f.fill();f.handle(p=>{if(p.action.endsWith('_create'))throw Error('LOST_RESPONSE');return p.action.endsWith('_receipt')?{status:'ok',found:true,item:row}:{status:'ok',cases:[row]};});await f.submit();await f.refresh();assert.equal(f.requests.filter(p=>p.action.endsWith('_create')).length,1);assert.equal(f.get('shareInputAuthor').value,'');assert.equal(f.get('shareEditor').open,false);
});
test('sharing range is independent of progress month and never loads unbounded history',async()=>{
  const f=fixture();f.get('shareView').value='range';await f.refresh();assert.equal(f.requests.length,1);assert.equal(f.requests[0].start.slice(8),'01');assert.ok(f.requests[0].end>=f.requests[0].start);assert.equal(f.get('periodMonth').value,'2026-10');
  f.get('shareStart').value='2026-01-01';f.get('shareEnd').value='2026-12-31';await f.refresh();assert.equal(f.requests.length,1);assert.match(f.get('shareMessage').textContent,/93/);
});

test('ambiguous authenticated edit reads version and content, not merely the existing case ID',async()=>{
 const f=fixture();f.login();f.get('sharePrivate').checked=true;f.get('shareDay').value='2026-10-19';f.handle(async()=>({status:'ok',profile:{store:'永吉',author:'舊＊名',supervisor:false},cases:[{...row,editable:true}]}));await f.refresh();
 const card=f.get('shareList').children[0],actions=card.children.at(-1);actions.children.find(x=>x.textContent==='編輯').onclick();await new Promise(setImmediate);f.get('shareOutcome').value='合成新心得';
 f.handle(p=>{if(p.action.endsWith('_save'))throw Error('LOST_EDIT_RESPONSE');return {status:'ok',profile:{store:'永吉',author:'舊＊名',supervisor:false},cases:[{...row,editable:true}]};});await f.submit();await f.refresh();
 assert.equal(f.get('shareOutcome').value,'合成新心得');assert.equal(f.get('shareEditorTitle').textContent,'編輯分享（建立日不變）');assert.equal(f.requests.filter(p=>p.action.endsWith('_save')).length,1);
 f.handle(p=>p.action.endsWith('_save')?{status:'ok',item:{...row,version:2,outcome:'合成新心得'}}:{status:'ok',profile:{supervisor:false},cases:[]});await f.submit();assert.equal(f.requests.filter(p=>p.action.endsWith('_save')).length,2);
});

test('explicit authenticated original-month view preserves legacy case access across created-date buckets',async()=>{
 const f=fixture();f.login();f.get('sharePrivate').checked=true;f.get('shareView').value='legacy';f.get('shareLegacyMonth').value='2026-09';f.handle(async()=>({status:'ok',profile:{supervisor:false},cases:[{...row,month:'2026-09',createdDate:'2026-10-01',editable:true}]}));await f.refresh();
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].action,'employee_tradein_sharing_list');assert.equal(f.requests[0].month,'2026-09');assert.equal(f.get('shareList').children[0].tag,'article');assert.match(f.get('shareMessage').textContent,/原分享月份 2026-09/);assert.equal(f.get('periodMonth').value,'2026-10');
});
const DK='north12b_tradein_new_draft_v1';
const cache=f=>JSON.parse(f.session.get(DK)||'null');
const writes=f=>f.requests.filter(p=>/_(create|save|moderate)$/.test(p.action));
function typed(f){f.fill();f.input('shareOutcome');}
test('hidden/pageshow retain unsent text and actual same-document File without publishing',()=>{
 const f=fixture();typed(f);const file={name:'SYNTHETIC.png',size:64,type:'image/png'};f.get('shareImage').files=[file];f.document.hidden=true;f.events.get('document:visibilitychange')();f.document.hidden=false;f.events.get('document:visibilitychange')();f.events.get('pagehide')({persisted:true});f.events.get('pageshow')({persisted:true});assert.equal(f.get('shareScenario').value,'合成情境');assert.equal(f.get('shareImage').files[0],file);assert.equal(writes(f).length,0);
});
test('reload offers explicit per-tab restore, never auto-inserts previous person text',()=>{
 const f=fixture();typed(f);const next=fixture(f.session);assert.equal(next.get('shareScenario').value,'');assert.equal(next.get('shareDraftNotice').hidden,false);next.get('shareDraftRestore').onclick();assert.equal(next.get('shareScenario').value,'合成情境');assert.equal(next.get('shareConsent').checked,false);assert.equal(writes(next).length,0);assert.equal(fixture().get('shareDraftNotice').hidden,true);
});
test('draft only contains new self text and pending nonce; no image, consent, token or response',()=>{
 const f=fixture();f.login();typed(f);f.get('shareImage').files=[{name:'SYNTHETIC.png',size:64,type:'image/png'}];f.get('shareImage').listeners.change();const raw=f.session.get(DK);assert.ok(cache(f).imageWasSelected);assert.doesNotMatch(raw,/SYNTHETIC_TOKEN|SYNTHETIC_DEVICE|base64|consent|profile|cases/i);assert.deepEqual(Object.keys(cache(f)).sort(),['fields','imageWasSelected','savedAt','v']);
});
test('restored image requires reselect; consent must be checked again',async()=>{
 const f=fixture();typed(f);f.get('shareImage').files=[{name:'SYNTHETIC.png',size:64,type:'image/png'}];f.get('shareImage').listeners.change();const next=fixture(f.session);next.get('shareDraftRestore').onclick();next.get('shareConsent').checked=true;await next.submit();assert.equal(writes(next).length,0);assert.match(next.get('shareMessage').textContent,/圖片未保存在草稿/);next.get('shareImage').files=[{name:'SYNTHETIC.png',size:64,type:'image/png'}];next.get('shareConsent').checked=false;await next.submit();assert.equal(writes(next).length,0);assert.match(next.get('shareMessage').textContent,/公開/);
});
test('successful create clears text/image cache, rejected create retains draft',async()=>{
 const f=fixture();typed(f);f.handle(p=>p.action.endsWith('_create')?{status:'error',code:'SHARE_CAPACITY'}:{status:'ok',cases:[]});await f.submit();assert.ok(cache(f));assert.equal(f.get('shareScenario').value,'合成情境');await f.refresh();f.handle(p=>p.action.endsWith('_create')?{status:'ok',item:row}:{status:'ok',cases:[]});await f.submit();assert.equal(cache(f),null);assert.equal(f.get('shareScenario').value,'');
});
test('ambiguous create survives reload and reads receipt before same-nonce explicit retry',async()=>{
 const f=fixture();typed(f);f.handle(()=>{throw Error('LOST_RESPONSE');});await f.submit();const nonce=writes(f)[0].requestId;assert.equal(cache(f).pending.requestId,nonce);const next=fixture(f.session);next.get('shareDraftRestore').onclick();next.get('shareConsent').checked=true;await next.submit();assert.equal(writes(next).length,0);assert.match(next.get('shareMessage').textContent,/先按「讀取分享」/);next.handle(p=>p.action.endsWith('_receipt')?{status:'ok',found:false}:{status:'ok',cases:[]});await next.refresh();assert.equal(writes(next).length,0);next.handle(p=>p.action.endsWith('_create')?{status:'ok',item:row}:{status:'ok',cases:[]});await next.submit();assert.equal(writes(next)[0].requestId,nonce);assert.equal(cache(next),null);
});
test('receipt found after reload clears draft without second write',async()=>{
 const f=fixture();typed(f);f.handle(()=>{throw Error('LOST_RESPONSE');});await f.submit();const next=fixture(f.session);next.get('shareDraftRestore').onclick();next.handle(p=>p.action.endsWith('_receipt')?{status:'ok',found:true,item:row}:{status:'ok',cases:[]});await next.refresh();assert.equal(cache(next),null);assert.equal(writes(next).length,0);
});
test('readback failure preserves frozen submitted content even if visible fields changed',async()=>{
 const f=fixture();typed(f);f.handle(()=>{throw Error('OFFLINE');});await f.submit();f.get('shareScenario').value='已改字但尚未確認';f.input('shareScenario');await f.refresh();assert.equal(cache(f).fields.shareScenario,'合成情境');assert.ok(cache(f).pending);assert.equal(writes(f).length,1);
});
test('login expiry preserves new draft but private existing case edit never persists',async()=>{
 const f=fixture();f.login();f.get('sharePrivate').checked=true;f.get('shareDay').value='2026-10-19';f.handle(()=>({status:'ok',profile:{supervisor:false},cases:[{...row,editable:true}]}));await f.refresh();typed(f);[...f.clock.values()].forEach(fn=>fn());assert.equal(f.get('shareScenario').value,'合成情境');assert.equal(f.get('shareList').children.length,0);await f.refresh();f.get('sharePrivate').checked=true;await f.refresh();f.get('shareList').children[0].children.at(-1).children.find(x=>x.textContent==='編輯').onclick();await new Promise(setImmediate);f.input('shareScenario');assert.equal(cache(f),null);f.events.get('pagehide')();assert.equal(f.get('shareScenario').value,'');
});
test('logout/login change clears self draft and no other stored keys',()=>{
 for(const mode of ['portal-before-logout','portal-login-changed','storage']){const f=fixture();typed(f);f.session.set('unrelated','keep');f.events.get(mode)({key:'north12b_portal_logout_event_v1'});assert.equal(cache(f),null);assert.equal(f.get('shareScenario').value,'');assert.equal(f.session.get('unrelated'),'keep');}
});
test('identity change blocks accidental carryover; next person clears old body and File',async()=>{
 const f=fixture();typed(f);f.get('shareImage').files=[{name:'previous.png'}];f.get('shareInputAuthor').value='另一位合成人員';f.input('shareInputAuthor');assert.equal(cache(f),null);assert.equal(f.get('shareIdentityNotice').hidden,false);f.get('shareConsent').checked=true;await f.submit();assert.equal(writes(f).length,0);f.get('shareIdentityNew').onclick();assert.equal(f.get('shareInputAuthor').value,'另一位合成人員');assert.equal(f.get('shareScenario').value,'');assert.equal(f.get('shareImage').files.length,0);
});
test('same person typo correction requires explicit keep and new consent',()=>{
 const f=fixture();typed(f);f.get('shareInputAuthor').value='合成姓名修正';f.input('shareInputAuthor');f.get('shareIdentityKeep').onclick();assert.equal(f.get('shareConsent').checked,false);assert.equal(cache(f).fields.shareScenario,'合成情境');assert.equal(cache(f).fields.shareInputAuthor,'合成姓名修正');
});
test('expired/corrupt/oversize drafts are discarded and never rendered',()=>{
 const f=fixture();typed(f);for(const raw of [JSON.stringify({...cache(f),savedAt:Date.now()-7200001}),'{bad','x'.repeat(12001)]){const map=new Map([[DK,raw]]),next=fixture(map);assert.equal(next.get('shareDraftNotice').hidden,true);assert.equal(map.has(DK),false);assert.equal(next.get('shareScenario').value,'');}
});
test('storage denial preserves current DOM and gives accurate reload limitation',()=>{
 const f=fixture(new Map(),true);typed(f);f.events.get('pagehide')();assert.equal(f.get('shareScenario').value,'合成情境');assert.match(f.get('shareDraftStatus').textContent,/無法暫存/);assert.equal(writes(f).length,0);
});
test('list failure before manual recovery does not destroy stored draft',async()=>{
 const f=fixture();typed(f);const next=fixture(f.session);next.handle(()=>{throw Error('OFFLINE');});await next.refresh();assert.ok(cache(next));assert.equal(next.get('shareDraftNotice').hidden,false);next.get('shareDraftRestore').onclick();assert.equal(next.get('shareScenario').value,'合成情境');
});
test('list/date failures retain unsent new text and do not change progress month',async()=>{
 const f=fixture();typed(f);f.handle(()=>{throw Error('OFFLINE');});await f.refresh();f.get('shareDay').listeners.change();assert.equal(f.get('shareScenario').value,'合成情境');assert.equal(f.get('periodMonth').value,'2026-10');assert.equal(writes(f).length,0);
});
test('background save and restore do not extend TTL without a new text/image change',()=>{
 const f=fixture();typed(f);const d=cache(f);d.savedAt=Date.now()-3600000;f.session.set(DK,JSON.stringify(d));const next=fixture(f.session);next.get('shareDraftRestore').onclick();next.events.get('pagehide')();assert.equal(cache(next).savedAt,d.savedAt);next.run('draftSavedAt=Date.now()-7200001');next.events.get('pageshow')();assert.equal(next.get('shareScenario').value,'');assert.equal(cache(next),null);
});
test('restored authenticated new draft keeps ID and requires proof for readback',async()=>{
 const f=fixture();f.login();typed(f);f.handle(()=>{throw Error('LOST');});await f.submit();const id=writes(f)[0].id;const next=fixture(f.session);next.get('shareDraftRestore').onclick();next.handle(()=>({status:'ok',profile:{supervisor:false},cases:[]}));await next.refresh();assert.equal(next.requests[0].action,'employee_tradein_sharing_list');next.get('shareConsent').checked=true;next.handle(p=>p.action.endsWith('_save')?{status:'ok',item:row}:{status:'ok',cases:[]});await next.submit();assert.equal(writes(next)[0].id,id);assert.equal(writes(next)[0].version,0);
});
test('reselected oversized/unsupported image is rejected before any request',async()=>{
 for(const file of [{type:'image/png',size:800*1024+1},{type:'image/svg+xml',size:10}]){const f=fixture();typed(f);f.get('shareImage').files=[file];await f.submit();assert.equal(writes(f).length,0);assert.match(f.get('shareMessage').textContent,/800 KB/);assert.ok(cache(f));}
});
test('draft cache rejects unexpected properties rather than carrying arbitrary cached data',()=>{
 const f=fixture();typed(f);const d={...cache(f),image:'data:image/png;base64,NOT_ALLOWED'};const next=fixture(new Map([[DK,JSON.stringify(d)]]));assert.equal(next.get('shareDraftNotice').hidden,true);assert.equal(cache(next),null);
});

test('ambiguous private edit clears visible editor on background but keeps in-memory readback guard without caching private text',async()=>{
 const f=fixture();f.login();f.get('sharePrivate').checked=true;f.get('shareDay').value='2026-10-19';f.handle(()=>({status:'ok',profile:{supervisor:false},cases:[{...row,editable:true}]}));await f.refresh();f.get('shareList').children[0].children.at(-1).children.find(x=>x.textContent==='編輯').onclick();await new Promise(setImmediate);f.get('shareOutcome').value='合成私有修訂';f.handle(()=>{throw Error('LOST_EDIT');});await f.submit();f.events.get('pagehide')();f.events.get('pagehide')();assert.equal(f.get('shareOutcome').value,'');assert.equal(cache(f),null);await f.submit();assert.equal(writes(f).length,1);assert.match(f.get('shareMessage').textContent,/先按「讀取分享」/);
});
