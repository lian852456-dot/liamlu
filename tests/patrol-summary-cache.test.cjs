const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../patrol.html'),'utf8');
function harness(){
 const map=new Map();const sessionStorage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const c=vm.createContext({sessionStorage,Date,Number,JSON,currentMonth:'2026-09',esc:s=>s});
 vm.runInContext(html.slice(html.indexOf("const PATROL_SUMMARY_CACHE_PREFIX="),html.indexOf('function clearPatrolAuthState()')),c);return {c,map};
}
test('cache stores only aggregate whitelist and isolates months and contracts',()=>{
 const {c,map}=harness();c.savePatrolSummaryCache('2026-09',{month:'2026-09',visitedStores:4,fullyDoneStores:4,inspector:'PRIVATE_CANARY',rows:[{token:'TOKEN_CANARY'}]},null);
 assert.equal(c.readPatrolSummaryCache('2026-09').fullyDoneStores,null);assert.equal(c.readPatrolSummaryCache('2026-10'),null);
 assert.equal(/PRIVATE_CANARY|TOKEN_CANARY|inspector|rows/.test([...map.values()].join('')),false);
 c.savePatrolSummaryCache('2026-09',{month:'2026-09'},{visitedStores:4,fullyDoneStores:2,stores:[{name:'PRIVATE_CANARY'}]});
 assert.equal(c.readPatrolSummaryCache('2026-09').fullyDoneStores,2);assert.match(c.patrolCachedSummaryHTML(),/上次成功資料/);
 c.clearPatrolSummaryCache();assert.equal(map.size,0);
});
test('malformed or incompatible cache clears safely',()=>{
 const {c,map}=harness();c.savePatrolSummaryCache('2026-09',{month:'2026-09',visitedStores:1,fullyDoneStores:0},null);
 const key=[...map.keys()][0],v=JSON.parse(map.get(key));v.contract='old';map.set(key,JSON.stringify(v));
 assert.equal(c.readPatrolSummaryCache('2026-09'),null);assert.equal(map.size,0);
});
test('logout and revocation clear cached aggregates; transient failures do not',()=>{
 assert.match(html.slice(html.indexOf('function clearPatrolAuthState()'),html.indexOf("localStorage.removeItem('bei12b_pt_key');",html.indexOf('function clearPatrolAuthState()'))),/clearPatrolSummaryCache/);
 assert.match(html,/if\(reason==='AUTH_SESSION_REVOKED'\)clearPatrolSummaryCache\(\)/);
 const wrapper=html.slice(html.indexOf('async function patrolReadRequest('),html.indexOf('function patrolReauthFailure'));
 assert.doesNotMatch(wrapper,/clearPatrol|removeItem|PT_TOKEN\s*=/);
});
