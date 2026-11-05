(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PromotionCatalogCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCHEMA='promotion-catalog/v1';
  const TYPES=Object.freeze({purchase:'購機折價',tradein:'舊換新加碼',loyalty:'老客戶續約',return:'回娘家',newfriend:'新朋友',upgrade:'升轉／4升5',tst:'TST 用戶'});
  const STATUSES=Object.freeze({new:'新增',continued:'展延',changed:'異動',closed:'關閉',unspecified:'來源未註明'});
  function fail(message){throw new Error('活動資料：'+message);}
  function text(value,label,max=2000){if(typeof value!=='string'||!value.trim()||value.length>max)fail(label+'格式不正確');return value.trim();}
  function iso(value){if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('日期不正確');return value;}
  function list(values,label,max=80){if(!Array.isArray(values)||values.length>max)fail(label+'格式不正確');return values.map(x=>text(x,label));}
  function money(value){if(value===null)return null;if(!Number.isSafeInteger(value)||value<0)fail('折價須為非負整數或 null');return value;}
  function taipeiDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
  function normalize(raw){
    if(!raw||raw.schema!==SCHEMA)fail('版本不符');
    if(!Array.isArray(raw.sources)||!raw.sources.length||raw.sources.length>20)fail('來源數不正確');
    const sources=raw.sources.map(source=>{
      const image=source.image==null?'':text(source.image,'原圖',8000000);
      if(image&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))fail('原圖只接受內嵌圖片');
      if(!/^[a-f0-9]{64}$/.test(source.sha256||''))fail('來源 SHA-256 不正確');
      return {id:text(source.id,'來源 ID',80),title:text(source.title,'來源標題',300),fileName:text(source.fileName,'來源檔名',300),sha256:source.sha256,image};
    });
    if(new Set(sources.map(x=>x.id)).size!==sources.length)fail('來源 ID 重複');
    if(!Array.isArray(raw.rows)||!raw.rows.length||raw.rows.length>1000)fail('活動筆數不正確');
    const rows=raw.rows.map(row=>{
      if(!Object.hasOwn(TYPES,row.type)||!Object.hasOwn(STATUSES,row.status))fail('活動類型／狀態不正確');
      const start=iso(row.start),end=iso(row.end);if(start>end)fail('活動日期顛倒');
      if(!sources.some(x=>x.id===row.sourceId))fail('活動缺少來源');
      if(!['yes','no','unknown'].includes(row.band100))fail('100MHz 標記不正確');
      if(!Array.isArray(row.benefits)||!row.benefits.length||row.benefits.length>10)fail('折價條件不正確');
      return {id:text(row.id,'活動 ID',100),type:row.type,status:row.status,brand:text(row.brand,'品牌',100),model:text(row.model,'機款',300),start,end,sourceId:row.sourceId,sourceRow:text(row.sourceRow,'來源列',300),band100:row.band100,
        channels:list(row.channels,'通路',10),audience:text(row.audience,'適用對象'),plans:text(row.plans,'適用專案'),codes:list(row.codes,'專案屬性',30),notes:text(row.notes,'條件說明'),
        benefits:row.benefits.map(b=>{if(!['discount','stacked_cap'].includes(b.kind))fail('金額性質不正確');return {kind:b.kind,amount:money(b.amount),condition:text(b.condition,'金額條件'),codes:list(b.codes,'金額屬性',30)};})};
    });
    if(new Set(rows.map(x=>x.id)).size!==rows.length)fail('活動 ID 重複');
    return {schema:SCHEMA,title:text(raw.title,'標題',300),version:text(raw.version,'版本',100),reviewDate:iso(raw.reviewDate),coverageNotes:list(raw.coverageNotes,'涵蓋說明',30),sources,rows};
  }
  function validity(row,date=taipeiDate()){iso(date);if(row.status==='closed')return 'closed';if(date<row.start)return 'upcoming';if(date>row.end)return 'expired';return 'active';}
  const validityLabel=Object.freeze({closed:'已關閉',upcoming:'尚未開始',expired:'已到期',active:'活動期間內'});
  function searchText(row){return [row.brand,row.model,row.audience,row.plans,row.notes,row.sourceRow,...row.codes,...row.benefits.flatMap(b=>[b.condition,...b.codes])].join(' ').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ');}
  function filter(catalog,options={}){
    const query=String(options.query||'').normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const date=iso(options.date||taipeiDate());
    return catalog.rows.filter(row=>(!options.type||row.type===options.type)&&(!options.brand||row.brand===options.brand)&&(!options.channel||row.channels.includes(options.channel)||row.channels.includes('全通路'))&&
      (options.includeInactive||validity(row,date)==='active')&&query.every(word=>/^\d+$/.test(word)?new RegExp('(^|[^0-9])'+word+'($|[^0-9])').test(searchText(row)):searchText(row).includes(word)));
  }
  function amountLabel(benefit){const prefix=benefit.kind==='stacked_cap'?'疊加後最高折價':'活動折價上限';return prefix+' '+(benefit.amount===null?'待核對金額':'NT$ '+benefit.amount.toLocaleString('en-US'));}
  return Object.freeze({SCHEMA,TYPES,STATUSES,normalize,taipeiDate,validity,validityLabel,filter,amountLabel});
});
