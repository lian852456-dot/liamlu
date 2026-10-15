(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PriceModelView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const text=value=>String(value==null?'':value).trim();
 const colors='宇宙橙|勃根地紅|午夜|星光|太空灰|鈦原色|石墨|松嶺青|沙漠鈦金|曜石黑|冰川藍|太空黑|迷霧灰|橄欖綠|砂岩粉|深藍|冰霜紫|月岩灰|薰衣草紫|開心果綠|木槿桃|靛藍色|香茅綠|草莓粉|米白|海藍|淺藍|鈦銀|白銀|銀藍|深紫|淡紫色|沙漠棕|夜空|星光白|珊瑚粉|黑藍|鈦|黑色?|白色?|藍色?|粉色?|紅色?|黃色?|綠色?|紫色?|銀色?|金色?|灰色?|橘色?|棕色?|桃色?|米色?';
 const colorSuffix=new RegExp('((?:\\d+\\s*(?:GB|TB|G)))\\s*-?\\((?:'+colors+')\\)','gi');
 const plainColorSuffix=new RegExp('((?:\\d+\\s*(?:GB|TB|G)))\\s+(?:'+colors+')(?=\\s*$|\\((?:4|5)G\\))','gi');
 const canonicalBrand=value=>/^samsung$/i.test(text(value))?'Samsung':text(value);
 // Only recognized, delimited colour syntax after storage is removed.
 // Network, RAM, size, bundles, grades and all unknown tokens stay in the identity.
 function stripColors(model){return text(model).replace(colorSuffix,'$1').replace(plainColorSuffix,'$1');}
 function colorlessModel(row){return stripColors(row.colorless_model||row.colorlessModel||row.model);}
 function specification(row){
  const colourless=colorlessModel(row),memory=colourless.match(/(\d+)\s*(?:GB|G)\s*\/\s*(\d+)\s*(GB|TB|G)\b/i);
  const storageModel=colourless.replace(/\((?:4|5)G\)/gi,'');
  const storageMatch=Array.from(storageModel.matchAll(/(?:^|[_\s])(\d+)\s*(GB|TB|G)\b/gi)).find(match=>!(match[2].toUpperCase()==='G'&&['4','5'].includes(match[1])));
  const storage=memory?memory[2]+(memory[3].toUpperCase()==='TB'?'TB':'GB'):(storageMatch?storageMatch[1]+storageMatch[2]:'');
  const capacity=storage.replace(/G$/i,'GB').toUpperCase(),ram=memory?memory[1]+'GB':'';
  let model=colourless;
  if(memory)model=model.replace(memory[0],' ');else if(storageMatch)model=model.replace(storageMatch[0],' ');
  return {model:model.replace(/[_\s]+/g,' ').trim(),capacity,ram,specKey:colourless};
 }
 function identity(row){
  const brand=canonicalBrand(row.brand);
  // The original model is the merge fence. A supplied colorless label cannot
  // erase a network, capacity, bundle, material or other unknown distinction.
  let model=stripColors(row.model||row.colorless_model||row.colorlessModel),label=colorlessModel(row);
  if(brand==='Samsung'){model=model.replace(/^samsung(?=\s)/i,'Samsung');label=label.replace(/^samsung(?=\s)/i,'Samsung');}
  return JSON.stringify([brand,model,label]);
 }
 function valueSignature(value){
  if(value==null||text(value)==='')return ['missing'];
  const raw=text(value),numeric=typeof value==='number'?value:/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(raw)?Number(raw.replace(/,/g,'')):NaN;
  return Number.isFinite(numeric)?['number',numeric]:['text',raw];
 }
 function quoteSignature(quotes){return Object.keys(quotes||{}).sort().map(provider=>[provider,Object.keys(quotes[provider]||{}).sort().map(grade=>[grade,valueSignature(quotes[provider][grade])])]);}
 function groupTradein(rows){
  const groups=new Map();
  rows.forEach((raw,index)=>{
   const row=raw&&typeof raw==='object'?raw:{};
   const source=text(row.source_sheet||row.sourceSheet),base=identity(row);
   const key=JSON.stringify([source,base,quoteSignature(row.quotes),text(row.model)?null:index]);
   if(!groups.has(key))groups.set(key,{...row,model:colorlessModel(row),colorless_model:colorlessModel(row),presentation_key:base,source_models:[],source_row_count:0});
   const group=groups.get(key);group.source_row_count++;
   if(!group.source_models.includes(row.model))group.source_models.push(row.model);
  });
  const result=[...groups.values()],variants=new Map();
  result.forEach(row=>{if(!variants.has(row.presentation_key))variants.set(row.presentation_key,new Set());variants.get(row.presentation_key).add(JSON.stringify(quoteSignature(row.quotes)));});
  return result.map(row=>({...row,price_variant:variants.get(row.presentation_key).size>1}));
 }
 return Object.freeze({canonicalBrand,stripColors,colorlessModel,specification,identity,valueSignature,quoteSignature,groupTradein});
});
