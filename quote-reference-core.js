(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./tradein-reference-core.js'):root.TradeinReferenceCore);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.QuoteReferenceCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(TradeinReference){
  'use strict';
  function fail(message){throw new Error('參考報價檔：'+message);}
  const str=value=>typeof value==='string'?value:'';
  function price(value,missingAllowed=false){if(value===''||value==null||value==='原表未提供'){if(missingAllowed)return '';fail('報價缺漏');}if(typeof value!=='number'||!Number.isFinite(value)||value<0)fail('報價格式不正確');return String(value);}
  function date(value){if(!/^20\d{2}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('來源日期不正確');return value;}
  function extract(html){
    if(typeof html!=='string'||html.length>12*1024*1024)fail('檔案過大');
    // Read inert JSON only. Uploaded scripts, frames, links and styles never execute.
    const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m=>/\bid\s*=\s*["']DATA["']/i.test(m[1])&&/\btype\s*=\s*["']application\/json["']/i.test(m[1]));
    if(scripts.length!==1)fail('找不到唯一的 DATA JSON');
    return JSON.parse(scripts[0][2]);
  }
  function decode(raw){
    const fields=['id','project','tariff','term','rent','price','retail'];
    if(!raw||JSON.stringify(raw.fields)!==JSON.stringify(fields)||!Array.isArray(raw.dicts)||raw.dicts.length!==7||!raw.dicts.every(Array.isArray)||!Array.isArray(raw.rows)||raw.rows.length>150000)fail('價格編碼不符');
    return raw.rows.map(indices=>{if(!Array.isArray(indices)||indices.length!==7)fail('價格列格式不正確');const row={};fields.forEach((f,i)=>{const index=indices[i];if(!Number.isSafeInteger(index)||index<0||index>=raw.dicts[i].length)fail('價格字典索引不正確');row[f]=raw.dicts[i][index];});return row;});
  }
  function shopping(payload,hash){
    const models=payload.standard?.['機款主檔'];if(!Array.isArray(models)||models.length>5000)fail('缺少機款主檔');
    const known=new Map(models.map(m=>[str(m['機款ID']),m]));if(known.size!==models.length)fail('機款 ID 重複');
    const rows=decode(payload.prices),groups=new Map();
    rows.forEach((row,index)=>{
      const model=known.get(row.id);if(!model||!str(model['系列'])||!str(model['品牌']))fail('價格無對應機款');
      if(!str(row.project)||!str(row.tariff))fail('缺少完整專案名稱');
      const value=price(row.price),retail=price(row.retail,true);
      const originIndexes=payload.priceSources?.quotes?.[index];
      if(originIndexes!==undefined&&(!Array.isArray(originIndexes)||originIndexes.length>100))fail('來源商品索引不正確');
      const origins=originIndexes?.map(i=>{if(!Number.isSafeInteger(i)||!Array.isArray(payload.priceSources?.products?.[i])||payload.priceSources.products[i].length!==2)fail('來源商品遺失');return payload.priceSources.products[i].map(str);});
      const capacity=str(model['容量']);const name=[model['系列'],capacity].filter(Boolean).join(' ');
      const sourceNames=origins?.map(x=>x[1]).join('／')||name;
      const key=JSON.stringify([row.id,retail,origins||null]);
      if(!groups.has(key))groups.set(key,{source_sheet:str(payload.priceSource?.file)||'上傳參考 HTML',brand:model['品牌'],code:origins?.map(x=>x[0]).join('／')||row.id,model:sourceNames,colorless_model:name,retail_price:retail,project_prices:{}});
      const group=groups.get(key);const termLabel=typeof row.term==='number'?`合約${row.term}期`:`約期${row.term}`;const condition=`${row.project}／${row.tariff}／${termLabel}／月租${row.rent}`;
      if(Object.hasOwn(group.project_prices,condition)&&group.project_prices[condition]!==value)fail('同機款與完整條件有不同價格，停止合併');
      group.project_prices[condition]=value;
    });
    return {status:'ok',snapshot:{kind:'shopping',source_version_date:date(payload.priceSource?.date),source_file_name:str(payload.priceSource?.file),source_file_sha256:hash,snapshot_hash:hash,rows:[...groups.values()],row_count:groups.size},localReference:true,sourceQuoteCount:rows.length};
  }
  function tradein(payload,hash){
    const devices=payload.recycle?.devices;if(!Array.isArray(devices)||devices.length>10000)fail('缺少舊換新報價');
    const vendors={dianzi:'點子行動',fdi:'FutureDial（FDI）'},rows=[];
    devices.forEach(device=>{
      if(!Array.isArray(device.variants)||!device.variants.length)fail('舊機顏色來源缺漏');
      device.variants.forEach(variant=>{
        if(!Array.isArray(variant.items)||variant.items.length>100)fail('舊機報價列不正確');
        const quotes={};
        variant.items.forEach(item=>{
          const vendor=vendors[item.vendor];if(!vendor||!['S','A','B','C'].includes(item.grade))fail('回收商或等級未支援');
          const value=price(item.price,true);if(value==='')return;
          quotes[vendor]??={};if(Object.hasOwn(quotes[vendor],item.grade)&&quotes[vendor][item.grade]!==value)fail('同機款／回收商／等級報價衝突');quotes[vendor][item.grade]=value;
        });
        if(!Object.keys(quotes).length)return;
        rows.push({source_sheet:str(device.sourceSheet),brand:str(device.brand)||'來源未註明',model:str(variant.rawModel)||fail('舊機原始機款缺漏'),quotes});
      });
    });
    return {status:'ok',snapshot:{kind:'tradein',source_version_date:date(payload.recycle.source?.date),source_file_name:str(payload.recycle.source?.originalFile||payload.recycle.source?.file),source_file_sha256:hash,snapshot_hash:hash,rows,row_count:rows.length},localReference:true,validThrough:payload.recycle.sources?.map(s=>({file:str(s.file),date:date(s.date),validThrough:date(s.validThrough)}))||[]};
  }
  function convert(payload,hash){if(!/^[a-f0-9]{64}$/.test(hash||''))fail('缺少 HTML SHA-256');if(!TradeinReference)fail('完整回收查詢元件未載入');const result={shopping:shopping(payload,hash),tradein:tradein(payload,hash)};result.tradein.referenceCatalog=TradeinReference.normalize(payload.recycle);return result;}
  return Object.freeze({extract,decode,convert});
});
