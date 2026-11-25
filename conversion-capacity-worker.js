'use strict';
importScripts('assets/vendor/xlsx.full.min.js','readonly-dashboard-core.js','conversion-capacity-core.js');
self.onmessage=async ({data})=>{
  try {
    let bytes=await data.file.arrayBuffer();
    if(new Uint8Array(bytes)[0]===0xd0){
      if(!data.password) throw Error('請輸入這份量能 Excel 的開啟密碼。');
      importScripts('assets/vendor/officecrypto.bundle.min.js');
      try { bytes=await self.OfficeCrypto.decrypt(bytes,{password:data.password}); }
      catch { throw Error('量能檔案解密失敗，請核對 Excel 開啟密碼。'); }
    }
    const book=XLSX.read(bytes,{type:'array',sheets:[data.kind+'量能'],bookVBA:false,cellHTML:false,cellFormula:false});
    self.postMessage({report:ConversionCapacity.read(book,XLSX,data.kind,ReadonlyDashboardCore.STORES)});
  }catch(error){ self.postMessage({error:error.message}); }
};
