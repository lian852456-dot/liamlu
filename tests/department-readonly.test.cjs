const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../department-readonly-core.js'),G=require('../department-gold-monthly-core.js'),A=require('../department-readonly-assets.js'),F=require('./helpers/department-readonly-synthetic.cjs');
test('projects saved display data, omitting credentials, history and unrelated source columns',()=>{
 const input=F.input(),before=JSON.stringify(input),out=C.project(input),serialized=JSON.stringify(out);
 for(const marker of ['SESSION_SECRET','HISTORY_SECRET','RECEIPT_SECRET','SOURCE_FIELD_SECRET'])assert.ok(!serialized.includes(marker));
 assert.equal(JSON.stringify(input),before);assert.equal(out.scores.generation,1);assert.equal(out.gold.months[0].settlementStatus,'archived');assert.equal(out.gold.months[0].records.length,0);
 const q3=out.gold.months.filter(m=>m.monthKey>='2026-07'),people=G.aggregate(q3,G.quarterMonths('2026-Q3'),{region:'北一二B'});
 assert.equal(people.length,1);assert.equal(people[0].total,100);assert.equal(G.quarterStatus(q3,G.quarterMonths('2026-Q3')),'provisional');
 assert.equal(G.aggregate(q3,G.quarterMonths('2026-Q3')).find(p=>p.employeeId==='TEST002').months['2026-07'],null);
});
test('fails closed on malformed, duplicate or inconsistent sources and permits an explicit partial file',()=>{
 assert.throws(()=>C.project({}));const input=F.input();input.gold.gold.months[1].validation.sourceTotal=999;assert.throws(()=>C.project(input),/SOURCE_TOTAL_MISMATCH/);
 const duplicate=F.input();duplicate.scores.months.push(duplicate.scores.months[0]);assert.throws(()=>C.project(duplicate),/重複/);
 assert.equal(C.project({scores:F.input().scores}).gold,null);
});
test('HTML escapes embedded source text and includes a restrictive offline CSP without network or write code',()=>{
 const input=F.input();input.scores.months[0].active.sourceName='</script><img src=x onerror=alert(1)>';
 const html=C.createHTML(input,A);assert.ok(!html.includes('</script><img'));assert.ok(html.includes('connect-src \'none\''));assert.ok(html.includes('form-action \'none\''));
 assert.ok(!/<(?:script|link|iframe|form)\b[^>]*(?:src|href|action)=/i.test(html));
 for(const pattern of [/type=["'](?:file|password)/i,/\bfetch\s*\(/,/XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB/,/script\.google\.com|googleapis\.com/])assert.ok(!pattern.test(html));
});
