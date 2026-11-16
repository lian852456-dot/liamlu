'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../kpi-battle-controller.js');
const gas=fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8');
const catalog=vm.runInNewContext(gas.match(/const KPICALC_ITEMS = (\[[\s\S]*?\n\]);/)[1]);
test('approved AQ/RT and addon/DEVICE grouping covers all 25 current source keys exactly once',()=>{
 const keys=Array.from(catalog,row=>row[0]),groups=C.kpiBattleDetailGroups(keys);
 assert.deepEqual(groups.map(group=>[group.id,group.keys.length]),[['core',14],['addon',11],['other',0]]);
 assert.deepEqual(groups.flatMap(group=>group.keys).sort(),[...keys].sort());
 assert.ok(groups[0].keys.includes('TTL AQ上線點數'));
 assert.ok(groups[0].keys.includes('預付卡開卡面額'));
 assert.ok(groups[0].keys.includes('高高特維用戶續約數'));
 assert.ok(groups[0].keys.includes('解約後NP OUT(督導績)'));
 assert.deepEqual(groups[1].keys.slice(0,2),['Device專案銷售數','重點Device銷售量']);
 assert.ok(groups[1].keys.includes('Apple&Google服務及雜誌週刊開通數'));
});
test('unknown source fields are retained without guessing their category or mutating input',()=>{
 const input=['Device新來源待核','AQ V+D 999 (含)以上','Device新來源待核'],before=[...input];
 const groups=C.kpiBattleDetailGroups(input);
 assert.deepEqual(groups[0].keys,['AQ V+D 999 (含)以上']);assert.deepEqual(groups[1].keys,[]);
 assert.deepEqual(groups[2].keys,['Device新來源待核']);assert.deepEqual(input,before);
});
test('source catalog survives a missing metric; targets, actuals and report rates are unchanged',()=>{
 const raw={meta:{month:'2026-11',snapshotDay:8,monthDays:30},items:[{key:'Device專案銷售數'},{key:'預付卡開卡面額'}],stores:[{name:'合成門市',code:'S1',items:{'預付卡開卡面額':{t:101,a:7,reportRate:1.23}}}],persons:[]};
 const before=JSON.stringify(raw),view=C.kpicalcToKpiBattleView(raw);
 assert.deepEqual(C.kpiBattleDetailGroups(view.metric_keys).slice(0,2).map(group=>group.keys),[['預付卡開卡面額'],['Device專案銷售數']]);
 const metric=view.stores[0].metrics['預付卡開卡面額'];assert.equal(metric.target,101);assert.equal(metric.actual,7);assert.equal(metric.rate,1.23);
 assert.equal(JSON.stringify(raw),before);
});
