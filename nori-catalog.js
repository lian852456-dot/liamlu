(function (root) {
  'use strict';
  // An entry describes a page's own workflow. New homepage cards are also discoverable.
  const pages = [
    ['kpi.html','KPI試算|同仁試算|試算','輸入門市或個人的實績、目標，試算 KPI 達成率。'],
    ['kpitry.html','自訂KPI|模擬器|模擬','設定自己的目標與店點條件後，可比較不同業績組合的結果。'],
    ['gold-medal.html','金牌|扣牌|加牌','在金牌查詢選擇日期、門市或同仁。「每日增減與原因」顯示當天異動，「個人結算總牌數」顯示累計。'],
    ['index.html','每日回報|業績回報|值班回報|回報系統|保險請益|未過關|零報|接龍','進入每日回報，選擇門市、身分及 16:00 或 21:00 時段，填寫後按「送出回報」。'],
    ['daily-log-dashboard.html','日誌|表單完成|未填表|漏填','在日誌檢查選擇日誌報表並套用至本機預覽。「需追蹤」列出未完成項目，也可以複製群組提醒。'],
    ['audit-report.html','稽核|補件|稽核照片','在稽核回報專區提交照片，或開啟原案件查看待補件項目。'],
    ['twm-store-inspection','店務檢查|店務巡檢|半月檢查','進入門市店務檢查，依每日、半月或每月的檢查週期查看項目。'],
    ['access-management.html','權限|換機|裝置管理|停權|審核|設備綁定','督導可在人員與裝置管理查詢人員、審核裝置或處理換機。'],
    ['department-ops.html','部區管理|北一二部|四區|部區締結率|部區金牌|店務成績','用督導通行碼進入部區管理，選擇金牌統計、店務成績或部區締結率，再選區域和期間。'],
    ['readonly-dashboard.html','主管唯讀|唯讀看板','從主管唯讀看板驗證身分後，可查看授權範圍內的九店績效及締結率。'],
    ['patrol.html','情報站|巡店|班表|面談紀錄|面談|里程|到店檢查|排班','用督導身分進入 Liam 情報站，從選單開啟巡店看板、每月班表、到店檢查或面談紀錄。'],
    ['operations-brief.html','作戰|行銷重點|店長會議|會議簡報','在作戰專區匯入報表並核對來源，確認行銷重點後即可產出店長會議簡報。'],
    ['tradein-brief.html','舊換新簡報|回收簡報','通過督導驗證後，在舊換新簡報產出頁匯出一頁 PPTX 或 PDF。'],
    ['live-battle.html','行進間|即時戰報','從行進間戰報查看 A999、A1399、R999、R1399 及好速的回報進度。'],
    ['phone-stock-dashboard.html','近三日|手機庫存|庫存|銷庫','上傳手機銷售與庫存兩份報表，可比對近三日銷量與庫存。'],
    ['city-play.html','小城|森林步道|多人遊玩|遊戲街區','從北一二B小城進入街區或森林步道。'],
    ['threec-query.html','查價|報價|估價|回收價|折抵|手機專案|企業用戶|資費比較','查新機時選「手機專案／3C」，依機型、容量、資費與期數篩選；查舊機則選「舊換新」。'],
    ['quick-upload.html','快速上傳|上傳報表|上傳中心','在資料快速上傳選擇報表類型，再依該項目的欄位與日期核對預覽。']
  ];
  const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s｜|／/＆&、，。？?！!]/g,'');
  function find(question,cards) {
    const q=norm(question);
    const found=new Map();
    for (const card of cards) {
      const title=card.querySelector('h2,h3')?.textContent.trim();
      if (!title) continue;
      const entry=pages.find(([path])=>card.href.includes(path));
      const primary=[title,...(entry?.[1].split('|') || [])].map(norm);
      const secondary=card.dataset.search.split(/[\s／、｜＆&]+/).map(norm);
      const scoreWords=(words,weight)=>words.filter(word=>word.length>=2 && q.includes(word)).map(word=>word.length+weight);
      const scores=[...scoreWords(primary,8),...scoreWords(secondary,0)];
      if (!scores.length) continue;
      const score=Math.max(...scores);
      const best=found.get(card.href);
      if (!best || best.score<score) found.set(card.href,{title,href:card.href,score,help:entry?.[2] || card.querySelector('p')?.textContent || title});
    }
    return [...found.values()].sort((a,b)=>b.score-a.score);
  }
  root.NoriCatalog=Object.freeze({find});
})(globalThis);
