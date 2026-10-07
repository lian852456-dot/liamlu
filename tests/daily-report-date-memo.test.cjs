const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const source=fs.readFileSync(process.env.DAILY_REPORT_GAS_SOURCE||path.join(__dirname,'../gas/Code.gs'),'utf8');
const fn=n=>{const i=source.indexOf('function '+n+'(');return source.slice(i,source.indexOf('\n}\n',i)+3);};
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'});
function setup(rows){
 let formatCalls=0,throwOnDate=false;const ranges=[];
 const ctx={Date,getSheet:()=>({getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,getRange:(r,c,n,w)=>({getValues:()=>{ranges.push({r,c,n,w,display:false});return rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w));},getDisplayValues:()=>{ranges.push({r,c,n,w,display:true});return rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w).map(String));}})}),Utilities:{formatDate(value,tz,pattern){formatCalls++;assert.equal(tz,'Asia/Taipei');assert.equal(pattern,'yyyy-MM-dd');if(throwOnDate)throw Error('format failure');return formatter.format(value);}}};
 vm.runInNewContext(fn('toDateStr')+'\n'+fn('readData'),ctx);
 return {read:ctx.readData,calls:()=>formatCalls,ranges,fail:()=>{throwOnDate=true;}};
}
test('identical timestamp Date instances use one formatter call per read, without caching rows across reads',()=>{
 const rows=[['date','store','seg','savedAt','aq999'],...Array.from({length:2162},(_,i)=>[new Date('2026-10-07T00:00:00Z'),i%2?'合成甲':'合成乙',16,'下午 4:00',i])];
 const h=setup(rows);const first=h.read('2026-10-07',16);
 assert.equal(h.calls(),1);assert.equal(first.合成甲.aq999,2161);assert.equal(first.合成乙.aq999,2160);
 rows[2162][4]=0;const next=h.read('2026-10-07',16);
 assert.equal(h.calls(),2);assert.equal(next.合成甲.aq999,0);
});
test('distinct timestamps on the same Taipei day keep separate formatter calls; boundary and non-Date semantics survive',()=>{
 const rows=[['date','store','seg','savedAt','extra'],[new Date('2026-10-06T15:59:59Z'),'合成前',16,'old',null],[new Date('2026-10-06T16:00:00Z'),'合成甲',16,'16:01',new Date('2026-10-06T16:00:00Z')],[new Date('2026-10-07T00:00:00Z'),'合成乙',21,'21:00',0],['2026-10-07T23:00','合成字串',16,'16:02',false]];
 const h=setup(rows),r=h.read('2026-10-07',16);assert.equal(h.calls(),3);
 assert.equal(r.合成前,undefined);assert.equal(r.合成甲.extra,'2026-10-07');assert.equal(r.合成甲.savedAt,'16:01');assert.equal(r.合成字串.date,'2026-10-07T23:00');assert.equal(r.合成字串.extra,false);
});
test('a changed Date timestamp in the next read is formatted again; no stale day lookup',()=>{
 const date=new Date('2026-10-06T16:00:00Z'),rows=[['date','store','seg','savedAt'],[date,'合成甲',16,'16:00']];
 const h=setup(rows);assert.equal(h.read('2026-10-07',16).合成甲.date,'2026-10-07');date.setUTCDate(7);
 assert.equal(h.read('2026-10-07',16).合成甲,undefined);assert.equal(h.read('2026-10-08',16).合成甲.date,'2026-10-08');assert.equal(h.calls(),3);
});
test('formatter errors and invalid Date still fail instead of returning a cached success',()=>{
 const h=setup([['date','store','seg'],[new Date('2026-10-07T00:00:00Z'),'合成甲',16]]);h.fail();assert.throws(()=>h.read('2026-10-07',16),/format failure/);
 assert.throws(()=>setup([['date','store','seg'],[new Date(NaN),'合成甲',16]]).read('2026-10-07',16),RangeError);
});
