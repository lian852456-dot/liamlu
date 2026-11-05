(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TradeinReferenceCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const GRADES=Object.freeze({dianzi:['A','B','C'],fdi:['S','A','B','C']});
  const VENDORS=Object.freeze({dianzi:'點子行動（愛鋒派）',fdi:'FutureDial（FDI）'});
  // These are exactly the original reference's outbound destinations. No
  // device, employee, customer, price, token or page URL is appended.
  const LINKS=Object.freeze({dianzi:'https://twm.phonedoctorbiz.com/app/download.html',fdiPhone:'https://smi-wpi.futuredial.com/zh/',fdiMac:'https://smi-wpi.futuredial.com/pc/'});
  const str=value=>typeof value==='string'?value.trim():'';
  function error(message){throw new Error('舊換新參考資料：'+message);}
  function text(value,max=2000){const result=str(value);if(result.length>max)error('文字過長');return result;}
  function date(value,optional=false){if(optional&&!value)return '';if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)error('日期不正確');return value;}
  function money(value){if(value==null||value==='')return null;if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9)error('價格須為非負數值');return value;}
  function sourceRow(value){return Number.isSafeInteger(value)&&value>0?value:null;}
  function normalize(raw){
    if(!raw||!Array.isArray(raw.devices)||!raw.devices.length||raw.devices.length>10000)error('缺少機款');
    const source={file:text(raw.source?.originalFile||raw.source?.file,800),date:date(raw.source?.date)};
    const sources=(Array.isArray(raw.sources)?raw.sources:[]).map(s=>{const start=date(s.date),end=date(s.validThrough);if(start>end)error('來源起訖日顛倒');return {file:text(s.file,400),sheet:text(s.sheet),date:start,validThrough:end,sha256:/^[a-f0-9]{64}$/.test(s.sha256||'')?s.sha256:''};});
    const ids=new Set();
    const devices=raw.devices.map((d,index)=>{
      const id=text(d.id,150)||'reference-'+(index+1);if(ids.has(id))error('機款ID重複');ids.add(id);
      if(!Array.isArray(d.variants)||!d.variants.length||d.variants.length>500)error('缺少原始色款');
      const variants=d.variants.map((v,vi)=>{
        if(!Array.isArray(v.items)||v.items.length>100)error('色款報價格式不正確');
        const rawModel=text(v.rawModel,1000);if(!rawModel)error('缺少原始機型');const seen=new Set();
        const items=v.items.map(i=>{
          if(!Object.hasOwn(GRADES,i.vendor)||!GRADES[i.vendor].includes(i.grade))error('回收商或分級不正確');
          if(text(d.category)==='Mac'&&(i.vendor!=='fdi'||i.grade==='S'))error('Mac來源須符合FDI A/B/C分級，未支援的資料不隱藏帶過');
          const key=i.vendor+'/'+i.grade;if(seen.has(key))error('同色款回收商分級重複');seen.add(key);
          return {vendor:i.vendor,grade:i.grade,price:money(i.price),part:text(i.part,200),name:text(i.name,1000),row:sourceRow(i.row??v.row)};
        });
        return {id:String(vi),rawModel,items};
      });
      const file=text(d.sourceFile,400)||sources.length===1&&sources[0].file||source.file;
      const known=sources.find(s=>s.file===file);
      const standard=d.standardSpec;
      const standardSpec=standard&&typeof standard==='object'?{cpu:Number.isFinite(standard.cpu)?standard.cpu:null,gpu:Number.isFinite(standard.gpu)?standard.gpu:null,memory:Number.isFinite(standard.memory)?standard.memory:null,storage:text(standard.storage,100)}:null;
      const gradeDefinitions=Object.fromEntries(['A','B','C'].map(g=>[g,text(d.gradeDefinitions?.[g],6000)]));
      return {id,brand:text(d.brand,100)||'來源未註明',category:text(d.category,100)||'來源未註明',model:text(d.model,500)||variants[0].rawModel,capacity:text(d.capacity,150)||'來源未註明',rawModel:text(d.rawModel,1000)||variants[0].rawModel,
        sourceFile:file,sourceSheet:text(d.sourceSheet,200)||known?.sheet||'',sourceDate:date(d.sourceDate||known?.date||source.date),validThrough:known?.validThrough||'',sourceRows:Array.isArray(d.sourceRows)?d.sourceRows.map(sourceRow).filter(x=>x!==null):[],standardSpec,gradeDefinitions,variants};
    });
    const qr=typeof raw.qr==='string'&&raw.qr.length<200000&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raw.qr)?raw.qr:'';
    return {source,sources,devices,qr};
  }
  function quote(device,vendor,grade,variantId=''){
    const variants=variantId===''?device.variants:device.variants.filter(v=>v.id===variantId);
    const items=variants.map(v=>v.items.find(i=>i.vendor===vendor&&i.grade===grade));
    const priced=items.filter(i=>i&&i.price!==null&&i.price>0).map(i=>i.price),zeros=items.some(i=>i?.price===0);
    const values=[...new Set(priced)].sort((a,b)=>a-b);
    if(zeros)return {kind:'pending',value:null,text:'待確認（來源為0）'};
    if(!priced.length)return {kind:'missing',value:null,text:'未提供報價'};
    if(priced.length!==variants.length)return {kind:'partial',value:null,text:'部分色款未報價'};
    if(values.length>1)return {kind:'range',value:null,text:values[0].toLocaleString('en-US')+'～'+values.at(-1).toLocaleString('en-US')+' 元（依色款）'};
    return {kind:'price',value:values[0],text:values[0].toLocaleString('en-US')+' 元'};
  }
  function compare(device,gradeD='A',gradeF='A',variantId=''){
    const dianzi=quote(device,'dianzi',gradeD,variantId),fdi=quote(device,'fdi',gradeF,variantId);
    if(device.category==='Mac')return {dianzi,fdi,diff:null,winner:null,text:'Mac 僅 FDI 報價'};
    if(dianzi.value===null||fdi.value===null)return {dianzi,fdi,diff:null,winner:null,text:'待核對，無法比較'};
    const diff=Math.abs(dianzi.value-fdi.value),winner=diff===0?'同價':dianzi.value>fdi.value?'點子行動':'FDI';
    return {dianzi,fdi,diff,winner,text:diff===0?'兩家同價':winner+' 多 '+diff.toLocaleString('en-US')+' 元'};
  }
  function validity(device,queryDate){date(queryDate);if(!device.validThrough)return {state:'unknown',text:'有效期未提供，待確認'};if(queryDate<device.sourceDate)return {state:'upcoming',text:'尚未到來源有效期'};if(queryDate>device.validThrough)return {state:'expired',text:'已過有效期，僅供歷史核對'};return {state:'active',text:'來源有效期內'};}
  function matches(device,filters={}){
    const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/gb/g,'g').replace(/\s+/g,'');
    return (!filters.brand||device.brand===filters.brand)&&(!filters.category||device.category===filters.category)&&
      (!filters.models?.length||filters.models.includes(device.model))&&(!filters.capacities?.length||filters.capacities.includes(device.capacity))&&
      String(filters.search||'').trim().split(/\s+/).filter(Boolean).every(t=>norm([device.brand,device.category,device.model,device.capacity,device.rawModel].join(' ')).includes(norm(t)));
  }
  function rows(catalog,filters={},gradeD='A',gradeF='A',sort='model'){
    return catalog.devices.filter(d=>matches(d,filters)).sort((a,b)=>{
      if(sort==='difference'){const delta=(compare(b,gradeD,gradeF).diff??-1)-(compare(a,gradeD,gradeF).diff??-1);if(delta)return delta;}
      if(sort==='highest'){const amount=d=>Math.max(quote(d,'dianzi',gradeD).value??-1,quote(d,'fdi',gradeF).value??-1);const delta=amount(b)-amount(a);if(delta)return delta;}
      return a.model.localeCompare(b.model,'zh-Hant',{numeric:true})||a.capacity.localeCompare(b.capacity,'zh-Hant',{numeric:true})||a.id.localeCompare(b.id);
    });
  }
  function specText(d){const s=d.standardSpec;return s?'標準版定義：CPU '+(s.cpu??'未提供')+' 核／GPU '+(s.gpu??'未提供')+' 核／記憶體 '+(s.memory??'未提供')+'GB／儲存 '+(s.storage||'未提供')+'；其餘規格歸升級版。':'來源未提供標準／升級規格定義。';}
  function quoteText(d,gradeD,gradeF,variantId,queryDate){
    const c=compare(d,gradeD,gradeF,variantId),v=validity(d,queryDate),variant=d.variants.find(x=>x.id===variantId);
    return ['【舊機回收參考報價】',d.model+' '+d.capacity,...(variant?[variant.rawModel]:[]),...(d.category==='Mac'?[]:['點子行動 '+gradeD+'等：'+c.dianzi.text]),'FDI '+gradeF+'等：'+c.fdi.text,c.text,
      ...(d.category==='Mac'?[specText(d),'FDI '+gradeF+'等條件：'+(d.gradeDefinitions[gradeF]||'來源未提供')]:[]),
      '來源：'+d.sourceFile+'／'+d.sourceSheet,'有效期：'+d.sourceDate+'～'+(d.validThrough||'未提供'),'核對日期：'+queryDate+'；'+v.text,
      '各家等級依各自實際檢測判定；來源0值為待確認，不能當作零元收購。','不含舊換新促案加碼及POS；此為參考，非成交承諾。'].join('\n');
  }
  return Object.freeze({GRADES,VENDORS,LINKS,normalize,quote,compare,validity,matches,rows,specText,quoteText});
});
