const assert=require('node:assert/strict'),JSZip=require('jszip'),C=require('../department-store-presentation-core.js');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&');
const texts=s=>[...s.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m=>decode(m[1]));
function expectedTables(page){const m=page.model,month=String(Number(m.targetMonth.slice(5)));
 if(page.kind==='trend')return m.regions.map(r=>[['店舖',...m.period.map(v=>v.slice(5)),'平均'],...r.rows.map(v=>[v.store,...v.cells.map(c=>C.fmt(c.score)),C.fmt(v.mean)])]);
 return [
  [['序','區域','店舖',month+'月','連續','扣分','缺失原因'],...(m.lowScores.length?m.lowScores.map(r=>[r.order,r.region,r.store,C.fmt(r.score),r.streak>=2?'連'+r.streak+'月':'—',C.fmt(r.deduction),C.reasonText(r)]):[['—','—',m.lowScoresTotal?'此頁無續列':'無未滿分店點','—','—','—','—']])],
  [['區','平均','滿分/有效','%'],...m.regions.map(r=>[r.region,C.fmt(r.single.mean,1),`${r.single.perfect}/${r.single.valid}`,C.fmt(r.single.rate==null?null:r.single.rate*100,1)])],
  [['原因（涉及店數）','店'],...m.reasonTop.map(r=>[r.category,r.stores])]
 ];
}
module.exports=async function verifyNative(buffer,model){
 const zip=await JSZip.loadAsync(buffer),names=Object.keys(zip.files).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a,b)=>+a.match(/slide(\d+)/)[1]-+b.match(/slide(\d+)/)[1]),pages=C.planPages(model);assert.equal(names.length,pages.length);let cells=0,tables=0,qualifiers=0;
 for(let i=0;i<names.length;i++){
  const xml=await zip.file(names[i]).async('string');assert.doesNotMatch(xml,/<p:pic>/);
  const actual=[...xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)].map(t=>[...t[0].matchAll(/<a:tr\s[^>]*>[\s\S]*?<\/a:tr>/g)].map(r=>[...r[0].matchAll(/<a:tc>[\s\S]*?<\/a:tc>/g)].map(c=>texts(c[0]).join(''))));
  const expected=expectedTables(pages[i]).map(t=>t.map(r=>r.map(String)));assert.deepEqual(actual,expected,'native table values differ on page '+(i+1));tables+=actual.length;cells+=actual.flat(2).length;
  const shapes=[...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(s=>texts(s[0]).join(''));
  assert.ok(shapes.includes(`${i+1} / ${pages.length}`),'page number missing');
  if(pages[i].kind==='trend')for(const s of pages[i].model.sixPerfect){assert.ok(shapes.includes(s.store),'perfect qualifier missing from editable shapes');qualifiers++;}
 }
 return {status:'PASS',slides:names.length,nativeTables:tables,cellsCompared:cells,trendRows:pages.filter(p=>p.kind==='trend').reduce((n,p)=>n+p.model.regions.reduce((a,r)=>a+r.rows.length,0),0),deficitRows:pages.filter(p=>p.kind==='monthly').reduce((n,p)=>n+p.model.lowScores.length,0),reasonRows:pages.filter(p=>p.kind==='monthly').reduce((n,p)=>n+p.model.reasonTop.length,0),perfectQualifierShapes:qualifiers};
};
