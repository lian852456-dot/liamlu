// Fictional test data only; no company workbooks or source points.
exports.goodSpeedTables=()=>{
  const stores=[[]],quantity=[[],[]],detail=[[],[]];
  const set=(row,map)=>{for(const [i,v]of Object.entries(map))row[+i]=v;};
  set(stores[0],{1:'督導區',2:'店點代碼',3:'店點',8:'12M筆數',9:'24M筆數',10:'36M筆數',17:'合計筆數',32:'好速成雙點數',43:'好速加掛點數',54:'好速合計點數'});
  set(quantity[0],{1:'督導區',2:'店名',3:'月份',10:'總目標',11:'總進度',12:'月底推估',36:'同期點數'});
  quantity[1][38]=(Date.UTC(2026,9,27)-Date.UTC(1899,11,30))/86400000;quantity[1][64]=(Date.UTC(2026,9,1)-Date.UTC(1899,11,30))/86400000;
  detail[0][65]='資料截止2026/10/27';
  set(detail[1],{1:'月份',2:'進件日',4:'認列分類',6:'單號',9:'業務分區',10:'進件店點代碼',48:'取消派工原因1',49:'取消派工原因2',50:'取消派工原因3',58:'是否為重複(取消)件'});
  for(const [i,suffix]of ['A','B','C','D'].entries()){
    const group='北一二'+suffix,code='DNB9000'+i,store=[];set(store,{1:group,2:code,3:'SYNTHETIC店'+suffix,8:0,9:2,10:1,17:3,32:2,43:1,54:3});stores.push(store);
    const q=[];set(q,{1:group,2:null,3:'10月',10:5,11:.9,12:4.5,36:2});quantity.push(q);
    const d=[];set(d,{1:'10月',2:'2026/10/20',4:'失敗件',6:'SYNTHETIC-order-'+i,9:'直營'+group,10:code,20:'PRIVATE-CUSTOMER-SENTINEL',46:'PRIVATE-FREE-NOTE',50:'C032 資料錯誤',58:'V'});detail.push(d);
  }
  return {'BB店點':stores,'BB量能':quantity,'BB明細':detail,'TBC明細':[['2023-11','PRIVATE-OLD-SENTINEL']]};
};
exports.marketingZip=async(JSZip,padding=0)=>{
  const z=new JSZip();
  z.file('ppt/presentation.xml','<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="first"/><p:sldId id="257" r:id="second"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
  z.file('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="first" Target="slides/slide2.xml"/><Relationship Id="second" Target="slides/slide1.xml"/></Relationships>');
  z.file('ppt/slides/slide2.xml','<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><a:t>SYNTHETIC行銷政策 2026年8月 &amp; 測試用</a:t></p:sp></p:spTree></p:cSld></p:sld>');
  z.file('ppt/slides/slide1.xml','<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><a:t>STALE-HIDDEN-TEXT-NEVER-ADOPT</a:t></p:sp><p:pic><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm></p:spPr></p:pic></p:spTree></p:cSld></p:sld>');
  if(padding)z.file('ppt/media/SYNTHETIC-35MiB-padding.bin',Buffer.alloc(padding));
  return z;
};
