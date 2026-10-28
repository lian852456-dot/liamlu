// Company parsing is isolated from the UI thread. Supervisor credentials never enter.
importScripts('./assets/vendor/store-presentation/jszip-3.10.1.min.js', './assets/vendor/xlsx.full.min.js');
const ready=Promise.all([import('./operations-brief-core.mjs'),import('./operations-brief-package.mjs'),import('./operations-tradein-core.mjs'),import('./operations-goodspeed-core.mjs'),import('./operations-marketing-core.mjs')]);
let templateBytes=null;
const sample=(book,pattern)=>book.SheetNames.slice(0,50).map(name=>{
  const sheet=book.Sheets[name],rows=self.XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:false,blankrows:false}).slice(0,30);
  const fields=[...new Set(rows.flatMap(r=>r.slice(0,80)).filter(v=>typeof v==='string'&&pattern.test(v.trim())).map(v=>v.trim()))];
  return {name,range:sheet['!fullref']||sheet['!ref']||'',fields};
});
self.onmessage=async({data})=>{
  try{
    const [{validateFile,detectKind,HEADER_LABEL},{sha,openPackage,inspectTemplate,buildDraft},{parseTradeinRows},{parseGoodSpeedSheets},{inspectMarketing}]=await ready;
    const {id,type,name}=data;let {bytes}=data;
    if(type==='template'){validateFile({size:bytes.byteLength});const result=await inspectTemplate(bytes,self.JSZip);templateBytes=bytes;self.postMessage({id,result});return;}
    if(type==='export'){if(!templateBytes)throw Error('請重新讀取範本。');const out=await buildDraft(templateBytes,data.meta,self.JSZip);self.postMessage({id,result:out},[out]);return;}
    validateFile({size:bytes.byteLength});
    const result={name,bytes:bytes.byteLength,sha256:await sha(bytes),kind:detectKind(bytes),sheets:[],inspection:'尚未對映公司欄位'};
    const good=String(data.category||'').startsWith('好速'),marketing=data.category==='行銷簡報';
    let password=data.password||'';delete data.password;
    if(result.kind==='ole'&&good){
      importScripts('./assets/vendor/officecrypto.bundle.min.js');let encrypted=false;
      try{encrypted=self.OfficeCrypto.isEncrypted(bytes);}catch{}
      if(encrypted){
        result.encrypted=true;
        if(!password){result.needsPassword=true;result.inspection='加密Office：內容尚未解析。可在下方輸入本機Excel開啟密碼再讀取，或在自己的Excel另存無開啟密碼副本。密碼不傳送、不保存，與督導通行碼分開。';self.postMessage({id,result});return;}
        try{const decrypted=await self.OfficeCrypto.decrypt(bytes,{password});bytes=decrypted instanceof ArrayBuffer?decrypted:decrypted.buffer.slice(decrypted.byteOffset,decrypted.byteOffset+decrypted.byteLength);}catch{throw Error('好速Excel本機解密失敗：請核對開啟密碼及Office加密格式；不會顯示為0或空店。');}finally{password='';}
        if(detectKind(bytes)!=='zip')throw Error('解密後不是支援的XLSX；請在Excel另存無巨集XLSX');
        result.kind='zip';result.decryption='使用既有本機OfficeCrypto記憶體解密；原始雜湊保留，密碼不保存';
      }
    }
    password='';
    if(result.kind==='zip'){
      const zip=await openPackage(bytes,self.JSZip);
      if(marketing){result.kind='pptx';result.marketing=await inspectMarketing(zip);result.inspection='依實際頁序讀取原生文字；圖片及其遮蓋內容不當作已讀政策，請逐頁核對後採用。';self.postMessage({id,result});return;}
      if(!zip.file('xl/workbook.xml')){result.inspection='不是Excel活頁簿；行銷PPTX請使用獨立行銷簡報入口，勿當會議版型。';self.postMessage({id,result});return;}
      result.kind='xlsx';
      const tradein=data.category==='舊換新';
      const book=self.XLSX.read(bytes,{type:'array',sheetRows:tradein||good?0:31,cellHTML:false,cellStyles:false,cellNF:false,bookVBA:false,cellFormula:false});
      result.sheetCount=book.SheetNames.length;result.sheets=sample(book,HEADER_LABEL);result.inspection='僅在每表前30列辨識已知欄位名稱，不回傳資料列；完整欄位與計算口徑待核。';
      if(tradein){try{if(!book.Sheets['統計表'])throw Error('缺少統計表工作表');result.tradein=parseTradeinRows(self.XLSX.utils.sheet_to_json(book.Sheets['統計表'],{header:1,raw:true,defval:null,blankrows:true}));result.inspection='已核對四區店級明細與正式小計；來源年份待確認，政策及其他章節仍待核。';}catch(e){result.inspection='舊換新對映停止：'+e.message;}}
      if(good){try{const tables=Object.fromEntries(['BB店點','BB量能','BB明細'].filter(n=>book.Sheets[n]).map(n=>[n,self.XLSX.utils.sheet_to_json(book.Sheets[n],{header:1,raw:true,defval:null,blankrows:true})]));result.goodspeed=parseGoodSpeedSheets(tables);result.inspection='好速BB三表已核對；來源總進度、點數／目標比、36M與失敗標準分類分列，不回傳客戶資料。';}catch(e){result.inspection='好速對映停止：'+e.message;}}
      if(result.encrypted)new Uint8Array(bytes).fill(0);
    }else if(result.kind==='text'&&/\.csv$/i.test(name)){
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const book=self.XLSX.read(text,{type:'string',sheetRows:31,raw:true,cellFormula:false});result.kind='csv';result.sheets=sample(book,HEADER_LABEL);result.sheetCount=book.SheetNames.length;result.inspection='UTF-8 CSV前30列只辨識已知欄位名稱，不回傳資料列；非UTF-8請在本機另存。';
    }else result.inspection=marketing?(result.kind==='ole'?'舊版PPT或加密Office，尚未解析。請在自己的PowerPoint開啟並另存無巨集、無開啟密碼PPTX，再從行銷入口選取；不自動轉檔。':'此行銷格式未提供文字解析；圖片／PDF需人工核對，PPTX可逐頁擷取原生文字。'):result.kind==='ole'?'加密Office或舊版XLS，內容尚未解析：在自己的Excel開啟，保留原檔並另存無開啟密碼、無巨集XLSX副本，再重新選取；不需提供密碼。':'此格式僅辨識檔案，尚未解析內容；圖片／PDF需人工核對。';
    self.postMessage({id,result});
  }catch(error){self.postMessage({id:data.id,error:error.message||'解析失敗，請另存XLSX再試。'});}
};
