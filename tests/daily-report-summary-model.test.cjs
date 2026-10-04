const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../daily-report-summary-model.js');
const date='2099-10-02',stores=['通化','酒泉','台北三創'];
const row=(store,values={})=>({date,seg:16,store,...values});
const project=data=>M.project({status:'ok',data},date,16,stores);
test('strict numeric values preserve zero, reject null/blank/booleans/partial numbers/nonfinite/negative',()=>{
 for(const x of [null,undefined,'',' ',true,false,{},[],NaN,Infinity,'2x','0x10','Infinity',-1])assert.equal(M.number(x),null,String(x));
 for(const [input,n] of [[0,0],['0',0],[' 2.5 ',2.5],['1e2',100]])assert.equal(M.number(input),n);
});
test('32 original fields survive projection, management JSON and calculated ratios use raw pairs',()=>{
 assert.equal(M.fields.length,32);assert.equal(new Set(M.fields.map(([key])=>key)).size,32);
 const data=project({通化:row('通化',{aq999:'0',insurance_num:'1',insurance_den:'2',insurance_pct:99,management_focus_json:'{"op_online":"0","mycharge_clicked":1,"mycharge_tagged":4,"mycharge_pct":90}'})})[0];
 assert.equal(data.values.aq999,0);assert.equal(data.values.insurance_pct,50);assert.equal(data.values.mycharge_pct,25);assert.equal(data.values.op_online,0);assert.equal(data.status,'reported');assert.ok(data.missingFields.length);
});
test('only matching date/segment/store raw records are eligible; source mismatch fails closed',()=>{
 const records=project({通化:row('通化',{aq999:3}),酒泉:row('酒泉',{date:'2099-10-01',aq999:999}),台北三創:row('通化',{aq999:999})});
 assert.deepEqual(records.map(r=>r.status),['reported','unknown','unknown']);assert.deepEqual(M.sum(records,'aq999'),{value:3,coverage:1,total:3});
 for(const data of [null,undefined,[],true])assert.throws(()=>M.project({status:'ok',data},date,16,stores));
 assert.throws(()=>M.project({status:'ok',data:{},summary:{date,segment:21}},date,16,stores));
});
test('successful empty read means unreported; no raw values means null, never zero',()=>{
 const records=project({});assert.ok(records.every(r=>r.status==='missing'));assert.equal(M.sum(records,'aq999').value,null);
 assert.equal(M.ratio(records,'insurance_pct').rate,null);assert.equal(M.ratio(records,'insurance_pct').notApplicable,false);
});
test('insurance aggregates valid paired numerator/denominator with coverage, not mean of percentages',()=>{
 const records=project({通化:row('通化',{insurance_num:20,insurance_den:100}),酒泉:row('酒泉',{insurance_num:1,insurance_den:1}),台北三創:row('台北三創',{insurance_num:8,insurance_den:null})});
 assert.deepEqual(M.ratio(records,'insurance_pct'),{n:21,d:101,rate:21/101*100,coverage:2,total:3,notApplicable:false});
 const filtered=M.select(records,'酒泉','all');assert.equal(M.ratio(filtered,'insurance_pct').rate,100);assert.equal(M.ratio(filtered,'insurance_pct').total,1);
});
test('zero/zero is not applicable; zero/positive is 0%; invalid pairs are not counted',()=>{
 const zero=project({通化:row('通化',{insurance_num:0,insurance_den:0})});assert.equal(M.ratio(zero,'insurance_pct').notApplicable,true);assert.equal(M.ratio(zero,'insurance_pct').rate,null);
 const positive=project({通化:row('通化',{insurance_num:0,insurance_den:10}),酒泉:row('酒泉',{insurance_num:3,insurance_den:2})});assert.equal(M.ratio(positive,'insurance_pct').rate,0);assert.equal(M.ratio(positive,'insurance_pct').coverage,1);
});
test('reported is record presence, not completeness; management afternoon optional and evening gaps visible',()=>{
 const record=row('通化',{aq999:0});assert.ok(project({通化:record})[0].missingFields.length);assert.equal(project({通化:record})[0].managementMissing,false);
 const night=M.project({status:'ok',data:{通化:{...record,seg:21}}},date,21,stores)[0];assert.equal(night.managementMissing,true);
});
test('personal records remain in matched context and cannot survive failed pread via local fallback',()=>{
 const local={通化:{'合成人員':{date,seg:16,store:'通化',name:'合成人員',failed:[]}}};
 assert.equal(M.personal({status:'ok',data:{}},date,16,stores,local).通化.length,1);
 assert.equal(M.personal({status:'ok',data:local},date,21,stores,{}).通化.length,0);
 assert.throws(()=>M.personal({status:'error',data:{}},date,16,stores,local));
});
test('latest source time is real clock display, rejects invalid time',()=>{
 const rows=project({通化:row('通化',{savedAt:'下午 1:04:05'}),酒泉:row('酒泉',{savedAt:'23:59:59'}),台北三創:row('台北三創',{savedAt:'99:00'})});assert.equal(M.latest(rows),'23:59:59');
});

test('invalid evening MyCharge pair is visible as attention even with all raw fields present',()=>{
 const v={aq999:0,aq1399:0,haosu:0,rt999:0,rt1399:0,insurance_num:0,insurance_den:0,management_focus_json:JSON.stringify({op_online:0,op_accum:0,op_target:0,mycharge_clicked:3,mycharge_tagged:2})};
 const night=M.project({status:'ok',data:{通化:{...row('通化',v),seg:21}}},date,21,stores);
 assert.equal(night[0].missingFields.length,0);assert.equal(M.attention(night[0]),true);assert.equal(M.ratio(night,'mycharge_pct').coverage,0);assert.equal(M.select(night,'通化','attention').length,1);
 const afternoon=project({通化:row('通化',v)});assert.equal(M.attention(afternoon[0]),false);
});
test('mismatched local personal record cannot hide a valid current cloud record',()=>{
 const good={date,seg:16,store:'通化',name:'合成人員'};
 const cloud={status:'ok',data:{通化:{合成人員:good}}},local={通化:{合成人員:{...good,date:'2099-10-01'}}};
 assert.deepEqual(M.personal(cloud,date,16,stores,local).通化,[{name:'合成人員',record:good}]);
});

test('management JSON cannot override main/addon raw values; only its six defined keys are projected',()=>{
 const record=row('通化',{aq999:7,insurance_num:1,insurance_den:2,acc:100,op_online:999,management_focus_json:JSON.stringify({op_online:3,aq999:9000,insurance_num:9,insurance_den:9,acc:9999})});
 const projected=project({通化:record});assert.equal(projected[0].values.aq999,7);assert.equal(projected[0].values.insurance_num,1);assert.equal(projected[0].values.acc,100);assert.equal(projected[0].values.op_online,3);assert.equal(M.sum(projected,'aq999').value,7);assert.equal(M.ratio(projected,'insurance_pct').rate,50);
 assert.equal(project({通化:row('通化',{op_online:999,management_focus_json:'invalid'})})[0].values.op_online,null);
});
