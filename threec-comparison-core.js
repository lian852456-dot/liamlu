(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./threec-query-core.js'):root.ThreecQueryCore,node?require('./price-model-view.js'):root.PriceModelView);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ThreecComparisonCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core,Models){
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
  const specification=Models.specification;
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
      const signature=JSON.stringify([row.sourceSheet,Models.identity(raw),valueSignature(row.retailPrice),Object.keys(row.prices).sort().map(key=>[key,valueSignature(row.prices[key])])]);
      if(!merged.has(signature))merged.set(signature,{...row,...spec,models:[],codes:[],sourceCount:0});
      const target=merged.get(signature);target.sourceCount++;
      if(!target.models.includes(row.model))target.models.push(row.model);
      if(row.code&&!target.codes.includes(row.code))target.codes.push(row.code);
    });
    return {rows:Array.from(merged.values()),columns:Array.from(columns.values()).sort((a,b)=>a.project.localeCompare(b.project,'zh-Hant')||Number(a.rent)-Number(b.rent)||Number(a.term)-Number(b.term)||a.version.localeCompare(b.version,'zh-Hant')||a.raw.localeCompare(b.raw,'zh-Hant'))};
  }
  function enterpriseCondition(column){return /企客|企業|員工眷|榮耀之星/.test(column.raw);}
  function scopeColumns(columns,filters){return columns.filter(col=>!filters.segment||(filters.segment==='enterprise'?enterpriseCondition(col):!enterpriseCondition(col)));}
  function hasPrice(value){if(typeof value==='number')return Number.isFinite(value);if(typeof value!=='string')return false;const raw=value.trim();return /^\d+(?:,\d{3})*(?:\.\d+)?$/.test(raw)&&Number.isFinite(Number(raw.replace(/,/g,'')));}
  function hasQuote(row,column){return Object.prototype.hasOwnProperty.call(row.prices,column.key)&&hasPrice(row.prices[column.key]);}
  function scopeRows(index,filters){const columns=scopeColumns(index.columns,filters);return index.rows.filter(row=>columns.some(col=>hasQuote(row,col)));}
  function options(index,filters={}){
    const scoped=scopeRows(index,filters);
    const rows=scoped.filter(row=>!filters.brand||row.brand===filters.brand);
    const models=rows.filter(row=>!filters.model||row.model===filters.model);
    const modelRows=models.filter(row=>!filters.capacity||row.capacity===filters.capacity);
    const keys=new Set(modelRows.flatMap(row=>Object.keys(row.prices)));
    const relevant=scopeColumns(index.columns,filters).filter(col=>keys.has(col.key)&&modelRows.some(row=>hasQuote(row,col)));
    const plans=relevant.filter(col=>!filters.project||col.project===filters.project);
    return {brands:unique(scoped.map(row=>row.brand)),models:unique(rows.map(row=>row.model)),capacities:unique(models.map(row=>row.capacity).filter(Boolean)),projects:unique(relevant.map(col=>col.project)),versions:unique(plans.map(col=>col.version)),rents:unique(plans.map(col=>col.rent).filter(Boolean)),terms:unique(plans.map(col=>col.term).filter(Boolean))};
  }
  function selectColumns(columns,filters){
    return columns.filter(col=>(!filters.project||col.project===filters.project)&&(!filters.version||col.version===filters.version)&&(!filters.term||col.term===filters.term)&&(!filters.rent||(filters.rent==='common'?(!col.rent||['999','1399'].includes(col.rent)):col.rent===filters.rent)));
  }
  // Default option lists remain compatible; the query UI can skip unused catalog sorts.
  function buildView(index,filters={},viewOptions={}){
    const query=text(filters.query).toLocaleLowerCase();
    // Accept compact model names such as iphone17 without joining unrelated fields.
    const modelQuery=query.replace(/\s+/g,'');
    const searchColumns=scopeColumns(index.columns,filters);
    const rows=scopeRows(index,filters).filter(row=>(!filters.brand||row.brand===filters.brand)&&(!filters.model||row.model===filters.model)&&(!filters.capacity||row.capacity===filters.capacity)&&(!query||[row.brand,row.model,row.capacity,row.ram,row.sourceSheet,...row.models,...row.codes,...searchColumns.filter(col=>hasQuote(row,col)).map(col=>col.raw)].join(' ').toLocaleLowerCase().includes(query)||[row.model,...row.models].some(model=>model.toLocaleLowerCase().replace(/\s+/g,'').includes(modelQuery))));
    const keys=new Set(rows.flatMap(row=>Object.keys(row.prices)));
    const columns=selectColumns(scopeColumns(index.columns,filters).filter(col=>keys.has(col.key)&&rows.some(row=>hasQuote(row,col))),filters);
    const rowOffset=Math.max(0,Number(filters.rowPage||0))*20, columnOffset=Math.max(0,Number(filters.columnPage||0))*12;
    const pageColumns=columns.slice(columnOffset,columnOffset+12);
    const cardMode=viewOptions.cardConditionKey!=null;
    // Card selection spans every eligible condition; the 12-column groups
    // belong only to the horizontal comparison table.
    let cardColumn=cardMode?columns.find(col=>col.key===viewOptions.cardConditionKey):null;
    if(cardMode&&!cardColumn){
      const counts=new Map(columns.map(col=>[col.key,rows.filter(row=>hasQuote(row,col)).length]));
      cardColumn=columns.slice().sort((a,b)=>counts.get(b.key)-counts.get(a.key))[0];
    }
    // Match before row pagination so card counts and pages include priced rows only.
    const matching=rows.filter(row=>cardMode?(cardColumn&&hasQuote(row,cardColumn)):pageColumns.some(col=>hasQuote(row,col)));
    const pageRows=matching.slice(rowOffset,rowOffset+20);
    // Keep keyed cell positions; omit columns with no quotes on this row page.
    const visibleColumns=cardMode?columns:pageColumns.filter(col=>pageRows.some(row=>hasQuote(row,col)));
    return {rows:pageRows,columns:visibleColumns,cardConditionKey:cardColumn?cardColumn.key:null,totalRows:matching.length,totalColumns:columns.length,rowPages:Math.max(1,Math.ceil(matching.length/20)),columnPages:cardMode?1:Math.max(1,Math.ceil(columns.length/12)),options:viewOptions.includeOptions===false?null:options(index,filters)};
  }
  function cell(row,column){
    if(!Object.prototype.hasOwnProperty.call(row.prices,column.key))return {kind:'absent',text:'未列此條件'};
    const value=row.prices[column.key],state=Core.priceState(value);
    return {kind:state.missing?'missing':state.zero?'zero':'price',value,text:Core.formatPrice(value)};
  }
  return Object.freeze({condition,specification,buildIndex,hasPrice,hasQuote,options,selectColumns,buildView,cell});
});
