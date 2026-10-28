import test from 'node:test';import assert from 'node:assert/strict';
import {parseTradeinRows}from '../operations-tradein-core.mjs';
function fixture(){const header=[null,'督導區','代碼','店點','Apple商品','Android系統機款&其他商品','僅折抵金額，未換新機','舊機換新機\n(a)',null,null,null,'Device\n(b)\n*含Mac*','舊換新%\n(a/b)','舊機換新機\n(上月同期)',null,null,'舊換新%\n(上月整月)'];
  const rows=[['資料日期 : 10/1~10/27'],header.map((v,i)=>i===1||i===2?'區域':i===3?'長官':v)];
  for(const [i,r]of ['北一二A','北一二B','北一二C','北一二D'].entries()){const row=Array(17).fill(null);row[2]=r;[1,2,1,4].forEach((v,j)=>row[4+j]=v);row[11]=10;row[12]=.4;row[13]=i?2:3;row[16]=.2;rows.push(row);}
  rows.push(['資料日期 : 10/1~10/27'],header);
  for(const[i,r]of ['北一二A','北一二B','北一二C','北一二D'].entries()){const row=Array(17).fill(null);row[1]=r;row[2]='DNB'+String(10000+i);row[3]='SYNTHETIC-STORE-'+i;[1,2,1,4].forEach((v,j)=>row[4+j]=v);row[11]=10;row[12]=.4;row[13]=2;row[16]=.2;rows.push(row);}
  while(rows.length<421)rows.push([]);const zero=Array(17).fill(null);zero[1]='北一二A';zero[2]='DNB19999';zero[3]='SYNTHETIC-ZERO';[4,5,6,7,11].forEach(c=>zero[c]=0);zero[12]='#DIV/0!';zero[13]=1;rows.push(zero);return rows;}
test('all-range region filter keeps trailing zero/zero store, classification and correct denominators',()=>{const m=parseTradeinRows(fixture());assert.equal(m.storeCount,5);assert.equal(m.regions[0].storeCount,2);assert.equal(m.regions[0].stores.at(-1).rate,null);assert.equal(m.totals.total,16);assert.equal(m.totals.creditOnly,4);assert.equal(m.totals.rate,.4);assert.equal(m.totals.previous,9);assert.equal(m.year,null);assert.equal(m.regions[0].rateDeltaPp,20);});
test('missing required value, duplicate store or changed subtotal fails closed',()=>{for(const mutate of [r=>{r[8][7]=null;},r=>r.push(r[8]),r=>{r[2][7]=999;}]){const rows=fixture();mutate(rows);assert.throws(()=>parseTradeinRows(rows));}});
test('unrelated helper-cell errors do not stop valid aggregate data',()=>{const rows=fixture();rows[8][18]='#REF!';assert.equal(parseTradeinRows(rows).storeCount,5);});
test('conflicting period and missing/duplicate schema header stop mapping',()=>{const r=fixture();r[0]=['資料日期 : 9/1~9/27'];assert.throws(()=>parseTradeinRows(r));assert.throws(()=>parseTradeinRows([['wrong schema']]));});
