const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../tradein-sharing.mjs'),'utf8');
function fixture(){
  const nodes=new Map(),requests=[],session=new Map(),local=new Map(),events=new Map();let handle=async()=>({status:'ok',cases:[]});
  function element(tag='div'){return {tag,value:'',hidden:false,disabled:false,checked:false,files:[],textContent:'',dataset:{},children:[],listeners:{},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(k,fn){this.listeners[k]=fn;},focus(){},reset(){for(const id of ['shareInputStore','shareInputAuthor','shareScenario','shareApproach','shareOutcome'])get(id).value='';get('shareImage').files=[];get('shareConsent').checked=false;get('shareRemoveImage').checked=false;}};}
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};get('periodMonth').value='2026-10';get('shareType').value='成功成交';get('shareView').value='daily';
  const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}),clock=new Map();let time=0;
  const ctx=vm.createContext({document:{hidden:false,getElementById:get,createElement:element,addEventListener:(name,fn)=>events.set('document:'+name,fn)},window:{TradeinPerformanceCore:{STORES:[['SYNTHETIC','永吉']]},addEventListener:(name,fn)=>events.set(name,fn)},sessionStorage:storage(session),localStorage:storage(local),AbortController,Date,crypto:{randomUUID:()=> 'SYNTHETIC_UUID_000001'},setTimeout:fn=>{clock.set(++time,fn);return time;},clearTimeout:id=>clock.delete(id),fetch:async(url,options)=>{const p=JSON.parse(options.body);requests.push(p);return {ok:true,json:async()=>handle(p)};}});
  vm.runInContext(source,ctx);
  function login(){session.set('north12b_password_session_v1',JSON.stringify({v:1,owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',deviceId:'SYNTHETIC_DEVICE',token:'SYNTHETIC_TOKEN',expiresAt:Date.now()+60000,logoutEpoch:''}));}
  function fill(){for(const [id,v] of [['shareInputStore','永吉'],['shareInputAuthor','合成姓名'],['shareScenario','合成情境'],['shareApproach','合成話術'],['shareOutcome','合成心得']])get(id).value=v;get('shareConsent').checked=true;}
  return {get,session,events,requests,login,fill,handle:fn=>handle=fn,refresh:()=>vm.runInContext('load()',ctx),submit:()=>get('shareForm').listeners.submit({preventDefault(){}})};
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
