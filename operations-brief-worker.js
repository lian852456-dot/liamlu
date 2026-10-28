// Company parsing is isolated from the UI thread; credentials never enter this worker.
importScripts('./assets/vendor/store-presentation/jszip-3.10.1.min.js', './assets/vendor/xlsx.full.min.js');
const ready=Promise.all([import('./operations-brief-core.mjs'),import('./operations-brief-package.mjs'),import('./operations-tradein-core.mjs')]);
let templateBytes=null;
const sample=(book,pattern)=>book.SheetNames.slice(0,50).map(name=>{
  const sheet=book.Sheets[name],rows=self.XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:false,blankrows:false}).slice(0,30);
  const fields=[...new Set(rows.flatMap(r=>r.slice(0,80)).filter(v=>typeof v==='string'&&pattern.test(v.trim())).map(v=>v.trim()))];
  return {name,range:sheet['!fullref']||sheet['!ref']||'',fields};
});
self.onmessage=async({data})=>{
  try{
    const [{validateFile,detectKind,HEADER_LABEL},{sha,openPackage,inspectTemplate,buildDraft},{parseTradeinRows}]=await ready;
    const {id,type,bytes,name}=data;
    if(type==='template'){validateFile({size:bytes.byteLength});const result=await inspectTemplate(bytes,self.JSZip);templateBytes=bytes;self.postMessage({id,result});return;}
    if(type==='export'){if(!templateBytes)throw Error('請重新讀取範本。');const out=await buildDraft(templateBytes,data.meta,self.JSZip);self.postMessage({id,result:out},[out]);return;}
    validateFile({size:bytes.byteLength});
    const result={name,bytes:bytes.byteLength,sha256:await sha(bytes),kind:detectKind(bytes),sheets:[],inspection:'尚未對映公司欄位'};
    if(result.kind==='zip'){
      const zip=await openPackage(bytes,self.JSZip);
      if(!zip.file('xl/workbook.xml')){result.inspection='不是Excel活頁簿；尚未支援此來源，請提供公司Excel原表。';self.postMessage({id,result});return;}
      result.kind='xlsx';
      const tradein=data.category==='舊換新';
      const book=self.XLSX.read(bytes,{type:'array',sheetRows:tradein?0:31,cellHTML:false,cellStyles:false,cellNF:false,bookVBA:false,cellFormula:false});
      result.sheetCount=book.SheetNames.length;result.sheets=sample(book,HEADER_LABEL);result.inspection='僅在每表前30列辨識已知欄位名稱，不回傳資料列；完整欄位與計算口徑待核。';
      if(tradein){try{if(!book.Sheets['統計表'])throw Error('缺少統計表工作表');result.tradein=parseTradeinRows(self.XLSX.utils.sheet_to_json(book.Sheets['統計表'],{header:1,raw:true,defval:null,blankrows:true}));result.inspection='已核對四區店級明細與正式小計；來源年份待確認，政策及其他章節仍待核。';}catch(e){result.inspection='舊換新對映停止：'+e.message;}}
    }else if(result.kind==='text'&&/\.csv$/i.test(name)){
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const book=self.XLSX.read(text,{type:'string',sheetRows:31,raw:true,cellFormula:false});result.kind='csv';result.sheets=sample(book,HEADER_LABEL);result.sheetCount=book.SheetNames.length;result.inspection='UTF-8 CSV前30列只辨識已知欄位名稱，不回傳資料列；非UTF-8請在本機另存。';
    }else result.inspection=result.kind==='ole'?'加密Office或舊版XLS，內容尚未解析：在自己的Excel開啟，保留原檔並另存無開啟密碼、無巨集XLSX副本，再重新選取；不需提供密碼。':'此格式僅辨識檔案，尚未解析內容；請提供Excel原表，圖片／PDF政策需另行人工核對。';
    self.postMessage({id,result});
  }catch(error){self.postMessage({id:data.id,error:error.message||'解析失敗，請另存XLSX再試。'});}
};
