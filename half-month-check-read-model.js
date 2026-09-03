(function attachHalfMonthCheckReadModel(scope) {
  'use strict';

  const QUESTIONS = [
    '督導駐點','店格陳列／展機防盜／回收桶上鎖','中島展示機無不當資訊且開機恆亮',
    '前後場整潔、公佈欄符合規範','有價商品櫃是否上鎖','電腦記事本／資料夾mail個資檢查',
    '申裝書3日回送、無不當留存個資','同仁服裝儀容與服務態度','出勤與班表一致並載休息時間',
    '人員面談及輔導','門市安全（禁菸／禁火源）','監控設備運作正常','店務日誌與督導簽名',
    '待銷毀文件打包歸檔上鎖','待回送／未結案維修機盤點','保全金零找金現金盤點',
    'iPhone手機盤點盤差登載','到店全盤作業（2月1次）'
  ].map((title,index)=>Object.freeze({ item:index+1,title }));
  const SEPTEMBER_EFFECTIVE_DATE='2026-09-01';
  const RESULT_LABELS = Object.freeze({ ok:'符合', abnormal:'異常', na:'不適用', '':'尚未填寫' });
  const VALID_RESULTS = new Set(['ok','abnormal','na','']);

  function periodForDate(date) {
    const match=String(date||'').match(/^\d{4}-\d{2}-(\d{2})$/);
    if(!match) return '';
    return Number(match[1])<=15?'H1':'H2';
  }

  function periodMeta(month, period) {
    if(!/^\d{4}-\d{2}$/.test(String(month||''))||!['H1','H2'].includes(period)) return null;
    const [year,monthNumber]=month.split('-').map(Number);
    const lastDay=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
    return {
      key:period,
      month,
      label:`${year} 年 ${monthNumber} 月${period==='H1'?'上':'下'}半月`,
      dateRange:period==='H1'?`${monthNumber}/1–${monthNumber}/15`:`${monthNumber}/16–${monthNumber}/${lastDay}`
    };
  }

  function resultValue(value) {
    const normalized=String(value||'').trim();
    if(normalized==='blank') return '';
    return VALID_RESULTS.has(normalized)?normalized:'';
  }

  function sourceTime(row) {
    const parsed=Date.parse(String(row&&row.savedAt||''));
    return Number.isFinite(parsed)?parsed:0;
  }

  function adapt(input = {}) {
    const normalizeStore=typeof input.normalizeStore==='function'?input.normalizeStore:value=>String(value||'').trim();
    const date=String(input.date||'');
    const month=date.slice(0,7);
    const period=['H1','H2'].includes(input.period)?input.period:periodForDate(date);
    const periodInfo=periodMeta(month,period);
    if(!periodInfo) throw new Error('半月正式期別無法判定。');
    const versionApi=scope.PatrolQuestionVersions;
    const questions=date>=SEPTEMBER_EFFECTIVE_DATE&&versionApi
      ? versionApi.SEP25_GROUPS.monthly.map(item=>Object.freeze({item,title:versionApi.SEP25_BY_NO[item].text}))
      : QUESTIONS;
    const totalItems=questions.length;
    const stores=(Array.isArray(input.stores)?input.stores:[]).map(normalizeStore).filter(Boolean);
    const storeSet=new Set(stores);
    const latest=new Map();
    (Array.isArray(input.rows)?input.rows:[]).forEach((raw,index)=>{
      const store=normalizeStore(raw&&raw.store);
      const item=Number(raw&&raw.item);
      const rowMonth=String(raw&&raw.month||raw&&raw.date||'').slice(0,7);
      if(!storeSet.has(store)||rowMonth!==month||String(raw&&raw.period||'')!==period||!Number.isInteger(item)||item<1||item>totalItems) return;
      const key=`${store}|${item}`;
      const candidate={raw,index,time:sourceTime(raw)};
      const current=latest.get(key);
      if(!current||candidate.time>current.time||(candidate.time===current.time&&candidate.index>current.index)) latest.set(key,candidate);
    });
    const storeRows=stores.map(name=>{
      const storeQuestions=questions.map(question=>{
        const raw=latest.get(`${name}|${question.item}`)?.raw||{};
        const result=resultValue(raw.result);
        return {
          ...question,
          result,
          resultLabel:RESULT_LABELS[result],
          note:String(raw.note||''),
          improvement:String(raw.improvement||''),
          evidence:String(raw.evidenceNames||''),
          inspector:String(raw.inspector||''),
          date:String(raw.date||''),
          savedAt:String(raw.savedAt||'')
        };
      });
      const answeredItems=storeQuestions.filter(question=>question.result).length;
      const abnormalCount=storeQuestions.filter(question=>question.result==='abnormal').length;
      const latestQuestion=storeQuestions.slice().sort((a,b)=>sourceTime(b)-sourceTime(a))[0];
      return {
        name,
        fillState:answeredItems===0?'empty':answeredItems===totalItems?'filled':'in_progress',
        answeredItems,
        totalItems,
        abnormalCount,
        latestDate:latestQuestion&&latestQuestion.date||'',
        updatedAt:latestQuestion&&latestQuestion.savedAt||'',
        questions:storeQuestions
      };
    });
    const priority=row=>row.fillState==='empty'?0:row.fillState==='in_progress'?1:row.abnormalCount?2:3;
    storeRows.sort((a,b)=>priority(a)-priority(b)||b.abnormalCount-a.abnormalCount||stores.indexOf(a.name)-stores.indexOf(b.name));
    const matchingRows=[...latest.values()].map(entry=>entry.raw);
    const updatedAt=matchingRows.slice().sort((a,b)=>sourceTime(b)-sourceTime(a))[0]?.savedAt||'';
    return {
      status:matchingRows.length?'ok':'no_data',
      period:periodInfo,
      summary:{
        filledStores:storeRows.filter(row=>row.fillState==='filled').length,
        totalStores:stores.length,
        abnormalStores:storeRows.filter(row=>row.abnormalCount>0).length,
        abnormalItems:storeRows.reduce((sum,row)=>sum+row.abnormalCount,0),
        emptyStores:storeRows.filter(row=>row.fillState==='empty').length
      },
      stores:storeRows,
      questions,
      statuses:[
        {value:'ok',label:RESULT_LABELS.ok},
        {value:'abnormal',label:RESULT_LABELS.abnormal},
        {value:'na',label:RESULT_LABELS.na}
      ],
      updatedAt,
      source:{label:'正式督導到店檢查 hread（唯讀）',href:'patrol.html'}
    };
  }

  const api={QUESTIONS,RESULT_LABELS,periodForDate,periodMeta,resultValue,adapt};
  scope.LiamHalfMonthCheckReadModel=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
