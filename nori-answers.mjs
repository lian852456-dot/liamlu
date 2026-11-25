import './kpi-battle-controller.js?v=20261118-kpi-layout-1';
import './readonly-dashboard-core.js?v=20261113-conversion-1';
import './award-model-catalog.js?v=20261105-awards-gap-id-1';
import './awards-battle-controller.js?v=20261118-person-ranking-2';
import {categories} from './op-series-core.mjs';
import {tasks} from './focus-tasks-core.mjs';

const battle=globalThis.KpiBattleController, conversion=globalThis.ReadonlyDashboardCore;
const normalize=s=>String(s ?? '').normalize('NFKC').toLowerCase().replace(/[\s，、。？！?!：「」／/]/g,'');
const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
const known=n=>typeof n==='number' && Number.isFinite(n);
const integer=n=>Number.isSafeInteger(n) && n>=0;
const pct=n=>known(n)?fmt(n*100)+'%':'未列';
const aliases={復興:'復興南',杭州:'杭州南',大稻:'大稻埕',六張:'六張犁'};
const metrics=[
  ['a1399','A1399','AQ V+D 1399 (含)以上'],['a999','A999','AQ V+D 999 (含)以上'],
  ['r1399','R1399','RT V+D 1399 (含)以上'],['r999','R999','RT V+D 999 (含)以上'],
  ['好速','好速','好速案銷售點數'],['高高特維','','高高特維用戶續約數'],['特維','特維','特殊維繫用戶續約數'],
  ['配件','配件','配件及其他營收'],['包膜','包膜','包膜與保貼營收'],
  ['aq','','TTL AQ上線點數'],['rt','RT','RT上線點數'],
  ['5g','','5G銷售數'],['預付卡','','預付卡開卡面額'],['自退','','自退數'],
  ['npout','','解約後NP OUT'],['重點device','','重點Device銷售量'],['device專案','','Device專案銷售數'],
  ['換約淨新增','','換約淨新增金額'],['空機3c','','空機、3C、物聯網及門市購營收'],
  ['保險點數','','手機保險服務點數'],['netflix','','Netflix多享組銷售數'],
  ['hbo','','HBO Max&Disney+&Prime Video銷售數'],['disney+','','HBO Max&Disney+&Prime Video銷售數'],
  ['primevideo','','HBO Max&Disney+&Prime Video銷售數'],['myvideo','','MyVideo&KKBOX'],['kkbox','','MyVideo&KKBOX'],
  ['apple&google','','Apple&Google服務及雜誌週刊開通數']
];
const unsupportedPeriod=/昨天|昨日|前天|上月|上個月|上週|上周|本週|這週|上季|去年|同期|單日|當天|當日|今日新增|今天新增|今天做|今日做|今天賣|今天成交|今天上線|(?:\d+|[一二三四五六七八九十]+)月|\d[/-]\d|\d日/;
const filler=/請幫我查|幫我查|請問|查一下|查詢|我想知道|想知道|本月份?|這個月|截至今天|截至今日|今天|今日|現在|目前|最新|到目前為止|月累計|累計|總進度|總達成|達成率?|實際|推估|獎金|排名|名次|排第|第幾|第|差多少|金額|多少錢|進度|筆數|台數|件數|數量|幾件|幾台|幾筆|多少|幾分|幾名|目標|已完成|完成|還差|尚差|差幾|幾|實績|上線|銷量|賣了|做了|點數|月|個人|同仁|門市|店點|台北|搭售率|搭售|保險|個保|kpi|業績|個績|台獎|臺獎|締結率?|來客數?|aq|rt|op系列|op|動店任務|動店|重點任務|重點機型|任務|未動店|有沒有|為多少|有多少|各項|各|全部|系列|合計|總共|總計|全區|整區|九店|北一二b|的|是|有|嗎|呢/g;
const topicWords=['智慧家庭','科技生活','遊戲玩家','玩家','影音','iphone','mac','充電多','ai眼鏡套裝','ai眼鏡','vivox500','x500'];
const subjectPrompt='想查哪位同仁或哪家門市？也可以指定「全區」。';
function subject(raw,keys) {
  let q=normalize(raw);
  const storeKeys=[...conversion.STORES.map(s=>s.short),...Object.keys(aliases)];
  const matches=[...new Set(storeKeys.filter(n=>q.includes(n)).map(n=>aliases[n] || n))];
  if(matches.length>1)return {error:'一次可查一家門市，請指定要先看的門市。'};
  const store=matches[0],area=/全區|九店|北一二b|整區/.test(q);
  for(const key of storeKeys) q=q.replaceAll(key,'');
  for(const word of [...keys,...metrics.map(m=>m[0]),...topicWords].map(normalize).sort((a,b)=>b.length-a.length)) q=q.replaceAll(word,'');
  q=q.replace(filler,'').replace(/^店|店$/g,'');
  if(!q && (store || area))return {store,area:!store};
  if(!q || /^(?:我|我們|本|我們的|本區|我的)$/.test(q))return {error:subjectPrompt,follow:true};
  if(!/^(?:[\p{Script=Han}]{2,4}|[\p{Script=Han}][*○]+[\p{Script=Han}]?)$/u.test(q))return {error:subjectPrompt,follow:true};
  return {store,name:q};
}
function masked(name) {
  const n=normalize(name);
  return n.length>=2?n[0]+'＊'+(n.length>2?n.at(-1):''):'';
}
function select(rows,people,area,s) {
  if(s.name){
    const key=masked(s.name);
    const matches=people.filter(r=>masked(r.name)===key && (!s.store || r.store.includes(s.store)));
    if(matches.length!==1){
      const places=[...new Set(matches.map(r=>r.store))];
      return {error:matches.length?(places.length>1?'有同名遮罩，請加上門市再查。可選 '+places.join('、')+'。':'同店有相同姓名遮罩，無法確認個人成績。'):'這份報表查無'+(s.store || '')+'「'+key+'」。'};
    }
    const row=matches[0];return {row,label:row.store+'「'+key+'」',person:true};
  }
  const row=s.store?rows.find(r=>(r.store || r.name)?.includes(s.store)):area;
  return row?{row,label:s.store || '北一二B 全區'}:{error:'目前報表缺少這個範圍的資料。'};
}
function period(cutoff,today,start) {
  const day=x=>typeof x==='string' && /^20\d\d-\d\d-\d\d$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10)===x;
  if(!day(cutoff) || cutoff>today || (start && (!day(start) || start>cutoff)))return '';
  return '統計期間 '+(start || cutoff.slice(0,7)+'-01')+' 至 '+cutoff+'。'+(cutoff.slice(0,7)!==today.slice(0,7)?'這是前期報表。':'');
}
function kpiAnswer(q,bundle,s,today,formalKeys) {
  const raw=bundle.kpiResult.data;
  const view=battle.mergeKpiBattleSupplement(battle.kpicalcToKpiBattleView(raw),bundle.privateResult.snapshot?.kpiBattle);
  const dates=period(view.data_as_of_date,today);
  if(!dates || !view.source_file)return 'KPI 來源或統計截止日未確認，暫時無法報數。';
  const {row,label,person,error}=select(view.stores,view.personal,view.aggregate,s);
  if(error)return error;
  let description;
  if(/台獎|臺獎|獎金/.test(q)){
    const snapshot=bundle.privateResult.snapshot;
    const awards=snapshot?.awardsBattle;
    const validation=globalThis.AwardsBattleController.validateAwardsBattle(awards,view,snapshot?.kpiBattle,snapshot?._read_integrity);
    if(!validation.ok)return validation.reason+'。';
    const unit=person?null:(s.store?awards.stores.find(r=>r.store?.includes(s.store)):awards.overall);
    const rank=person?row.phone_award_rank:unit?.award?.rank;
    const actual=person?row.phone_award_actual:unit?.award?.actual_total;
    const projected=person?row.phone_award_projected:unit?.award?.projected;
    if(/排名|名次|第幾/.test(q))description='台獎排名'+(integer(rank) && rank>0?'第 '+rank+' 名':'未列');
    else description='台獎實際金額'+(known(actual)?' '+fmt(actual)+' 元':'未列')+'，推估金額'+(known(projected)?' '+fmt(projected)+' 元':'未列');
  } else if(/搭售率|個保|保險搭售/.test(q))description='保險搭售率 '+pct(row.insurance_attach_rate);
  else {
    const explicit=formalKeys.filter(key=>q.includes(normalize(key)));
    const keys=metrics.filter(([key,,long])=>q.includes(key) && (!explicit.length || explicit.includes(long)) && (key!=='特維' || !q.includes('高高特維')));
    for(const name of explicit)if(!keys.some(m=>m[2]===name))keys.push([name,'',name]);
    const seen=new Set();
    const personSource=person?raw.persons.find(p=>p.pname===row.name && raw.stores.some(store=>store.code===p.store && store.name===row.store)):null;
    if(keys.length){
      if(/排名|名次|第幾/.test(q))return '報表提供整體 KPI 排名。單一分項可查實績、月目標與進度達成率。';
      description=keys.filter(m=>!seen.has(m[2]) && seen.add(m[2])).map(([key,short,long])=>{
        const m=person && !short?battle.kpicalcMetric(personSource?.items?.[long],raw.meta):row.metrics?.[person?short:long];
        if(!m)return key.toUpperCase()+' 未列';
        const gap=known(m.target) && known(m.actual)?Math.max(0,m.target-m.actual):null;
        return long+'實績 '+(known(m.actual)?fmt(m.actual):'未列')+'，月目標 '+(known(m.target)?fmt(m.target):'未列')+'，進度達成率 '+pct(m.rate)+(/還差|尚差|差幾/.test(q) && gap!==null?'，距月目標 '+fmt(gap):'');
      }).join('；');
    } else if(/排名|名次|第幾/.test(q)){
      const rank=person?row.rank:row.company_rank;
      description='報表排名'+(integer(rank) && rank>0?'第 '+rank+' 名':'未列');
    } else description='個人 KPI 總進度達成率 '+pct(row.overall_rate);
    if(!keys.length && !person && !/排名|名次|第幾/.test(q))description='KPI 總進度達成率 '+pct(row.overall_kpi);
  }
  return label+'的'+description+'。'+dates;
}
function conversionAnswer(q,bundle,s,today) {
  if(s.name)return '正式締結率報表提供門市與全區資料。請輸入門市，或指定全區。';
  const c=battle.kpiBattleConversion(bundle.privateResult.snapshot,conversion);
  const dates=period(c.cutoff,today);
  if(!dates || !c.byStore)return c.message || '締結率報表截止日待核對。';
  const row=s.store?c.byStore.get(conversion.STORES.find(x=>x.short===s.store)?.id):c.district;
  if(!row)return '締結率報表缺少這個範圍的資料。';
  const parts=[];
  if(!q.includes('rt') || q.includes('aq'))parts.push('AQ 締結率 '+pct(row.aq_rate)+'（上線 '+row.aq_n+'／來客 '+row.aq_d+'）');
  if(!q.includes('aq') || q.includes('rt'))parts.push('RT 締結率 '+pct(row.rt_rate)+'（締結 '+row.rt_n+'／符合續約資格 '+row.rt_d+'）');
  return (s.store || '全區')+'的'+parts.join('、')+'。'+dates;
}
function localAnswer(topic,q,s,report,today) {
  const op=topic==='op',title=op?'OP 系列':'重點任務';
  if(!report)return '請先在'+title+'匯入並確認這期報表，再回來問海苔。';
  const dates=op?period(report.date,today):period(report.dates?.[1],today,report.dates?.[0]);
  if(!dates)return title+'的報表日期待核對。';
  const shops=report.stores,people=report.people.map((r,index)=>({...r,index,store:shops.find(shop=>shop.code===(op?r.store:r.code))?.name || ''}));
  const {row,label,person,error}=select(shops,people,report.area,s);
  if(error)return error;
  if(op){
    const names=['影音','玩家','智慧家庭','科技生活'];
    const category=names.findIndex(n=>q.includes(n));
    if(person){
      if(/還差|目標/.test(q))return label+'的個人 OP 目標未列於這份報表。'+dates;
      const sales=report.sales.filter(r=>r.person===row.index && (category<0 || category===r.category));
      if(!sales.every(r=>integer(r.qty)))return 'OP 個人成交明細待核對。';
      return label+'已歸戶的'+(categories[category] || 'OP')+'成交 '+sales.reduce((n,r)=>n+r.qty,0)+' 件。'+dates;
    }
    if(category>=0)return label+'的'+categories[category]+(integer(row.qty?.[category])?'累計 '+row.qty[category]+' 件':'件數未列')+'。'+dates;
    if(!integer(row.total) || !integer(row.target))return 'OP 實績或目標缺漏，目前無法計算差額。';
    return label+'的 OP 累計 '+row.total+' 件，月目標 '+row.target+' 件，尚差 '+Math.max(0,row.target-row.total)+' 件。'+dates;
  }
  const key=['iphone','mac','充電多','ai眼鏡','x500'].findIndex(n=>q.includes(n));
  const parts=tasks.flatMap((name,i)=>{
    if(key>=0 && i!==key)return [];
    const label=person && i===0?'i18 動店':name, n=row.actual?.[i], target=row.targets?.[i];
    return [label+' '+(integer(n)?n+' 件':'未列')+(integer(target)?'／目標 '+target+' 件':'')];
  });
  return label+'的動店進度為'+parts.join('、')+'。'+dates;
}
export function answerReport(topic,question,bundle,local,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date())){
  const q=normalize(question);
  if(unsupportedPeriod.test(String(question).normalize('NFKC').toLowerCase().replace(/\s/g,'')))return {message:'這裡可直接查最新累計。指定單日、其他期間或歷史比較，需看該期間的明細。'};
  const formalKeys=(bundle.kpiResult?.data?.items || []).map(item=>item.key).filter(key=>typeof key==='string' && key.length>1);
  const s=subject(question,formalKeys);
  if(s.error)return {message:s.error,follow:s.follow};
  const message=topic==='conversion'?conversionAnswer(q,bundle,s,today)
    :topic==='op' || topic==='focus'?localAnswer(topic,q,s,local,today)
    :kpiAnswer(q,bundle,s,today,formalKeys);
  return {message};
}
