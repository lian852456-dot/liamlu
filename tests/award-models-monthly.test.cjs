const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Catalog=require('../award-model-catalog.js');
const controller=require('../awards-battle-controller.js');
const config=require('../config/award-config-2026-10.json');

test('shared October catalog equals persisted configuration and keeps all reward tiers',()=>{
  assert.deepEqual(Catalog.october,config);
  assert.equal(Catalog.expectedCount('2026-08-31'),13);
  assert.equal(Catalog.expectedCount('2026-09-30'),10);
  assert.equal(Catalog.expectedCount('2026-10-01'),10);
  const manager=config.rewardRules.find(row=>row.role==='manager').amounts;
  const supervisor=config.rewardRules.find(row=>row.role==='supervisor').amounts;
  assert.deepEqual(manager['ZFold8Ultra/ZFold8/ZFlip8'],[610,780,910,1040,1305]);
  assert.deepEqual(manager['V80Lite'],[910,1170,1370,1565,1955]);
  assert.deepEqual(supervisor['A6x6G/128G/A7Pro'],[905,1115,1395,1675,2095]);
  assert.equal(new Set(Catalog.definitions('2026-10-01').map(row=>row.modelId)).size,10);
  for(const role of config.rewardRules) {
    assert.deepEqual(Object.keys(role.amounts),config.selectedModels);
    assert.ok(Object.values(role.amounts).every(values=>values.length===(role.role==='seller'?3:5)));
  }
});
test('October validates the model identities, rejecting duplicate or stale combinations',()=>{
  const items=config.modelGroups.map(group=>({name:group.modelId}));
  assert.equal(Catalog.selectionMatches(items,'2026-10-01'),true);
  assert.equal(Catalog.selectionMatches(config.modelGroups.map(group=>({display_name:group.displayName})),'2026-10-01'),true);
  assert.equal(Catalog.selectionMatches(items.map((row,i)=>i?row:{name:'S26Ultra/ZFold8/ZFold8Ultra'}),'2026-10-01'),false);
  assert.equal(Catalog.selectionMatches(items.map((row,i)=>i===8?{name:'V70FE'}:row),'2026-10-01'),false);
  assert.equal(Catalog.selectionMatches(items.map((row,i)=>i===9?items[0]:row),'2026-10-01'),false);
});
test('October battle accepts ten canonical items, cutoff takes precedence over send month',()=>{
  const items=config.selectedModels.map(name=>({name,display_name:name,actual:0,target:10,rate:0}));
  const stores=['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
  const data={report_date:'2026-10-01',report_run_date:'2026-10-02',data_as_of_date:'2026-10-01',
    processing_run_id:'oct',phone_items:10,store_rows:10,supervisor:{},
    overall:{items},stores:stores.map(store=>({store,items}))};
  const kpi={report_date:'2026-10-02',data_as_of_date:'2026-10-01'};
  assert.equal(controller.validateAwardsBattle(data,kpi,{processing_run_id:'oct'}).ok,true);
  assert.equal(controller.validateAwardsBattle({...data,overall:{items:items.map((item,i)=>i?item:{name:'S26Ultra/ZFold8/ZFold8Ultra'})}},kpi,{processing_run_id:'oct'}).ok,false);
  const september={...data,report_date:'2026-09-30',report_run_date:'2026-10-01',data_as_of_date:'2026-09-30',
    overall:{items:items.map(item=>({name:'September source'}))}};
  assert.equal(controller.validateAwardsBattle(september,{report_date:'2026-10-01',data_as_of_date:'2026-09-30'},{processing_run_id:'oct'}).ok,true);
});
test('monthly frontend IDs agree with backend IDs and changed groups have independent keys',()=>{
  const gas=fs.readFileSync(require('node:path').join(__dirname,'../gas/Code.gs'),'utf8');
  const ids=new Function('PropertiesService',gas+';return reportAwardModelIds_("2026-10-01");')({getScriptProperties:()=>({getProperty:()=>''})});
  assert.deepEqual(ids,Catalog.definitions('2026-10-01').map(row=>row.modelId));
  assert.ok(!ids.includes('s26u-zfold8-family'));
  assert.ok(!ids.includes('vivo-x300-v70fe'));
  assert.ok(!ids.includes('samsung-a27-a17'));
});
