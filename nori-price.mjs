import './price-model-view.js?v=20261015-color-groups-1';
import './threec-query-core.js?v=20261015-color-groups-1';
import './threec-comparison-core.js?v=20261028-enterprise-1';
import './threec-price-transport.js?v=20261001-load-1';
const core=globalThis.ThreecQueryCore, compare=globalThis.ThreecComparisonCore;
const transport=globalThis.ThreecPriceTransport;
const norm=s=>String(s ?? '').normalize('NFKC').toLowerCase().replace(/(\d)gb\b/g,'$1g').replace(/[\s()，、。？！?！：:_-]/g,'');
const endpoint='https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec';
function options(question) {
  let q=question.normalize('NFKC').toLowerCase();
  const rent=q.match(/(?:月租|資費)\s*(\d{3,4})|\b(\d{3,4})\s*(?=\(|型|元|\/)/);
  const term=q.match(/(?:合約\s*)?(24|30|36|48|60)\s*(?:個月|期)|\((24|30|36|48|60)\)/);
  const grade=q.match(/([sabc])\s*級/);
  const provider=core.PROVIDERS.find(p=>q.includes(p) || (p.includes('FDI') && /fdi|futuredial/.test(q)));
  const trade=/回收|舊機|舊換新|折抵|估價/.test(q),retail=/空機|原價|建議售價/.test(q);
  for(const token of [rent?.[0],term?.[0],grade?.[0],provider])if(token)q=q.replace(token,'');
  const model=norm(q.replace(/幫我查|請問|查詢|查價|報價|舊換新|舊機|回收價|回收|價格|專案價|折抵|估價|空機價|空機|原價|建議售價|值多少|多少錢|多少|多少元|合約|專案|資費|月租|型|元|的|是|嗎|fdi|futuredial|一般|企業用戶|企客/g,''));
  return {model,rent:rent?.[1] || rent?.[2],term:term?.[1] || term?.[2],grade:grade?.[1].toUpperCase(),provider,trade,retail,enterprise:/企客|企業/.test(question)};
}
function matchModel(rows,model){
  function keys(row){
    const names=[row.model,row.model+(row.capacity || ''),row.colorlessModel,...(row.models || row.sourceModels || [])].filter(Boolean);
    const brand=norm(row.brand);
    return names.flatMap(name=>{
      const raw=norm(name);
      // The formal catalog often spells out the brand or includes a (5G) marker.
      // Retain storage, Pro/Max, RAM and bundle labels. Report every matching variant.
      const variants=[raw,norm(name.replace(/\((?:4|5)G\)/gi,''))];
      return variants.flatMap(v=>[v,brand+v,brand && v.startsWith(brand)?v.slice(brand.length):v]);
    });
  }
  const exact=rows.filter(row=>keys(row).includes(model));
  if(exact.length)return exact;
  return [];
}
export function priceAnswer(result,question){
  const o=options(question),kind=o.trade?'tradein':'shopping';
  const meta=core.sourceMeta(result.snapshot,result.registry,kind);
  if(result.status!=='ok' || !result.snapshot || result.snapshot.kind!==kind || !meta.sourceVersionDate || !meta.snapshotHash)return '正式價表的來源日期或版本尚未確認。';
  const date='價表版本日期 '+meta.sourceVersionDate+'。';
  const index=o.trade?null:compare.buildIndex(result.snapshot);
  const rows=matchModel(o.trade?core.filterTradein(result.snapshot,{}):index.rows,o.model);
  if(!rows.length)return '正式價表查無這個完整規格。請用價表上的機型與容量提問。'+date;
  const quotes=new Set();
  for(const row of rows){
    const model=[row.model,row.capacity].filter(Boolean).join(' ');
    if(o.trade){
      for(const provider of core.quotedProviders(row,o.provider,o.grade))for(const grade of core.quotedGrades(row,provider,o.grade))
        quotes.add(model+' '+provider+' '+core.gradeLabel(grade)+' '+core.formatPrice(row.quotes[provider][grade]));
    }else if(o.retail){
      if(!core.priceState(row.retailPrice).missing)quotes.add(model+' 空機價 '+core.formatPrice(row.retailPrice));
    }else{
      const columns=compare.selectColumns(index.columns.filter(col=>o.enterprise===/企客|企業|員工眷|榮耀之星/.test(col.raw)),{rent:o.rent || '',term:o.term || ''});
      for(const col of columns.filter(c=>(!o.rent || c.rents.includes(o.rent)) && (!o.term || c.term===o.term) && compare.hasQuote(row,c)))
        quotes.add(model+' '+col.raw+' '+compare.cell(row,col).text);
    }
  }
  if(!quotes.size)return '這個機型與條件在正式價表沒有報價。'+date;
  if(quotes.size>6)return '這個規格有 '+quotes.size+' 筆不同報價。'+(o.trade?'請加上回收商與等級。':'請指定月租與期數，或在查價系統比較各專案。')+date;
  return [...quotes].join('；')+'。'+date;
}
export async function readPrice(question,signal) {
  const o=options(question);
  if(!o.model)return o.trade?'請輸入機型、容量，可再加回收商及等級。':'請輸入機型、容量、月租與期數，例如「機型 256GB 月租999 24期 專案價」。';
  const url=new URL(endpoint);url.searchParams.set('readAttempt',crypto.randomUUID());
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',cache:'no-store',signal,body:JSON.stringify({action:'threec_snapshot_read',kind:o.trade?'tradein':'shopping',includeChanges:false,priceEncoding:transport.ENCODING})});
  if(!response.ok)throw Error('無法讀取正式價表');
  return priceAnswer(transport.decode(await response.json()),question);
}
