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
  function top(group) {
    return Array.from(group.ranks, ([name, n]) => ({name, n}))
      .sort((a,b) => b.n-a.n || a.name.localeCompare(b.name,'zh-Hant'))[0];
  }
  function band() { return {count:0, tariffs:new Map()}; }
  function addBand(group, fee, plan, product, n) {
    group.count += n;
    if (!group.tariffs.has(fee)) group.tariffs.set(fee,{count:0, plans:bucket(), products:bucket()});
    const tariff=group.tariffs.get(fee);
    tariff.count+=n; count(tariff.plans,plan,n); count(tariff.products,product,n);
  }
  function bestBand(group) {
    const best=Array.from(group.tariffs).sort((a,b)=>b[1].count-a[1].count || a[0]-b[0])[0];
    if (!best) return {count:group.count};
    const [fee, data]=best;
    return {count:group.count, fee, feeCount:data.count, plan:top(data.plans), product:top(data.products)};
  }
  // These are source-label matches for sales coaching, independent of monthly award eligibility.
  function focusItem(plan, product) {
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
    const end=Date.parse(report.cutoff)/86400000+25569, start=end-report.day+1;
    function record(u,n,fee,plan,product,category) {
      u.count+=n;
      count(u.plans,plan,n); count(u.products,product,n);
      if(!Number.isSafeInteger(fee) || fee<0){u.missingFee+=n;return;}
      if(fee>=999) addBand(fee>=1399?u.high:u.low,fee,plan,product,n);
      if((category+' '+plan).includes('好速')){
        u.broadband.count+=n;count(u.broadband,fee+' 元 · '+(plan || category),n);
      }
      const item=focusItem(category+' '+plan,product);
      if(item){u.focus.count+=n;count(u.focus,fee+' 元 · '+item,n);}
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
      const args=[n,get(4),label(get(5)),label(get(6)),label(get(7))];
      record(region,...args);if(store)record(store,...args);
    }
    function finish(u) {
      if(u.invalid || !Number.isSafeInteger(u.expected) || u.expected!==u.count)
        return {name:u.name,issue:'明細件數與量能表未能核對，暫停列示亮點。'};
      return {name:u.name,count:u.count,missingFee:u.missingFee,low:bestBand(u.low),high:bestBand(u.high),
        plan:top(u.plans),product:top(u.products),broadband:top(u.broadband),focus:top(u.focus)};
    }
    return {regions:Array.from(regions.values(),finish),stores:Object.fromEntries(Array.from(units,([id,u])=>[id,finish(u)]))};
  }
  const ranked=v=>v ? v.name+'（'+v.n+' 件）' : '無具名紀錄';
  function lines(unit,kind) {
    if(unit.issue) return [['資料核對',unit.issue]];
    if(!unit.count) return [['上線明細','本期 0 件。']];
    const prefix=kind==='AQ'?'A':'R';
    const describe=b=>b.count ? b.count+' 件，最多為 '+b.fee+' 元（'+b.feeCount+' 件）。專案 '+ranked(b.plan)+'；商品 '+ranked(b.product) : '0 件';
    const target=unit.high.count?unit.high:unit.low;
    let action='先確認用量、換機或家用寬頻需求，再比較適合的高資方案與合約總費用。';
    if(target.plan || target.product){
      const open=kind==='RT'?'續約時先核對原月租與使用量':'新辦或攜碼時先確認預算與使用需求';
      action=open+'。可用'+(target.product?'「'+target.product.name+'」確認商品需求':'「'+target.plan.name+'」作方案範例')+
        '，比較 '+target.fee+' 元與相鄰資費的月付、綁約期及總費用。';
    }
    if(unit.broadband && /寬頻/.test(unit.broadband.name))
      action+=' 遇到家用網路將到期的客戶，可另問地址與頻寬需求，試算好速合辦。';
    return [['上線概況',unit.count+' 件。專案首位 '+ranked(unit.plan)+'；具名商品首位 '+ranked(unit.product)],
      [prefix+'999（999–1,398 元）',describe(unit.low)],[prefix+'1399（1,399 元以上）',describe(unit.high)],
      ['好速上線',ranked(unit.broadband)],['動店相關',ranked(unit.focus)],
      ...(unit.missingFee?[['資費缺值',unit.missingFee+' 件未列入資費排名。']]:[]),['高資作法建議',action]];
  }
  return {read,lines};
});
