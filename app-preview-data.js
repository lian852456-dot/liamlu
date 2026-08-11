(function attachPreviewData(scope) {
  'use strict';

  const C = scope.LiamSupervisorContract;
  const source = (label, href) => ({ label, href });
  const state = (data, label, href, sourceUpdatedAt = '2026-08-10T08:40:00+08:00') => C.moduleState({
    status: 'ok', updatedAt: '2026-08-10T08:42:00+08:00', sourceUpdatedAt, stale: false,
    source: source(label, href), data
  });

  const previewKpiCatalog = [
    ['主力資費','A999'],['主力資費','A1399'],['主力資費','好速'],['主力資費','R999'],['主力資費','R1399'],['主力資費','RT'],
    ['續約與留存','續約率'],['續約與留存','續約升轉率'],['續約與留存','高資續約率'],['續約與留存','續約總量'],['續約與留存','合約留存率'],
    ['寬頻與加值','固網'],['寬頻與加值','好速成長'],['寬頻與加值','數位生活'],['寬頻與加值','加值服務'],['寬頻與加值','影音服務'],
    ['裝置與服務','手機銷售'],['裝置與服務','旗艦機'],['裝置與服務','5G'],['裝置與服務','保險'],['裝置與服務','配件'],
    ['營運品質','NPS'],['營運品質','預約到店'],['營運品質','門號淨成長'],['營運品質','客訴改善']
  ];
  const previewFullKpis = (kpi, storeIndex = 0) => previewKpiCatalog.map(([category,label], index) => ({
    key:`preview-${index+1}`, label, category,
    rate:Number(Math.max(.42,kpi + ((index%7)-3)*.035 - Math.max(0,storeIndex)*.002).toFixed(3)), order:index
  }));

  const stores = [
    ['永吉',1.286,12,.062,2,15.32], ['大稻埕',1.213,21,.039,1,13.48],
    ['通化',1.168,33,.016,2,11.86], ['台北三創',1.127,45,.009,0,10.24],
    ['酒泉',1.089,68,-.004,-1,8.36], ['萬大',1.041,92,-.011,-1,6.12],
    ['杭州南',.983,131,-.023,-2,3.28], ['復興南',.892,178,-.038,-1,1.02],
    ['六張犁',.694,245,-.069,-3,-3.12]
  ].map(([name,kpi,rank,kpiDod,rankChange,addon], index) => ({
    name, kpi, rank, kpiDod, rankChange, addon,
    core: {
      A999: index === 0 ? 1.07 : Math.max(.62, kpi - .08),
      A1399: index === 0 ? 1.21 : Math.max(.55, kpi - .03),
      '好速': index === 0 ? 1.33 : Math.max(.58, kpi + .04),
      R999: index === 0 ? 1.27 : Math.max(.6, kpi - .01),
      R1399: index === 0 ? 1.29 : Math.max(.57, kpi + .02),
      RT: index === 0 ? 1.15 : Math.max(.61, kpi - .06)
    },
    fullKpis:previewFullKpis(kpi,index)
  }));

  const makePerson = (name, failed = [], reason = '') => ({
    name, status: failed.length ? 'fail' : 'pass', failed,
    metrics: { A999: failed.includes('A999') ? 0 : 2, A1399: 1, '好速': failed.includes('好速') ? 0 : 1, R999: 1, R1399: 1 },
    reason, improvePlan: failed.length ? '鎖定兩位既有客戶，晚班前完成回訪。' : ''
  });
  const report = (segment, completed, missing, rows) => {
    const storesWithMetrics = rows.map((row,index) => ({ ...row, metrics:row.reported ? {
      A999:(index % 3) + 1, '好速':Number(((index % 4) * .5 + .5).toFixed(1)), R999:(index % 2) + 1, R1399:index % 3,
      '保險搭售率':Number((58+index*3.2).toFixed(1)), '設備案佔比':Number((52+index*2.7).toFixed(1))
    } : {} }));
    const summaryMetrics = segment===16
      ? { A999:{value:12,unit:'count'},'好速':{value:8.5,unit:'points'},R1399:{value:7,unit:'count'},R999:{value:11,unit:'count'},'保險搭售率':{value:67.4,unit:'percent'},'設備案佔比':{value:61.2,unit:'percent'} }
      : { A999:{value:19,unit:'count'},'好速':{value:13,unit:'points'},R1399:{value:11,unit:'count'},R999:{value:18,unit:'count'},'保險搭售率':{value:70.1,unit:'percent'},'設備案佔比':{value:64.8,unit:'percent'} };
    return { segment, completedStores: completed, totalStores: 9, missingStores: missing,
      updatedAt: segment === 16 ? '16:21' : '21:33', summaryAvailable:true, summaryMetrics, stores: storesWithMetrics };
  };
  const report1600 = report(16, 7, ['復興南','六張犁'], [
    { name:'永吉', reported:true, reportedAt:'16:03', people:[makePerson('陳＊安')] },
    { name:'大稻埕', reported:true, reportedAt:'16:05', people:[makePerson('林＊恩',['好速'],'今日客流偏低，已完成跨店請益。')] },
    { name:'通化', reported:true, reportedAt:'16:07', people:[makePerson('王＊庭')] },
    { name:'台北三創', reported:true, reportedAt:'16:10', people:[makePerson('吳＊哲')] },
    { name:'酒泉', reported:true, reportedAt:'16:12', people:[makePerson('張＊維')] },
    { name:'萬大', reported:true, reportedAt:'16:15', people:[makePerson('李＊真')] },
    { name:'杭州南', reported:true, reportedAt:'16:21', people:[makePerson('黃＊鈞')] },
    { name:'復興南', reported:false, reportedAt:'', people:[] },
    { name:'六張犁', reported:false, reportedAt:'', people:[] }
  ]);
  const report2100 = report(21, 5, ['酒泉','萬大','復興南','六張犁'], [
    { name:'永吉', reported:true, reportedAt:'21:05', people:[makePerson('陳＊安')] },
    { name:'大稻埕', reported:true, reportedAt:'21:11', people:[makePerson('林＊恩',['好速'],'續約客戶延後到店，已約明日上午。')] },
    { name:'通化', reported:true, reportedAt:'21:18', people:[makePerson('王＊庭',['A999'],'高資方案客戶猶豫，已安排店長陪談。')] },
    { name:'台北三創', reported:true, reportedAt:'21:26', people:[makePerson('吳＊哲')] },
    { name:'杭州南', reported:true, reportedAt:'21:33', people:[makePerson('黃＊鈞')] },
    { name:'酒泉', reported:false, reportedAt:'', people:[] },
    { name:'萬大', reported:false, reportedAt:'', people:[] },
    { name:'復興南', reported:false, reportedAt:'', people:[] },
    { name:'六張犁', reported:false, reportedAt:'', people:[] }
  ]);

  const scheduleRows = [
    { store:'永吉', working:3, off:1, staff:[{name:'陳＊安',role:'店長',status:'早班',working:true},{name:'林＊恩',role:'業代',status:'晚班',working:true},{name:'王＊庭',role:'副店',status:'休假',working:false}] },
    { store:'大稻埕', working:4, off:0, staff:[{name:'吳＊哲',role:'店長',status:'早班',working:true},{name:'李＊真',role:'業代',status:'晚班',working:true}] },
    { store:'通化', working:3, off:1, staff:[{name:'張＊維',role:'副店',status:'早班',working:true},{name:'黃＊鈞',role:'業代',status:'休假',working:false}] },
    { store:'台北三創', working:4, off:1, staff:[{name:'周＊宇',role:'店長',status:'早班',working:true},{name:'劉＊晴',role:'業代',status:'晚班',working:true},{name:'鄭＊翔',role:'業代',status:'休假',working:false}] },
    { store:'酒泉', working:3, off:1, staff:[{name:'許＊文',role:'店長',status:'早班',working:true},{name:'蔡＊軒',role:'業代',status:'休假',working:false}] },
    { store:'萬大', working:4, off:0, staff:[{name:'郭＊如',role:'店長',status:'早班',working:true},{name:'楊＊仁',role:'業代',status:'晚班',working:true}] },
    { store:'杭州南', working:3, off:1, staff:[{name:'何＊偉',role:'副店',status:'早班',working:true},{name:'宋＊潔',role:'業代',status:'休假',working:false}] },
    { store:'復興南', working:4, off:1, staff:[{name:'謝＊婷',role:'店長',status:'早班',working:true},{name:'高＊皓',role:'業代',status:'晚班',working:true},{name:'潘＊瑜',role:'業代',status:'休假',working:false}] },
    { store:'六張犁', working:3, off:1, staff:[{name:'游＊凱',role:'店長',status:'早班',working:true},{name:'簡＊慈',role:'業代',status:'休假',working:false}] }
  ];
  const patrolStores = ['永吉','大稻埕','通化','台北三創','酒泉','萬大','杭州南','復興南','六張犁'].map((name,index) => ({
    name, lastVisit:`2026-08-${String(9-index).padStart(2,'0')}`, daysSince:index+1,
    status:index < 4 ? 'complete' : index < 6 ? 'attention' : 'pending',
    missingItems:index < 4 ? 0 : index < 6 ? index-2 : 33,
    result:index < 4 ? '全項完成' : index < 6 ? `缺 ${index-2} 項` : '本月未巡',
    item18:{status:index < 5 ? 'done':'miss'},
    awareness:{count:index < 4 ? 15 : index < 6 ? 12-index : 0,total:15,all:index < 4}
  }));

  const failureData = (segmentData) => {
    const failingPeople = segmentData.stores.flatMap(store => store.people.filter(person => person.status === 'fail').map(person => ({ store:store.name, ...person })));
    const byMetric = {};
    failingPeople.forEach(person => person.failed.forEach(metric => { byMetric[metric] = (byMetric[metric] || 0) + 1; }));
    return { segment:segmentData.segment, failedStoreCount:new Set(failingPeople.map(item => item.store)).size, failedPeopleCount:failingPeople.length, missingStores:segmentData.missingStores, byMetric, people:failingPeople };
  };

  const previewAwardItems = (store,index) => [
    { name:`${store} 指定機款 A`, actual:index+2, target:index+4, rate:[.5,.6,.667,.714,.75,.778,.8,.818,.833][index], difference:index-2, thresholdTarget:index+2, reward50:1200+index*100, reward100:2400+index*200, status:index<3?'Y':'N' },
    { name:`${store} 指定機款 B`, actual:index+1, target:index+5, rate:[.2,.333,.429,.5,.556,.6,.636,.667,.692][index], difference:null, thresholdTarget:null, reward50:null, reward100:1800+index*100, status:'' },
    { name:`${store} 指定機款 C`, actual:null, target:null, rate:null, difference:null, thresholdTarget:null, reward50:null, reward100:null, status:'' }
  ];
  const personalMetricNames=['AQ','A999','A1399','RT','R999','R1399','好速','特維','配件','包膜'];
  const previewPeople=stores.slice(0,9).map((store,index)=>({
    name:`同仁＊${index+1}`,store:store.name,role:index%3===0?'店長':index%3===1?'副店長':'業務代表',category:index%3===0?'店長':index%3===1?'副店':'業代',roleGroup:index%3===0?'店長':index%3===1?'副店':'其他業代',
    totalRate:Number((1.12-index*.045).toFixed(3)),rank:12+index*7,dod:Number((.028-index*.009).toFixed(3)),rankChange:2-index,
    metrics:personalMetricNames.map((key,metricIndex)=>({key,rate:Number((1.18-index*.035-metricIndex*.018).toFixed(3)),actual:12-index,target:10,dailyTarget:1,dailyGap:index%2,dod:Number((.02-metricIndex*.004).toFixed(3))}))
  }));

  const contract = {
    version:C.VERSION, generatedAt:'2026-08-10T08:42:00+08:00', mode:'preview',
    todayOperations:state({ date:'2026-08-10', segments:[report1600,report2100] },'北一二B每日回報','index.html','2026-08-10T21:33:00+08:00'),
    kpiSummary:state({ kpi:1.131, companyRank:29, companyRankTotal:578, kpiDod:.028, rankChange:1, addonScore:12.98, reportDate:'2026-08-10', fullKpis:previewFullKpis(1.131) },'正式 KPI 私有戰情','index.html'),
    kpiStores:state(stores,'正式 KPI 私有戰情','index.html'),
    kpiFullMetrics:state({ region:previewFullKpis(1.131), stores:Object.fromEntries(stores.map(store=>[store.name,store.fullKpis])) },'正式 KPI kpicalc','kpi.html'),
    awardSummary:state({ totalAmount:null, regionTotalAvailable:false, winningStores:3, totalStores:9, reportDate:'2026-08-10' },'正式台獎私有戰情','index.html'),
    awardStores:state([
      {name:'永吉',amount:5000,eligible:true,items:previewAwardItems('永吉',0)},{name:'大稻埕',amount:3000,eligible:true,items:previewAwardItems('大稻埕',1)},{name:'通化',amount:2000,eligible:true,items:previewAwardItems('通化',2)},
      ...['台北三創','酒泉','萬大','杭州南','復興南','六張犁'].map((name,index) => ({name,amount:0,eligible:false,items:previewAwardItems(name,index+3)}))
    ],'正式台獎私有戰情','index.html'),
    awardTop2Models:state([{name:'A1399',amount100:6800,progress:.82,status:'接近領獎'},{name:'R1399',amount100:5200,progress:.76,status:'追蹤中'}],'正式台獎私有戰情','index.html'),
    personalPerformance:state({ summary:{total:previewPeople.length,achieved:previewPeople.filter(row=>row.totalRate>=1).length,underTarget:previewPeople.filter(row=>row.totalRate<1).length,aqAttentionCount:2,aqMissingCount:0,reportDate:'2026-08-10',sourceAsOfDate:'2026-08-09'},people:previewPeople },'正式 KPI 個績快照','index.html'),
    report1600:state(report1600,'北一二B每日回報','index.html','2026-08-10T16:21:00+08:00'),
    report2100:state(report2100,'北一二B每日回報','index.html','2026-08-10T21:33:00+08:00'),
    reportFailures:state({ 16:failureData(report1600),21:failureData(report2100) },'正式個人回報','index.html','2026-08-10T21:33:00+08:00'),
    scheduleToday:state({ date:'2026-08-10',stores:scheduleRows },'既有班表 sread','patrol.html','2026-08-10T08:10:00+08:00'),
    scheduleByDate:state({ selectedDate:'2026-08-10', availableMonth:'2026-08', stores:scheduleRows },'既有班表 sread','patrol.html','2026-08-10T08:10:00+08:00'),
    patrolToday:state({ date:'2026-08-10',route:['永吉','大稻埕','通化'],completed:1,total:3,nextStop:'大稻埕',nextEta:'14:20',travel:[{from:'永吉',to:'大稻埕',minutes:24},{from:'大稻埕',to:'通化',minutes:31}] },'巡店唯讀路線 Preview','patrol.html','2026-08-10T08:00:00+08:00'),
    patrolOverview:state({ visited:6,total:9,expected:9,remaining:3,completionRate:6/9,fullyDone:4,totalMissingItems:5,unvisited:['杭州南','復興南','六張犁'],attention:['酒泉','萬大'],attentionCount:2,item18Window:{months:['2026-07','2026-08'],label:'7–8月'},statisticsPeriod:'2026-08-01～2026-08-31（Preview）',periodVerified:true,stores:patrolStores,visitCounts:patrolStores.map((store,index)=>({name:store.name,count:index<6?index%3+1:0,basis:'unique-store-date',sameDayMultipleVisitsDistinguishable:false})),inventory:{items:[14,15,16,17],completedStores:4,total:9,stores:patrolStores.map((store,index)=>({name:store.name,complete:index<4,items:{14:index<7,15:index<6,16:index<5,17:index<4}}))},item18Progress:{window:{months:['2026-07','2026-08'],label:'7–8月'},previousWindow:{months:['2026-05','2026-06'],label:'5–6月'},completedStores:8,total:9,stores:patrolStores.map((store,index)=>({name:store.name,current:{done:index<8,date:index<8?'2026-08-0'+(index+1):''},previous:{done:index!==7,date:index!==7?'2026-06-18':''}}))},recent:[{store:'永吉',date:'2026-08-09',complete:true,missingItems:0},{store:'大稻埕',date:'2026-08-08',complete:true,missingItems:0},{store:'復興南',date:'2026-08-03',complete:false,missingItems:2}] },'既有巡店 ptread','patrol.html','2026-08-10T08:00:00+08:00'),
    patrolStores:state(patrolStores,'既有巡店 ptread','patrol.html','2026-08-10T08:00:00+08:00')
  };

  scope.LiamSupervisorPreviewData = C.validateContract(contract);
})(window);
