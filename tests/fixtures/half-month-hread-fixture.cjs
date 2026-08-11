'use strict';

const STORES=['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];

function storeRows(store, answered, options = {}) {
  const abnormal=new Set(options.abnormal||[]);
  const na=new Set(options.na||[]);
  const includeBlank=options.includeBlank!==false;
  const date=options.date||'2026-08-10';
  const rows=[];
  for(let item=1;item<=18;item++){
    if(item>answered&&!includeBlank) continue;
    const result=item>answered?'':abnormal.has(item)?'abnormal':na.has(item)?'na':'ok';
    rows.push({
      checkId:`${date}|${store}|H1`,date,period:'H1',month:'2026-08',store,inspector:'測試督導',item,result,
      note:abnormal.has(item)?`${store} 第${item}題正式異常原文`:'',
      improvement:abnormal.has(item)?`${store} 第${item}題正式改善原文`:'',
      evidenceNames:abnormal.has(item)?`https://drive.google.com/file/d/${encodeURIComponent(store)}-${item}/view`:'',
      savedAt:`2026-08-10T${String(8+Math.floor(item/6)).padStart(2,'0')}:${String(item%60).padStart(2,'0')}:00+08:00`
    });
  }
  return rows;
}

const rows=[
  ...storeRows('酒泉',18,{na:[18],date:'2026-08-05'}),
  ...storeRows('台北三創',18,{abnormal:[3,9],date:'2026-08-07'}),
  ...storeRows('六張犁',5,{abnormal:[2],date:'2026-08-08'}),
  ...storeRows('萬大',18,{date:'2026-08-08'}),
  ...storeRows('復興南',18,{abnormal:[6],date:'2026-08-09'}),
  ...storeRows('永吉',12,{date:'2026-08-09'}),
  ...storeRows('大稻埕',18,{date:'2026-08-10'}),
  ...storeRows('杭州南',0,{date:'2026-08-10'})
];

module.exports={STORES,rows,storeRows};
