(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SupervisorVisitChecklist=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EFFECTIVE_DATE='2026-11-01';
  // Stable IDs keep the new checklist separate from existing 1–9 / 1–18 records.
  const ITEMS=Object.freeze([
  {
    "item": 101,
    "no": "1",
    "category": "文件類",
    "text": "【文件資料銷毀登記表】回送銷毀時需填寫完整，每一欄位都要填（例如：物流單號、物流實際收貨日期）",
    "deduction": "缺失扣1分"
  },
  {
    "item": 102,
    "no": "2",
    "category": "文件類",
    "text": "待銷毀文件以月為單位打包，並貼上封箱標籤 (需有店長簽名)",
    "deduction": "缺失扣1分"
  },
  {
    "item": 103,
    "no": "3",
    "category": "文件類",
    "text": "待銷毀文件需統一置於上鎖文件櫃",
    "deduction": "缺失扣1分"
  },
  {
    "item": 104,
    "no": "4.1",
    "category": "文件類",
    "text": "電信資費存根聯(帳單)-3個月",
    "deduction": "缺失扣1分"
  },
  {
    "item": 105,
    "no": "4.2",
    "category": "文件類",
    "text": "刷卡簽帳單存根聯-18個月",
    "deduction": "缺失扣1分"
  },
  {
    "item": 106,
    "no": "4.3",
    "category": "文件類",
    "text": "myfone報修單-6個月 (查TRUS紀錄與留存單據是否相符，Y2406起，維修取件改用無紙化)",
    "deduction": "缺失扣1分"
  },
  {
    "item": 107,
    "no": "4.4",
    "category": "文件類",
    "text": "維修替代機借用同意書、歸還確認單-6個月  (查SCMS紀錄與留存單據是否相符）",
    "deduction": "缺失扣1分"
  },
  {
    "item": 108,
    "no": "4.5",
    "category": "文件類",
    "text": "文件資料銷毀登記表-舊版6個月（綠本已銷毀，確認門市不應有綠本）",
    "deduction": "缺失扣1分"
  },
  {
    "item": 109,
    "no": "4.6",
    "category": "文件類",
    "text": "店務日誌-6個月(Y2609改實施無紙化)",
    "deduction": "缺失扣1分"
  },
  {
    "item": 110,
    "no": "4.7",
    "category": "文件類",
    "text": "物流已走無紙化，檢查當月任3天，TMS收件、寄件點收介面是否落實執行\n1. 確認物流貨件皆有送達，並於TMS點收介面完成系統簽收作業\n2. 確認門市待寄貨件皆已交寄司機，並於TMS點收介面完成系統寄出作業\n3.廢手機回收單 ，需保留物流簽收的門市存根聯，物流人員需簽名",
    "deduction": "缺失扣0.5分"
  },
  {
    "item": 111,
    "no": "5",
    "category": "門市環境類",
    "text": "門市安全檢查\n1.門市承租範圍內，嚴禁門市人員抽菸(包含電子菸)\n2.嚴禁任何有火源的私人活動(例如:卡式瓦斯爐煮食物、烤肉)",
    "deduction": "缺失扣3分"
  },
  {
    "item": 112,
    "no": "6",
    "category": "門市環境類",
    "text": "檢查前後場滅火器-營業廳2支乾粉 、後場1支CO2 \n檢查：瓶身性能檢查3年內有效/鋼瓶外觀完整無異常/檢查卡每半年定檢\n※CO2 磅數填寫正確(未更換新瓶，不可高於前次重量)/乾粉指針在綠色安全值內",
    "deduction": "缺失扣0.5分"
  },
  {
    "item": 113,
    "no": "7",
    "category": "門市環境類",
    "text": "是否有堆積過期販促物、人形立牌..等超過1個月（25日需完成前月過期店格清運）",
    "deduction": "缺失扣1分"
  },
  {
    "item": 114,
    "no": "8",
    "category": "門市環境類",
    "text": "1.逃生出口是否暢通\n2.樓梯間不可擺放物品",
    "deduction": ""
  },
  {
    "item": 115,
    "no": "9",
    "category": "門市環境類",
    "text": "1.營業廳冷氣溫度應設定標準26度 (若因來客人潮多，導致悶熱，則不可低於24度)；後場冷氣禁止低於26度\n2.冷氣濾網無厚灰塵(每周需清洗1次)",
    "deduction": ""
  },
  {
    "item": 116,
    "no": "10",
    "category": "門市店務類",
    "text": "盤點保全金(跑報表核對)、櫃台營收、零找金/檢視金庫開啟紀錄表",
    "deduction": "缺失扣1分"
  },
  {
    "item": 117,
    "no": "11",
    "category": "門市店務類",
    "text": "抽盤門市庫存(手機/配件/sim卡….等等)",
    "deduction": "缺失扣2分"
  },
  {
    "item": 118,
    "no": "12",
    "category": "門市店務類",
    "text": "檢查店務日誌系統是否依時程填寫，紀錄有無缺填\n1.每日→ 當月份行事曆、營業前/中/後、訪客登記表\n2.每月→ 重要店務用品清點表(1日)、安全衛生檢查表(10日)、偏差案例宣導(5日) 、門市資安&個資檢查表(10日)",
    "deduction": "缺失扣0.5分/每項(營業前中後合算1項)"
  },
  {
    "item": 119,
    "no": "13",
    "category": "門市店務類",
    "text": "1.監視器主機、遠端回放92天是否正常運行，以確保影像資料紀錄完整\n2.每個監控鏡頭確認有無影像、色差、夜視、清晰度、櫃台鏡頭有無收音\n3.請實際回放檢視廠商與訪客進入工作區域、後場，務必有「專人陪同」，廠商(限清潔+修繕)滿櫃未陪同，需回放檢查\n4. 店內監視器數量是否和主機、遠端螢幕上錄影畫面鏡頭數量一致，日期與時間須同步，並呈現店點名稱、鏡頭編號\n5.重要範圍皆涵蓋：大門口、營業廳、展示區、所有營業櫃枱、倉庫、店長桌、後台文件檔案櫃區域、放置待銷毀文件區、機房(含機櫃)、監視器主機、後門、金庫",
    "deduction": "缺失扣0.5分"
  },
  {
    "item": 120,
    "no": "14",
    "category": "門市店務類",
    "text": "1. 檢查電信服務資訊資料夾文件，且版本正確 (版本年月，請核對<TWM官網下方服務契約>各版本日期)\n2. TWM、TFN 無須陳列個資法桌牌，已顯示在看板(僅台北三創、高雄三多需桌牌陳列)",
    "deduction": "缺失扣0.5分"
  },
  {
    "item": 121,
    "no": "15",
    "category": "門市店務類",
    "text": "檢查中島防盜座功能是否正常運作，確保展示商品安全",
    "deduction": "缺失扣0.5分"
  },
  {
    "item": 122,
    "no": "16",
    "category": "資安",
    "text": "無紙化申辦已上傳系統之文件，須於『3日內就地銷毀』\n已上傳系統之文件 (例：證件、專案憑證、換卡換號證明書、代辦委託書、申辦門號證明書、確認身分切結書、舊機回收約定書……等等)，須由店長與值班主管經手銷毀，勿再回送查核科",
    "deduction": "缺失扣2分"
  },
  {
    "item": 123,
    "no": "17",
    "category": "資安",
    "text": "1. 檢查每台電腦下載區有無個資檔案（本機→D槽→My Documents→下載）\n2. 不可安裝使用非授權軟體 (搜尋關鍵字→*liu*.dll、Boshiahk*.*、Boshiahk*.exe)\n3. 檢查不當留存個資文件及公開帳密",
    "deduction": "缺失扣2分"
  },
  {
    "item": 124,
    "no": "18",
    "category": "資安",
    "text": "檢查店內替代機是否皆回復原廠設定且無客戶遺留資料(訊息、通訊錄、照片、影片等等…)",
    "deduction": ""
  },
  {
    "item": 125,
    "no": "19",
    "category": "資安",
    "text": "1. 門市同仁申辦門號確實查核客戶本人雙證正本(現場無客戶可用口頭詢問流程)。\n2. 門市同仁受理本人未到場申辦作業，有依代辦規範辦理(現場無客戶可用口頭詢問流程)。",
    "deduction": ""
  },
  {
    "item": 126,
    "no": "20",
    "category": "資安",
    "text": "檢查印表機與資產電視是否關閉wifi設定",
    "deduction": "缺失扣0.5分"
  },
  {
    "item": 127,
    "no": "",
    "category": "環境",
    "text": "門市環境整潔檢查 (騎樓、中島桌面及展機、配件區、營業櫃檯&電腦下方、IP Phone桌面、燈管/攝影鏡頭周邊、後場環境)",
    "deduction": ""
  },
  {
    "item": 128,
    "no": "",
    "category": "其他",
    "text": "同仁訪談與建議(各項作業系統、店務..等)",
    "deduction": ""
  },
  {
    "item": 129,
    "no": "",
    "category": "其他",
    "text": "其他發現",
    "deduction": ""
  }
].map(Object.freeze));
  const BY_ID=Object.freeze(Object.fromEntries(ITEMS.map(row=>[row.item,row])));
  const IDS=Object.freeze(ITEMS.map(row=>row.item));
  const isCurrentDate=date=>String(date||'')>=EFFECTIVE_DATE;
  const isCurrentItem=item=>Object.hasOwn(BY_ID,Number(item));
  const isValidItem=(item,date)=>isCurrentItem(item)?isCurrentDate(date):Number.isInteger(Number(item))&&Number(item)>=1&&Number(item)<=(String(date||'')>='2026-09-01'?9:18);
  const idsForRecord=row=>isCurrentItem(row.item)?IDS:Array.from({length:String(row.date||'')>='2026-09-01'?9:18},(_,i)=>i+1);
  const versionFor=row=>isCurrentItem(row.item)?'2026-11':'legacy';
  const labelFor=item=>BY_ID[item]?.no||(!isCurrentItem(item)?String(item):'');
  return {EFFECTIVE_DATE,ITEMS,BY_ID,IDS,isCurrentDate,isCurrentItem,isValidItem,idsForRecord,versionFor,labelFor};
});
