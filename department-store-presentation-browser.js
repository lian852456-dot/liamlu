(function (root) {
  'use strict';
  const C=root.DepartmentStorePresentation;
  const base=new URL('.',document.currentScript?.src || location.href);
  const vendorURL=new URL('assets/vendor/store-presentation/pptxgenjs-4.0.1.bundle.js',base);
  let loading=null;
  function loadVendor() {
    if(vendorURL.origin!==location.origin)throw new Error('簡報套件必須由網站同源載入');
    const current=root.pptxgen || root.PptxGenJS;
    if(typeof current==='function' && new current().version==='4.0.1') return Promise.resolve(current);
    if(loading) return loading;
    loading=new Promise((resolve,reject)=>{
      const s=document.createElement('script');s.src=vendorURL.href;s.async=true;
      s.onload=()=>{const ctor=root.pptxgen || root.PptxGenJS || (typeof pptxgen==='function'?pptxgen:null);ctor?resolve(ctor):reject(new Error('簡報套件初始化失敗'));};
      s.onerror=()=>{s.remove();loading=null;reject(new Error('簡報套件讀取失敗，請重新下載或確認網站離線資產'))};
      document.head.appendChild(s);
    });return loading;
  }
  function buildDeck(source,PptxGenJS,{fontFace='Heiti TC'}={}) {
    if(!C||source.contract!==C.CONTRACT)throw new Error('簡報資料契約不符');const pages=C.planPages(source);
    const ppt=new PptxGenJS();ppt.defineLayout({name:'STORE16x9',width:1600/96,height:900/96});ppt.layout='STORE16x9';
    ppt.author='北一二部';ppt.subject='店務管理月報';ppt.title='店務管理成績表現';ppt.lang='zh-TW';ppt.theme={headFontFace:fontFace,bodyFontFace:fontFace,lang:'zh-TW'};
    const color=v=>v.replace('#',''),NAVY='173C6A',GREY='73849B',RED='DE404B',GREEN='129953',ORANGE='DC8412';
    const txt=(s,t,x,y,w,h,size=22,c=NAVY,bold=false)=>s.addText(String(t),{x:x/96,y:y/96,w:w/96,h:h/96,fontFace,fontSize:size*.75,color:c,bold,margin:0,breakLine:false,valign:'mid'});
    const box=(s,x,y,w,h,c='DCE5F0')=>s.addShape(ppt.ShapeType.roundRect,{x:x/96,y:y/96,w:w/96,h:h/96,rectRadius:.06,fill:{color:'FFFFFF'},line:{color:c,width:.7},radius:.05});
    const table=(s,values,x,y,w,widths,size=20,row=27,cellStyle=null)=>{
      const cells=values.map((rr,ri)=>rr.map((v,ci)=>({text:String(v),options:{fill:ri===0?'EEF3F8':ri%2?'FFFFFF':'F8FAFC',color:NAVY,bold:true,align:ci===0?'left':'center',...(cellStyle?.(ri,ci)||{})}})));
      s.addTable(cells,{x:x/96,y:y/96,w:w/96,colW:widths.map(n=>n*w/widths.reduce((a,b)=>a+b,0)/96),rowH:values.map((_,i)=>(i===0?30:Array.isArray(row)?row[i-1]:row)/96),margin:[1/96,3/96,1/96,3/96],fontFace,fontSize:size*.75,color:NAVY,align:'center',valign:'middle',border:{type:'solid',pt:.5,color:'E5EDF5'},autoPage:false,verbose:false});
    };
    for(const page of pages){const model=page.model;
    const month=String(Number(model.targetMonth.slice(5))),scope=`${model.scope}　${model.storeCount}家店`;
    const header=(s,title,sub)=>{s.background={color:'FFFFFF'};txt(s,'TWM',40,26,120,42,30,NAVY,true);txt(s,title,175,22,1210,63,44,NAVY,true);txt(s,sub,40,88,1500,32,20,GREY);};
    const kpi=(s,i,label,value,caption,c=NAVY)=>{const x=40+i*383;box(s,x,133,365,106);txt(s,label,x+18,142,330,32,26,NAVY,true);txt(s,value,x+18,172,335,48,48,c,true);txt(s,caption,x+18,215,334,24,18,GREY);};
    if(page.kind==='trend'){const a=ppt.addSlide();header(a,`店舖近${model.period.length===6?'半年':model.period.length+'月'}店務管理成績表現${page.part>1?'（續'+page.part+'）':''}`,`${model.period[0].replace('-','.')} - ${model.period.at(-1).replace('-','.')}　${scope}`);
    kpi(a,0,model.period.length===6?'近半年平均':'所選期間平均',C.fmt(model.summary.mean),'有效 '+model.summary.valid+'筆店月');
    kpi(a,1,month+'月平均',C.fmt(model.single.mean),'當月原G成績','277DD3');kpi(a,2,month+'月滿分',`${model.single.perfect} / ${model.single.valid}`,'滿分率 '+C.fmt((model.single.rate==null?null:model.single.rate*100),1)+'%',GREEN);
    kpi(a,3,'連續6月滿分',model.sixMonthEligibilityEvaluated?model.sixPerfectTotal+'店':'未評估','完整6月資料資格',ORANGE);
    model.regions.forEach((r,i)=>{const x=40+i%2*612,y=266+Math.floor(i/2)*284;box(a,x,y,596,i<2?282:294,color(r.color));txt(a,r.region,x+14,y+4,340,32,30,color(r.color),true);txt(a,'平均 '+C.fmt(r.half.mean),x+385,y+7,197,28,20,GREY,true);
      const widths=[148,...model.period.map(()=>60),60],total=widths.reduce((a,b)=>a+b,0),ww=widths.map(v=>v*568/total);
      table(a,[['店舖',...model.period.map(m=>m.slice(5)),'平均'],...r.rows.map(s=>[s.store,...s.cells.map(c=>C.fmt(c.score)),C.fmt(s.mean)])],x+14,y+38,568,ww,17,21,(ri,ci)=>{if(!ri||!ci)return {};const rr=r.rows[ri-1],v=ci<=rr.cells.length?rr.cells[ci-1].score:rr.mean;return {color:v==null?GREY:v===100?GREEN:RED,fill:v==null?'EEF1F5':v===100?'E6F4E9':'FBE9E9'};});});
    box(a,1276,266,284,318,'EFB56F');txt(a,'連續6月滿分',1292,276,254,37,27,ORANGE,true);
    if(model.sixMonthEligibilityEvaluated){model.sixPerfect.slice(0,6).forEach((v,i)=>txt(a,v.store,1292,324+i*34,254,30,23,NAVY,true));if(model.sixPerfect.length>6)txt(a,`共${model.sixPerfect.length}店，完整名單見備註`,1292,528,254,25,18,GREY);}else txt(a,'資料不足6月，未評估',1292,328,254,65,23,NAVY,true);
    txt(a,'SPE +1規則及核定\n由管理者確認',1292,536,250,42,18,ORANGE);box(a,1276,600,284,234,'EEA7AC');txt(a,month+'月重點',1292,609,254,35,28,RED,true);
    txt(a,`未滿100分 ${model.single.low}店\n連續未滿100 ${model.single.continuous}店\n缺資料 ${model.single.missingStores}店`,1292,658,254,108,24,NAVY,true);txt(a,`完整未滿分清單見第${page.firstMonthlyPage}頁起`,1292,789,254,27,19,GREY);
    txt(a,'平均採有效店月原G成績。灰色—代表缺資料。店舖歷史未回填現任店長。',40,852,1500,30,18,GREY);
    a.addNotes(JSON.stringify({period:model.period,summary:model.summary,regions:model.regions,sixPerfect:model.sixPerfect,notices:model.notices}));
    txt(a,`${page.pageNumber} / ${page.totalPages}`,1460,883,100,17,16,GREY);
    }else{const b=ppt.addSlide();header(b,`${model.targetMonth.slice(0,4)}年${month}月店務成績表現${page.part>1?'（續'+page.part+'）':''}`,`${scope}　依成績由低至高排列，完整呈現未滿分店點`);
    kpi(b,0,month+'月平均',C.fmt(model.single.mean),'當月有效成績 '+model.single.valid+'店','277DD3');kpi(b,1,'100分店數',`${model.single.perfect} / ${model.single.valid}`,'滿分率 '+C.fmt((model.single.rate==null?null:model.single.rate*100),1)+'%',GREEN);kpi(b,2,'未達100分',model.single.low+'店','缺資料 '+model.single.missingStores+'店',RED);kpi(b,3,'連續未滿100',model.single.continuous+'店','往前連續至少2月',ORANGE);
    txt(b,'未達100分店點排序',40,264,1130,44,30,RED,true);
    const deficit=[['序','區域','店舖',month+'月','連續','扣分','缺失原因'],...model.lowScores.map(r=>[r.order,r.region,r.store,C.fmt(r.score),r.streak>=2?'連'+r.streak+'月':'—',C.fmt(r.deduction),C.reasonText(r)])];
    if(!model.lowScores.length)deficit.push(['—','—',model.lowScoresTotal?'此頁無續列':'無未滿分店點','—','—','—','—']);
    table(b,deficit,40,314,1086,[42,98,146,76,90,76,558],20,model.lowRowHeights.length?model.lowRowHeights:[42],(ri,ci)=>ri?ci===6?{fontSize:13.5,align:'left'}:[3,5].includes(ci)?{color:RED}:{}:{});
    txt(b,'區域表現',1152,267,408,38,28,NAVY,true);table(b,[['區','平均','滿分/有效','%'],...model.regions.map(r=>[r.region,C.fmt(r.single.mean,1),`${r.single.perfect}/${r.single.valid}`,C.fmt((r.single.rate==null?null:r.single.rate*100),1)])],1152,314,408,[106,88,123,91],21,29,(ri,ci)=>ri&&ci===0?{color:color(model.regions[ri-1].color)}:{});
    txt(b,'缺失原因 TOP',1152,490,408,38,28,ORANGE,true);table(b,[['原因（涉及店數）','店'],...model.reasonTop.map(r=>[r.category,r.stores])],1152,536,408,[335,73],21,model.reasonRowHeights);
    txt(b,'同店可多類，總數不必等於未滿分店數。',1152,788,408,62,20,GREY);
    txt(b,'連續以當月往前逐月未滿100檢查，缺月即中斷。除台日/頁次/查核分數另列，其餘分項為原表單位。\n扣分為原F值，未換算件數。最長連續僅確認所選期間，期間之前未評估。',40,846,1500,46,18,GREY);
    b.addNotes(JSON.stringify({summary:model.single,lowScores:model.lowScores,reasonTop:model.reasonTop,notices:model.notices}));
    txt(b,`${page.pageNumber} / ${page.totalPages}`,1460,883,100,17,16,GREY);
    }}return ppt;
  }
  function createExporter({getBrief,isAuthorized,getOptions=()=>({}),onStatus=()=>{}}) {
    if(typeof getBrief!=='function'||typeof isAuthorized!=='function')throw new Error('需提供既有成績與督導授權檢查');
    let epoch=0,pending=false;const popups=new Set();
    const check=e=>{if(!isAuthorized())throw new Error('督導驗證已結束，取消匯出');if(e!==epoch)throw new Error('篩選或資料已變更，取消匯出');};
    return {
      invalidate(){epoch++;for(const w of popups)w.close();popups.clear();},
      async downloadPptx(){if(pending)throw new Error('簡報正在產生，請稍候');const e=epoch;check(e);const model=C.buildModel(getBrief(),getOptions());C.assertCapacity(model);pending=true;onStatus('正在產生可編輯PPT…');
        try{const Pptx=await loadVendor();check(e);const deck=buildDeck(model,Pptx),blob=await deck.write({outputType:'blob',compression:true});check(e);if(!(blob instanceof Blob)||blob.size<1000)throw new Error('簡報輸出無效');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`北一二部_店務_${model.period[0]}_${model.targetMonth}.pptx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);onStatus('PPT已產生並下載');return {bytes:blob.size,slides:C.planPages(model).length};}finally{pending=false;}
      },
      printPdf(){const e=epoch;check(e);const html=C.renderPrintHtml(C.buildModel(getBrief(),getOptions()));check(e);const w=window.open('','_blank');if(!w)throw new Error('請允許開啟列印預覽');popups.add(w);w.document.open();w.document.write(html);w.document.close();onStatus('請於預覽按「列印／儲存為PDF」');return w;},
      get busy(){return pending;}
    };
  }
  root.DepartmentStorePresentationBrowser={loadVendor,buildDeck,createExporter};
})(window);
