const vendors={dianzi:'點子行動',fdi:'FDI'},grades={dianzi:['A','B','C'],fdi:['S','A','B','C']};
const text=(v,max=1000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('回收價來源文字不完整');return v.trim();};
const date=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function parsePriceSource(input,{fileName='',sha256=''}={}){
  let raw;
  if(typeof input!=='string'||input.length>20*1024*1024)throw Error('請選擇 20MB 內的原報價 HTML／JSON');
  if(input.trim().startsWith('{'))raw=JSON.parse(input);
  else{
    // Extract inert JSON only. Never parse resource elements or execute source scripts.
    const scripts=[...input.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>/\bid\s*=\s*["']DATA["']/i.test(m[1]));
    if(scripts.length!==1||!(/\btype\s*=\s*["']application\/json["']/i.test(scripts[0][1])))throw Error('來源須包含唯一 DATA JSON；不執行 HTML 程式');
    raw=JSON.parse(scripts[0][2]);
  }
  raw=raw.recycle||raw;
  if(!Array.isArray(raw.devices)||!raw.devices.length||raw.devices.length>10000||!Array.isArray(raw.sources)||!raw.sources.length||raw.sources.length>50)throw Error('來源缺少機型或有效期');
  const sources=raw.sources.map(s=>{if(!date(s.date)||!date(s.validThrough)||s.date>s.validThrough)throw Error('來源有效期不完整');return {file:text(s.file),sheet:text(s.sheet),date:s.date,validThrough:s.validThrough,sha256:/^[a-f0-9]{64}$/.test(s.sha256||'')?s.sha256:''};});
  const devices=raw.devices.map(d=>{
    const source=sources.find(s=>s.file===d.sourceFile);if(!source)throw Error('機型與來源檔案未對應');
    if(!Array.isArray(d.variants)||!d.variants.length||d.variants.length>1000)throw Error('來源色款不完整');
    return {id:text(d.id,200),model:text(d.model),brand:text(d.brand,100),capacity:text(d.capacity,150),category:text(d.category,100),source,
      variants:d.variants.map(v=>{if(!Array.isArray(v.items)||v.items.length>10)throw Error('來源報價不完整');const seen=new Set();return {rawModel:text(v.rawModel),items:v.items.map(i=>{
        if(!grades[i.vendor]?.includes(i.grade)||seen.has(i.vendor+'/'+i.grade))throw Error('回收廠商／等級重複或不支援');seen.add(i.vendor+'/'+i.grade);
        if(i.price!==null&&(typeof i.price!=='number'||!Number.isFinite(i.price)||i.price<0||i.price>1e9))throw Error('回收價無效');
        if(!Number.isSafeInteger(i.row)||i.row<1)throw Error('來源缺少原始列號');
        return {vendor:i.vendor,grade:i.grade,price:i.price,row:i.row,part:typeof i.part==='string'?i.part.slice(0,200):''};
      })};})};
  });
  if(new Set(devices.map(d=>d.id)).size!==devices.length)throw Error('機型 ID 重複');
  return {fileName,sha256,sources,devices};
}
export function buildPriceTop3(catalog,{vendor='dianzi',grade='A',category='手機',asOf}={}){
  if(!grades[vendor]?.includes(grade)||!date(asOf))throw Error('請核對廠商、等級與日期');
  if(category==='Mac'&&(vendor!=='fdi'||grade==='S'))return {vendor,grade,category,asOf,rows:[],note:'Mac 僅來源 FDI A／B／C 報價；請調整條件。',fileName:catalog.fileName,sha256:catalog.sha256};
  const candidates=[],excluded={expired:0,missing:0,pending:0,variant:0};
  for(const d of catalog.devices.filter(d=>d.category===category)){
    if(asOf<d.source.date||asOf>d.source.validThrough){excluded.expired++;continue;}
    const items=d.variants.map(v=>v.items.find(i=>i.vendor===vendor&&i.grade===grade));
    if(items.some(i=>i?.price===0)){excluded.pending++;continue;}
    if(items.some(i=>!i||i.price===null)){excluded.missing++;continue;}
    const values=[...new Set(items.map(i=>i.price))];
    // A device-wide quote is valid only if all source variants have one price.
    // Mixed or partial variants must be inspected in the full price query.
    if(values.length!==1){excluded.variant++;continue;}
    candidates.push({model:d.model,capacity:d.capacity,brand:d.brand,category:d.category,price:values[0],vendor,grade,
      sourceFile:d.source.file,sourceSheet:d.source.sheet,sourceDate:d.source.date,validThrough:d.source.validThrough,sourceSha256:d.source.sha256,
      rawModels:[...new Set(d.variants.map(v=>v.rawModel))],sourceRows:[...new Set(items.map(i=>i.row))].sort((a,b)=>a-b),parts:[...new Set(items.map(i=>i.part).filter(Boolean))]});
  }
  const unique=new Map();for(const row of candidates){const key=[row.brand,row.model,row.capacity,row.sourceFile].join('|'),prior=unique.get(key);if(prior&&prior.price!==row.price)throw Error('同機型容量的來源價格衝突');if(!prior)unique.set(key,row);}
  const sorted=[...unique.values()].sort((a,b)=>b.price-a.price||a.model.localeCompare(b.model,'zh-Hant',{numeric:true})||a.capacity.localeCompare(b.capacity,'zh-Hant',{numeric:true}));
  const rows=sorted.slice(0,3).map(row=>({...row,rank:1+sorted.filter(r=>r.price>row.price).length})),last=rows.at(-1);
  return {vendor,grade,category,asOf,rows,total:sorted.length,excluded,tiedAtCutoff:last?sorted.filter(r=>r.price===last.price).length-rows.filter(r=>r.price===last.price).length:0,fileName:catalog.fileName,sha256:catalog.sha256};
}
export function priceTop3Text(result){
  if(!result)return ['回收參考價 TOP3：請在「回收價來源與條件」選取已提供的報價 HTML／JSON。'];
  const label=vendors[result.vendor]+' '+result.grade+'等';
  if(!result.rows.length)return [`回收參考價 TOP3｜${result.category}｜${label}`,result.note||'核對日無有效且完整的單一色款報價，請調整條件或至完整查價核對。',`核對日 ${result.asOf}；0值、缺價、色款異價及有效期外資料不列入。`];
  const sources=[...new Map(result.rows.map(r=>[r.sourceFile,{file:r.sourceFile,sheet:r.sourceSheet,start:r.sourceDate,end:r.validThrough}])).values()];
  return [`回收參考價 TOP3｜${result.category}｜${label}`,`核對日 ${result.asOf}；依指定廠商／等級參考價由高至低`,
    ...result.rows.map(r=>`${r.rank}. ${r.model} ${r.capacity}｜${r.price.toLocaleString('en-US')} 元`),
    ...(result.tiedAtCutoff?[`末位價格另有 ${result.tiedAtCutoff} 組同價，未逐筆列出。`]:[]),
    ...sources.map(s=>`來源：${s.file}／${s.sheet}；有效 ${s.start}～${s.end}`),
    `本條件可排序 ${result.total} 組；0值待核 ${result.excluded.pending}、缺價 ${result.excluded.missing}、色款異價 ${result.excluded.variant}、有效期外 ${result.excluded.expired} 組未列入。`,
    '各機型／容量不同，這是同廠商同等級的報價排行；不代表同機款跨廠價差。',
    '等級須依實際檢測；不含促案加碼及 POS，非成交承諾。0值／缺價／色款異價不列入。'];
}
