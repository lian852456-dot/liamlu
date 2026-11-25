(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CapacityMix = api;
})(globalThis, function () {
  'use strict';
  const label = value => typeof value === 'string' ? value.trim() : '';
  function bucket() { return {count:0, ranks:new Map()}; }
  function count(group, key, amount) {
    if (key) group.ranks.set(key, (group.ranks.get(key) || 0) + amount);
  }
  function ranked(group) {
    return Array.from(group.ranks, ([name,n])=>({name,n}))
      .sort((a,b)=>b.n-a.n || a.name.localeCompare(b.name,'zh-Hant'));
  }
  const top=group=>ranked(group)[0];
  function modelName(product) {
    if (/^(?:無|未提供|無搭配商品|無搭機|無搭配|空白|門號案|單門號|N\/?A|-+)$/i.test(product)) return '';
    // Collapse recognizable storage / colour suffixes, preserving distinct models and radio editions.
    return product.replace(/_\d+(?:G|T)B?(?:\/\d+(?:G|T)B?)?-\([^()]+\)(\((?:5G|4G|WiFi)\))$/i,
      (_,radio)=>radio==='(5G)'?'': ' '+radio);
  }
  function band() { return {count:0, tariffs:new Map()}; }
  function addBand(group, fee, plan, product, category, n) {
    group.count += n;
    if (!group.tariffs.has(fee)) group.tariffs.set(fee,{count:0,plans:bucket(),products:bucket(),productPlans:new Map()});
    const tariff=group.tariffs.get(fee);
    tariff.count+=n;count(tariff.plans,plan,n);count(tariff.products,product,n);
    if(product){
      if(!tariff.productPlans.has(product))tariff.productPlans.set(product,bucket());
      count(tariff.productPlans.get(product),category||plan,n);
    }
  }
  function bestBand(group) {
    const best=Array.from(group.tariffs).sort((a,b)=>b[1].count-a[1].count || a[0]-b[0])[0];
    if (!best) return {count:group.count,products:[]};
    const [fee,data]=best,allProducts=ranked(data.products),products=allProducts.slice(0,3);
    const otherDevices=allProducts.filter(p=>/AirPods|耳機|耳罩|耳塞|眼鏡|手錶|Watch|遊戲|PS5|Switch|電視|iPad|平板|MacBook/i.test(p.name)).slice(0,2);
    for(const item of products)item.project=top(data.productPlans.get(item.name));
    return {count:group.count,fee,feeCount:data.count,plan:top(data.plans),product:products[0],products,otherDevices};
  }
  function commonModel(low,high,loFee,hiFee) {
    const lo=low.tariffs.get(loFee),hi=high.tariffs.get(hiFee);
    if(!lo || !hi)return null;
    const item=ranked(hi.products).find(p=>lo.products.ranks.has(p.name));
    return item && {name:item.name,lo:lo.products.ranks.get(item.name),hi:item.n};
  }
  // These are source-label matches for sales coaching, independent of monthly award eligibility.
  function focusItem(plan, product) {
    const bundle=product.match(/【(OP[^】]+)】/i);
    if(bundle)return bundle[1];
    const accessory=product.match(/AirPods(?:\s+Pro)?\s*\d+(?:\s*主動式降噪款)?|Pixel Buds\s+Pro\s*\d*/i);
    if(accessory)return accessory[0];
    const hit=product.match(/AI\s*眼鏡|智慧眼鏡|Ray[- ]?Ban\s+Meta|MacBook(?:\s+(?:Air|Pro))?|vivo\s+V80(?:\s+Lite)?|Pixel\s*11(?:\s+Pro)?|X500/i);
    if(hit) return hit[0];
    return plan.match(/充電多|OP玩家|OP影音|OP電視|影音多/i)?.[0];
  }
  function read(book, X, report, stores, crossDistrict) {
    const kind=report.kind, sheet=book.Sheets['RS_Voice'+kind];
    if (!sheet) return {issue:'缺少 RS_Voice'+kind+' 逐筆分頁。'};
    // Real Excel sheets can have formatting extending to column XEW. Only read named fields.
    const data=sheet['!data'];
    if (!data) return {issue:'無法讀取量能明細列。'};
    const headers=data[0]?.map(c=>label(c?.v)) || [];
    const fields=['統計日期','業務分區','營業店點代碼','用戶人數','表定V_D_V','用戶群組','搭配之Phone_Mode','專案分類'];
    const cols=fields.map(name=>headers.indexOf(name));
    if (cols.includes(-1)) return {issue:'明細缺少「'+fields.filter((_,i)=>cols[i]<0).join('、')+'」。'};
    const summary=X.utils.sheet_to_json(book.Sheets[kind+'量能'],{header:1,raw:true});
    const expectedHeader=kind==='AQ'?'實際數(含通轉手)':'實際數(含換約&通轉手)';
    const col=(summary[2]||[]).findIndex(v=>String(v).replace(/\s/g,'')===expectedHeader);
    if(col<0) return {issue:'量能表缺少可與逐筆資料對帳的實際數欄。'};
    const regions=new Map(), units=new Map();
    function unit(name, expected) {
      return {name,expected,count:0,missingFee:0,low:band(),high:band(),plans:bucket(),products:bucket(),broadband:bucket(),focus:bucket()};
    }
    for(const r of summary){
      if(r[0]===r[1] && /^北一[一二][A-Z]$/.test(r[0]) && (crossDistrict || r[0]==='北一二B')){
        if(regions.has(r[0])) return {issue:'量能表的分區合計重複。'};
        regions.set(r[0],unit(r[0],r[col]));
      }
      const store=stores.find(s=>s.id===r[1] && r[0]==='北一二B');
      if(store) units.set(store.id,unit(store.short,r[col]));
    }
    const combined=unit('',Array.from(regions.values()).reduce((sum,r)=>sum+r.expected,0));
    const end=Date.parse(report.cutoff)/86400000+25569, start=end-report.day+1;
    function record(u,n,fee,plan,product,category) {
      u.count+=n;
      count(u.plans,plan,n); count(u.products,product,n);
      if(!Number.isSafeInteger(fee) || fee<0){u.missingFee+=n;return;}
      if(fee>=999) addBand(fee>=1399?u.high:u.low,fee,plan,product,category,n);
      if(fee>=999 && (category+' '+plan).includes('好速')){
        u.broadband.count+=n;count(u.broadband,fee+' 元 · '+(plan || category),n);
      }
      const item=focusItem(category+' '+plan,product);
      if(fee>=999 && item){u.focus.count+=n;count(u.focus,fee+' 元 · '+item,n);}
    }
    for(const row of data){
      if(!row) continue;
      const get=i=>row[cols[i]]?.v;
      const date=get(0);
      if(!Number.isInteger(date) || date<start || date>end) continue;
      const region=regions.get(get(1));
      if(!region) continue;
      const n=get(3), store=get(1)==='北一二B' && units.get(get(2));
      if(!Number.isSafeInteger(n)||n<0){region.invalid=true;if(store)store.invalid=true;continue;}
      if(!n) continue;
      const args=[n,get(4),label(get(5)),modelName(label(get(6))),label(get(7))];
      record(region,...args);record(combined,...args);if(store)record(store,...args);
    }
    function finish(u) {
      if(u.invalid || !Number.isSafeInteger(u.expected) || u.expected!==u.count)
        return {name:u.name,issue:'明細件數與量能表未能核對，暫停列示亮點。'};
      const low=bestBand(u.low), high=bestBand(u.high);
      return {name:u.name,count:u.count,missingFee:u.missingFee,low,high,common:commonModel(u.low,u.high,low.fee,high.fee),
        focusItems:ranked(u.focus).slice(0,3),
        plan:top(u.plans),product:top(u.products),broadband:top(u.broadband),focus:top(u.focus)};
    }
    const verified=Array.from(regions.values(),finish);
    const overall=verified.length && verified.every(r=>!r.issue)?finish(combined):{issue:'上線明細未完整對帳，暫停列示商品排名。'};
    return {overall,regions:verified,stores:Object.fromEntries(Array.from(units,([id,u])=>[id,finish(u)]))};
  }
  function groups(unit,kind) {
    if(unit.issue || !unit.count)return [{title:'上線資料',lines:[['本期狀態',unit.issue||'本期沒有上線紀錄。']]}];
    const result=[];
    const itemText=p=>p.name+'（'+p.n.toLocaleString('zh-TW')+' 件）';
    for(const [band,title] of [[unit.low,'999–1,398 元'],[unit.high,'1,399 元以上']]){
      if(!band.count)continue;
      const lines=[['主打資費',band.fee.toLocaleString('zh-TW')+' 元，上線 '+band.feeCount.toLocaleString('zh-TW')+' 件。']];
      if(band.products.length){
        lines.push(['帶量商品',band.products.map((p,i)=>(i+1)+'. '+p.name+'　'+p.n+' 件').join('　／　')]);
        const alternatives=band.otherDevices.filter(p=>!band.products.some(top=>top.name===p.name));
        if(alternatives.length)lines.push(['耳機、平板或娛樂商品',alternatives.map(itemText).join('／')]);
        const first=band.products[0];
        if(first.project)lines.push(['實際搭配',first.name+' 搭「'+first.project.name+'」，在此資費上線 '+first.project.n+' 件。']);
      }else lines.push(['帶量商品','此資費未記載搭配商品。']);
      result.push({title,lines});
    }
    const reminders=[];
    if(unit.common){
      const c=unit.common;
      reminders.push(['同款比兩檔',c.name+' 在 '+unit.low.fee+' 元有 '+c.lo+' 件，在 '+unit.high.fee+' 元有 '+c.hi+' 件。'+
        (kind==='RT'?'續約先問現行月租與用量，再':'遇到指定這款的客人，可')+'用同款、同容量並列兩檔的購機價與合約總支出。']);
    }else if(result.length){
      const band=unit.high.fee?unit.high:unit.low;
      reminders.push(['門市開口', (kind==='RT'?'先確認原月租、用量與換機意願':'先問想換的商品與月付預算')+
        '，再依需求試算 '+band.fee+' 元'+(band.product?'搭 '+band.product.name:'方案')+'。']);
    }
    if(unit.focusItems.length)reminders.push(['動店與搭配商品',unit.focusItems.map(p=>p.name+'（'+p.n+' 件）').join('／')]);
    if(unit.broadband){
      const fee=unit.broadband.name.split(' · ')[0], speed=unit.broadband.name.match(/(?:家用)?寬頻(?:上網)?\s*([\d.]+\s*(?:Mbps|Gbps|[MG]))/i);
      const plan=speed?fee+'＋家用寬頻 '+speed[1]:fee+' 好速專案';
      reminders.push(['好速切入',plan+'，單一專案上線 '+unit.broadband.n+' 件。可先問家中寬頻到期日。']);
    }
    if(!result.length)reminders.push(['本期資費','沒有可核對的 999 元以上上線組合。']);
    if(unit.missingFee)reminders.push(['資費缺值',unit.missingFee+' 件未納入資費排名。']);
    if(reminders.length)result.push({title:'門市銷售提醒',lines:reminders});
    return result;
  }
  return {read,groups};
});
