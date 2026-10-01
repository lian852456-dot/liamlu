(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./threec-query-core.js'):root.ThreecQueryCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ThreecComparisonCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  const text=value=>String(value==null?'':value).trim();
  const unique=values=>Array.from(new Set(values)).sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
  function condition(name){
    const raw=text(name), parts=raw.split('／');
    const rentMatch=raw.match(/(?:月租\s*)?(\d{3,4})(?:H(?=$|[^A-Za-z0-9])|型|\s*元)/i)||raw.match(/月租\s*(\d{3,4})/)||raw.match(/(?:^|／)(\d{3,4})(?=專案|型|元|\s*\()/);
    const termMatch=raw.match(/(?:合約\s*)?(\d{2})(?:期|個月)/)||raw.match(/\((24|30|36|48|60)\)/);
    const rent=rentMatch?rentMatch[1]:'',term=termMatch?termMatch[1]:'';
    const version=/加碼/.test(raw)?'加碼':/VIP/i.test(raw)?'VIP':'一般';
    // Group only the recognised plan prefix. Raw conditions remain unique keys,
    // including handset, application, renewal and speed restrictions.
    // New flat workbooks prefix a generic source group. Keep the actual
    // enterprise plan and its handset eligibility visible as separate choices.
    let project=parts.length>1&&/企客特殊專案/.test(parts[0])&&/企客|榮耀之星/.test(parts[1])?parts[1]:(parts.length>1?parts[0]:raw);
    project=project.replace(/\((24|30|36|48|60)\)/g,'').replace(/(?:月租\s*)?\d{3,4}(?:H(?=$|[^A-Za-z0-9])|型|\s*元)/gi,'').replace(/合約\s*\d{2}期/g,'').replace(/_(?:加碼版|VIP)/gi,'').replace(/_XH/g,'').replace(/[_\s]+/g,' ').trim();
    if(!project||/^(專案價|合約)$/.test(project))project='原表條件';
    const detail=parts.length>1?parts.slice(1).join('／').replace(/^\d{3,4}H/i,'').replace(/\((24|30|36|48|60)\)/g,'').replace(/^[_\s]+/,''):'';
    return {key:raw,raw,project,rent,term,version,detail};
  }
  function specification(raw){
    const original=text(raw.colorless_model||raw.colorlessModel||raw.model);
    // Only a delimited parenthesised suffix after storage is colour syntax.
    // Other unknown tokens/bundles stay part of the model identity.
    const colourless=original.replace(/((?:\d+\s*(?:GB|TB|G)))\s*-\((?:宇宙橙|勃根地紅|午夜|星光|太空灰|鈦原色|黑色?|白色?|藍色?|粉色?|黃色?|綠色?|紫色?|銀色?|金色?)\)/gi,'$1');
    const memory=colourless.match(/(\d+)\s*(?:GB|G)\s*\/\s*(\d+)\s*(GB|TB|G)\b/i);
    const storageModel=colourless.replace(/\((?:4|5)G\)/gi,'');
    const storageMatch=Array.from(storageModel.matchAll(/(?:^|[_\s])(\d+)\s*(GB|TB|G)\b/gi)).find(match=>!(match[2].toUpperCase()==='G'&&['4','5'].includes(match[1])));
    const storage=memory?memory[2]+(memory[3].toUpperCase()==='TB'?'TB':'GB'):(storageMatch?storageMatch[1]+storageMatch[2]:'');
    const capacity=storage.replace(/G$/i,'GB').toUpperCase();
    const ram=memory?memory[1]+'GB':'';
    let model=colourless;
    if(memory)model=model.replace(memory[0],' ');
    else if(storageMatch)model=model.replace(storageMatch[0],' ');
    model=model.replace(/[_\s]+/g,' ').trim();
    return {model,capacity,ram,specKey:colourless};
  }
  function valueSignature(value){
    const state=Core.priceState(value);
    if(state.missing)return ['missing'];
    const raw=text(value);
    const numeric=typeof value==='number'?value:/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(raw)?Number(raw.replace(/,/g,'')):NaN;
    return Number.isFinite(numeric)?['number',numeric]:['text',text(value)];
  }
  function buildIndex(snapshot){
    const merged=new Map(), columns=new Map();
    Core.rowList(snapshot).forEach(raw=>{
      const row=Core.shoppingRow(raw),spec=specification(raw);
      row.projectPrices.forEach(price=>{if(!columns.has(price.name))columns.set(price.name,condition(price.name));});
      const signature=JSON.stringify([row.sourceSheet,row.brand,spec.specKey,valueSignature(row.retailPrice),Object.keys(row.prices).sort().map(key=>[key,valueSignature(row.prices[key])])]);
      if(!merged.has(signature))merged.set(signature,{...row,...spec,models:[],codes:[],sourceCount:0});
      const target=merged.get(signature);target.sourceCount++;
      if(!target.models.includes(row.model))target.models.push(row.model);
      if(row.code&&!target.codes.includes(row.code))target.codes.push(row.code);
    });
    return {rows:Array.from(merged.values()),columns:Array.from(columns.values()).sort((a,b)=>a.project.localeCompare(b.project,'zh-Hant')||Number(a.rent)-Number(b.rent)||Number(a.term)-Number(b.term)||a.version.localeCompare(b.version,'zh-Hant')||a.raw.localeCompare(b.raw,'zh-Hant'))};
  }
  function enterpriseCondition(column){return /企客|企業|員工眷|榮耀之星/.test(column.raw);}
  function scopeColumns(columns,filters){return columns.filter(col=>!filters.segment||(filters.segment==='enterprise'?enterpriseCondition(col):!enterpriseCondition(col)));}
  function hasQuote(row,column){return Object.prototype.hasOwnProperty.call(row.prices,column.key)&&!Core.priceState(row.prices[column.key]).missing;}
  function scopeRows(index,filters){const columns=scopeColumns(index.columns,filters);return index.rows.filter(row=>columns.some(col=>filters.segment==='enterprise'?hasQuote(row,col):Object.prototype.hasOwnProperty.call(row.prices,col.key)));}
  function options(index,filters={}){
    const scoped=scopeRows(index,filters);
    const rows=scoped.filter(row=>!filters.brand||row.brand===filters.brand);
    const models=rows.filter(row=>!filters.model||row.model===filters.model);
    const modelRows=models.filter(row=>!filters.capacity||row.capacity===filters.capacity);
    const keys=new Set(modelRows.flatMap(row=>Object.keys(row.prices)));
    const relevant=scopeColumns(index.columns,filters).filter(col=>keys.has(col.key)&&(filters.segment!=='enterprise'||modelRows.some(row=>hasQuote(row,col))));
    const plans=relevant.filter(col=>!filters.project||col.project===filters.project);
    return {brands:unique(scoped.map(row=>row.brand)),models:unique(rows.map(row=>row.model)),capacities:unique(models.map(row=>row.capacity).filter(Boolean)),projects:unique(relevant.map(col=>col.project)),versions:unique(plans.map(col=>col.version)),rents:unique(plans.map(col=>col.rent).filter(Boolean)),terms:unique(plans.map(col=>col.term).filter(Boolean))};
  }
  function selectColumns(columns,filters){
    return columns.filter(col=>(!filters.project||col.project===filters.project)&&(!filters.version||col.version===filters.version)&&(!filters.term||col.term===filters.term)&&(!filters.rent||(filters.rent==='common'?(!col.rent||['999','1399'].includes(col.rent)):col.rent===filters.rent)));
  }
  function buildView(index,filters={}){
    const query=text(filters.query).toLocaleLowerCase();
    const rows=scopeRows(index,filters).filter(row=>(!filters.brand||row.brand===filters.brand)&&(!filters.model||row.model===filters.model)&&(!filters.capacity||row.capacity===filters.capacity)&&(!query||[row.brand,row.model,row.capacity,row.ram,row.sourceSheet,...row.models,...row.codes,...Object.keys(row.prices)].join(' ').toLocaleLowerCase().includes(query)));
    const keys=new Set(rows.flatMap(row=>Object.keys(row.prices)));
    const columns=selectColumns(scopeColumns(index.columns,filters).filter(col=>keys.has(col.key)&&(filters.segment!=='enterprise'||rows.some(row=>hasQuote(row,col)))),filters);
    const matching=rows.filter(row=>columns.some(col=>filters.segment==='enterprise'?hasQuote(row,col):Object.prototype.hasOwnProperty.call(row.prices,col.key)));
    const rowOffset=Math.max(0,Number(filters.rowPage||0))*20, columnOffset=Math.max(0,Number(filters.columnPage||0))*12;
    return {rows:matching.slice(rowOffset,rowOffset+20),columns:columns.slice(columnOffset,columnOffset+12),totalRows:matching.length,totalColumns:columns.length,rowPages:Math.max(1,Math.ceil(matching.length/20)),columnPages:Math.max(1,Math.ceil(columns.length/12)),options:options(index,filters)};
  }
  function cell(row,column){
    if(!Object.prototype.hasOwnProperty.call(row.prices,column.key))return {kind:'absent',text:'未列此條件'};
    const value=row.prices[column.key],state=Core.priceState(value);
    return {kind:state.missing?'missing':state.zero?'zero':'price',value,text:Core.formatPrice(value)};
  }
  return Object.freeze({condition,specification,buildIndex,options,selectColumns,buildView,cell});
});
