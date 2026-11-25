import {createPublicReader, readPublicFrame} from './tradein-public-read.mjs?v=20261010-date-read-1';
import {applyTargets} from './tradein-target-policy.mjs?v=20261106-region-154';

const endpoint = 'https://script.google.com/macros/s/AKfycbwf_ms5rkOIg92FOZwZuHCft3JWpC7ENPUN6c6ebPb1Jd6eqKYfa_2tmrI8onDIl4Mi/exec';
const read = createPublicReader({
  endpoint,
  frame: (payload, signal) => readPublicFrame(endpoint, payload, signal),
  async post(url, payload, signal) {
    const response = await fetch(url, {
      method: 'POST', headers: {'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload), credentials: 'omit', cache: 'no-store', signal
    });
    if (!response.ok) throw Error('舊換新進度暫時無法連線');
    return response.json();
  }
});

const stores = ['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
const aliases = {復興:'復興南',杭州:'杭州南',大稻:'大稻埕',六張:'六張犁'};
const needSubject = '想查哪位同仁或哪家門市？請輸入姓名、門市，或「全區」。';
export function parseSubject(text) {
  let q = text.normalize('NFKC').toLowerCase().replace(/[\s，,、。？！?!：:「」]/g, '');
  if (/昨天|前天|今天|今日|昨日|上月|上個月|上週|這週|本週|上周|本周|去年|上季|季度|[一二三四五六七八九十\d]+月|\d[/-]\d|\d日|單日|每天|本日|今年/.test(q)) {
    return {message:'海苔目前可直接查本月累計。指定月份或單日請用舊換新進度頁的日期篩選。'};
  }
  const storeKey = [...stores, ...Object.keys(aliases)].find(name => q.includes(name));
  const store = aliases[storeKey] || storeKey;
  if (storeKey) q = q.replace(storeKey,'');
  const area = /北一二b|全區|九店|整區/.test(q);
  q = q.replace(/以舊換新|舊換新|回收|北一二b|全區|九店|整區|請問|請幫我查|幫我查|我想知道|我想查|想知道|查一下|查詢|請查|截至目前|到目前為止|目前|現在|本月份?|這個月|這月|當月|最新|累積|累計|已經|已完成|完成|已做|做了|一共有|總共|一共|總計|合計|總筆數|筆數|台數|件數|尚缺|還差|差(?=幾|多少)|還有|多少|幾[台臺筆件]|進度|月目標|目標|達成率|達成|實績|門市|個人|同仁|店點|[的了嗎呢？]|[台臺筆件]$/g,'');
  q = q.replace(/(?:的是|有|是|的)+$/, '');
  if (store && q === '店') q = '';
  if (['','我們店','我店','本店','我','我們','幾','有','有幾','是','有多少'].includes(q)) {
    if (store) return {store};
    if (area) return {area:true};
    return {prompt:needSubject};
  }
  // Accept one explicit name only. Match the same masked label the source page publishes.
  if (/^[\p{Script=Han}]{2,4}$/u.test(q) || /^[\p{Script=Han}]\*[\p{Script=Han}]$/u.test(q)) {
    return {store, masked:Array.from(q)[0]+'＊'+Array.from(q).at(-1)};
  }
  return {prompt:'請直接輸入要查的同仁姓名或門市，例如「三創」；全區合計可輸入「全區」。'};
}

export function formatAnswer(source, subject) {
  const snapshot = applyTargets(source);
  const end = '統計期間 '+source.source_period.start+' 至 '+source.source_cutoff_date+'。';
  let row, label;
  if (subject.masked) {
    const matches = snapshot.people.filter(person => person.masked_name === subject.masked && (!subject.store || subject.store === person.store));
    if (!matches.length) return {message:'本月報表查無'+(subject.store || '')+'「'+subject.masked+'」的對應人員。'+end, follow:true};
    if (matches.length > 1) {
      const unique = [...new Set(matches.map(p=>p.store))];
      const message = unique.length > 1 ? '請選擇門市再查。' : '同店亦有重名，無法由公開進度區分個人筆數。';
      return {message:'報表有 '+matches.length+' 筆「'+subject.masked+'」。'+message, choices:unique.length>1?unique.map(store=>({store,masked:subject.masked})):[]};
    }
    row=matches[0]; label=row.store+'「'+row.masked_name+'」';
  } else if (subject.store) {
    row=snapshot.stores.find(s=>s.store===subject.store); label=subject.store;
  } else {
    row=snapshot.summary; label='北一二B 全區';
  }
  if (!row || row.actual_units == null) return {message:label+'的舊換新實績尚未提供。'+end};
  let message = label+'本月舊換新累計 '+row.actual_units+' 台。';
  if (row.target_units != null && row.remaining_units != null) {
    const title = subject.store && !subject.masked && !snapshot.target_policy?.stores ? '店內同仁目標合計' : '月目標';
    const gapLabel = subject.store && !subject.masked && !snapshot.target_policy?.stores ? '個人缺口合計 ' : '尚差 ';
    message += title+' '+row.target_units+' 台，'+(row.remaining_units ? gapLabel+row.remaining_units+' 台。' : '已達標。');
  }
  return {message:message+end};
}

export async function answerTradein(question, signal) {
  const subject=parseSubject(question);
  if (subject.prompt) return {message:subject.prompt, follow:true};
  if (subject.message) return subject;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
  const month=today.slice(0,7);
  const result=await read({action:'tradein_performance_public_read',month},{signal});
  if (!result.snapshot) return {message:month+' 尚未發布舊換新報表，目前無法確認筆數。'};
  const source=window.TradeinPublicCore.validate(result.snapshot);
  if (source.month!==month || source.source_cutoff_date>today) throw Error('來源日期不符');
  return formatAnswer(source,subject);
}
