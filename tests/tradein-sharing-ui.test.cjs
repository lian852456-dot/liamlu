const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../tradein-sharing.mjs'),'utf8');
function fixture(){
  const nodes=new Map(),requests=[],session=new Map(),local=new Map(),events=new Map();let handle=async()=>({status:'ok',profile:{store:'合成店',author:'合＊甲',supervisor:false},cases:[]});
  function element(tag='div'){
    return {tag,value:'',hidden:false,disabled:false,checked:false,files:[],textContent:'',dataset:{},children:[],listeners:{},
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},querySelectorAll(){return [];},querySelector(){return null;},
      addEventListener(k,fn){this.listeners[k]=fn;},focus(){},reset(){for(const id of ['shareScenario','shareApproach','shareOutcome'])get(id).value='';get('shareImage').files=[];get('shareRemoveImage').checked=false;}};
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};get('periodMonth').value='2026-10';get('shareType').value='成功成交';
  const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)});
  const clock=new Map();let time=0;
  const ctx=vm.createContext({document:{hidden:false,getElementById:get,createElement:element,addEventListener:(name,fn)=>events.set('document:'+name,fn)},window:{addEventListener:(name,fn)=>events.set(name,fn)},
    sessionStorage:storage(session),localStorage:storage(local),AbortController,Date,crypto:{randomUUID:()=> 'SYNTHETIC_UUID_001'},setTimeout:fn=>{clock.set(++time,fn);return time;},clearTimeout:id=>clock.delete(id),
    fetch:async(url,options)=>{const p=JSON.parse(options.body);requests.push(p);return {ok:true,json:async()=>handle(p)};}});
  vm.runInContext(source,ctx);
  function login(){session.set('north12b_password_session_v1',JSON.stringify({v:1,owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',deviceId:'SYNTHETIC_DEVICE',token:'SYNTHETIC_TOKEN',expiresAt:Date.now()+60000,logoutEpoch:''}));}
  return {get,session,events,requests,login,handle:fn=>handle=fn,refresh:()=>vm.runInContext('load()',ctx),submit:()=>get('shareForm').listeners.submit({preventDefault(){}})};
}
test('sharing does not send a request without login and safely renders text supplied by peers',async()=>{
  const f=fixture();await f.refresh();assert.equal(f.requests.length,0);assert.match(f.get('shareMessage').textContent,/登入/);
  f.login();f.handle(async()=>({status:'ok',profile:{store:'合成店',author:'合＊甲',supervisor:false},cases:[{id:'SYNTHETIC_CASE',store:'合成店',author:'合＊乙',type:'成功成交',scenario:'<img src=x onerror=alert(1)>',approach:'合成話術',outcome:'合成心得',updatedAt:'2026-10-19T00:00:00Z',editable:false}]}));
  await f.refresh();assert.equal(f.get('shareWorkspace').hidden,false);
  const card=f.get('shareList').children[0];assert.equal(card.children.find(x=>x.textContent==='<img src=x onerror=alert(1)>').tag,'p');
  assert.ok(!card.children.some(x=>x.tag==='img'));assert.equal(f.get('shareAuthor').textContent,'合成店 · 合＊甲（自動帶入）');
});
test('logout invalidates an in-flight response and re-enables controls without exposing the private list',async()=>{
  const f=fixture();f.login();let release;f.handle(()=>new Promise(resolve=>release=resolve));
  const pending=f.refresh();await new Promise(setImmediate);f.events.get('portal-before-logout')();
  release({status:'ok',profile:{store:'合成店',author:'合＊甲'},cases:[]});await pending;
  assert.equal(f.get('shareWorkspace').hidden,true);assert.equal(f.get('shareList').children.length,0);assert.equal(f.get('shareRefresh').disabled,false);
});
test('ambiguous save is never automatically resent and retains its opaque case ID',async()=>{
  const f=fixture();f.login();await f.refresh();f.get('shareScenario').value='合成情境';f.get('shareApproach').value='合成話術';f.get('shareOutcome').value='合成心得';
  f.handle(p=>{if(p.action.endsWith('_save'))throw Error('SYNTHETIC_NETWORK_FAILURE');return {status:'ok',cases:[],profile:{}};});
  await f.submit();const saved=f.requests.filter(p=>p.action.endsWith('_save'));assert.equal(saved.length,1);assert.equal(saved[0].id,'SYNTHETIC_UUID_001');assert.equal(saved[0].image,null);
  assert.equal(f.get('shareScenario').value,'合成情境');assert.equal(f.get('shareSave').disabled,false);
});
