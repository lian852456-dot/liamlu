// Bounded OOXML inspection, never OCR. Text behind a large picture is withheld.
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,m=>{const v=m.slice(1,-1);return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v]??String.fromCodePoint(v[1]?.toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1)));});
const tag=(s,name)=>Array.from(s.matchAll(new RegExp(`<(?:[\\w]+:)?${name}\\b[^>]*>[\\s\\S]*?<\\/(?:[\\w]+:)?${name}>`,'g')),m=>m[0]);
const attr=(s,k)=>decode(s.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1]||'');
const safeXml=s=>{if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('不支援含外部實體的簡報');return s;};
const pathFor=target=>{const parts=['ppt'];for(const v of target.split('/')){if(v==='..')parts.pop();else if(v!=='.')parts.push(v);}const path=parts.join('/');if(!/^ppt\/slides\/slide\d+\.xml$/.test(path))throw Error('行銷簡報頁面路徑不符');return path;};
export async function inspectMarketing(zip){
  const presentation=safeXml(await zip.file('ppt/presentation.xml')?.async('string')||'');
  const rels=safeXml(await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')||'');
  if(!presentation||!rels)throw Error('不是可讀取的PPTX簡報；PPT請在本機PowerPoint另存PPTX');
  const relationships=Array.from(rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*\/?\s*>/g),m=>m[0]);
  const slides=Array.from(presentation.matchAll(/<(?:\w+:)?sldId\b[^>]*\/?\s*>/g),m=>m[0]);
  if(!slides.length||slides.length>200)throw Error('行銷簡報需為1–200頁，請依當期章節分檔');
  const size=presentation.match(/<(?:\w+:)?sldSz\b[^>]*>/)?.[0]||'',width=+attr(size,'cx'),height=+attr(size,'cy');
  if(!width||!height)throw Error('簡報缺少頁面尺寸');const pages=[];
  for(let i=0;i<slides.length;i++){
    const rid=attr(slides[i],'r:id'),rel=relationships.find(r=>attr(r,'Id')===rid);
    if(!rel||attr(rel,'TargetMode')==='External')throw Error('不支援外部簡報頁面');
    const path=pathFor(attr(rel,'Target')),file=zip.file(path);if(!file)throw Error('簡報頁面缺少');
    const xml=safeXml(await file.async('string'));if(xml.length>8*1024*1024)throw Error('單頁XML過大，請分檔');
    const pictures=tag(xml,'pic');let covered=false;
    for(const pic of pictures){const ext=pic.match(/<(?:\w+:)?ext\b[^>]*\bcx="\d+"[^>]*>/)?.[0]||'';if(+attr(ext,'cx')>=width*.8&&+attr(ext,'cy')>=height*.8)covered=true;}
    // Group transforms cannot be safely flattened in this lightweight reader.
    if(tag(xml,'grpSp').some(g=>/<(?:\w+:)?pic\b/.test(g)))covered=true;
    const native=covered?'':tag(xml,'t').map(t=>decode(t.replace(/^<[^>]+>|<\/[^>]+>$/g,''))).join(' ').replace(/\s+/g,' ').trim();
    const excerpt=native.slice(0,1200),periods=[...new Set(native.match(/20\d{2}[年./-]\d{1,2}(?:月|[./-]\d{1,2})?|\d{1,2}月/g)||[])].slice(0,20);
    pages.push({page:i+1,text:excerpt,truncated:native.length>1200,imageCount:pictures.length,covered,periods,status:covered?'主要圖片或群組圖片：未OCR，底層舊文字不採用':pictures.length?'只擷取原生文字；圖片內容另待人工核對':native?'已擷取原生文字，政策期間與內容待人工核對':'未找到原生文字，需人工核對'});
  }
  return {contract:'operations-marketing-pptx-v1',pages,pageCount:pages.length,caution:'來源頁號可追溯；不自動判定當期政策，不OCR圖片，不自動覆蓋範本政策頁。'};
}
