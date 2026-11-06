import { createRequire } from 'node:module';
import { CATALOG, ECONOMY, STORES } from './game-config.mjs';
import { SUPERVISOR_RULES } from './supervisor-rules.mjs';
import { GUEST_WELCOME_COINS } from './guest-policy.mjs';

const require = createRequire(import.meta.url);
const cityData = require('./city-data.js');
const sceneRules = require('./scene-rules.js');

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const compact = value => String(value).normalize('NFKC').toLowerCase()
  .replace(/[\s，。！？?、：:；;（）()【】\[\]「」『』“”‘’、/\\|_\-]/g, '');
const hasAny = (text, words) => words.some(word => text.includes(compact(word)));
const safeText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;

const storeRows = Object.freeze(STORES.map(base => {
  const row = cityData.stores.find(item => item.id === base.id) || {};
  return Object.freeze({
    ...base,
    ...row,
    center: sceneRules.storeCenters?.[base.id] || null,
    canonicalDoor: sceneRules.storeDoors?.[base.id] || null,
  });
}));
const storeById = new Map(storeRows.map(item => [item.id, item]));
const landmarkRows = Object.freeze(Array.isArray(cityData.landmarks) ? cityData.landmarks.slice() : []);

const storeAliases = Object.freeze({
  jiuquan: ['酒泉', '酒泉店', '酒泉門市'],
  wanda: ['萬大', '萬大店', '萬大門市'],
  dadaocheng: ['大稻埕', '大稻埕店', '大稻埕門市'],
  fuxingnan: ['復興南', '復南', '復興南店', '復興南門市'],
  sanchuang: ['三創', '三創生活', '三創店', 'syntrend'],
  hangzhounan: ['杭州南', '杭南', '杭州南店', '杭州南門市'],
  yongji: ['永吉', '永吉店', '永吉門市'],
  tonghua: ['通化', '通化店', '通化門市'],
  liuzhangli: ['六張犁', '六張犁店', '六張犁門市'],
});
const landmarkAliases = Object.freeze({
  taipei101: ['台北101', '台北一零一', '101大樓', '101'],
  'shilin-night-market': ['士林夜市', '士林市場'],
  'ningxia-night-market': ['寧夏夜市'],
});

const routeWords = ['位置', '在哪', '哪裡', '地址', '地點', '地圖', '怎麼走', '走路', '步行', '路線', '前往', '到哪', '距離', '跨店'];
const taskWords = ['任務', '每日', '今天任務', '回報', 'kpi', '台獎', '舊換新', '換機', '手機獎金', '獎金查詢', '查價'];
const catalogWords = ['購買', '買', '商店', '價格', '花費', '裝備', '物品', '家具', '傢俱', '布置', '佈置', '外觀', '造型', '車', '機車', '汽車', '盆栽', '沙發', '立燈', '接待桌', '商品架'];
const walletWords = ['我的錢包', '錢包', '餘額', '有多少', '剩多少', '買得起', '可負擔', '負擔得起', '我有幾枚'];
const permissionWords = ['權限', '誰可以', '能不能放', '可以放', '訪客', '同店', '參觀', '編輯'];
const supervisorRewardWords = ['主管聊天', '主管對話', '跟主管聊天', '和主管聊天', '靠近主管', '問主管', '主管獎勵', '主管金幣', '聊天獎勵'];
const suggestions = Object.freeze(['九家門市或台北地標位置', '遊戲任務、金幣與金牌兌換', '本人遊戲錢包可負擔的物品']);

const taskAliases = Object.freeze({
  report: ['回報', '每日回報'],
  kpi: ['kpi', '績效示範'],
  awards: ['台獎', '台獎中心'],
  tradein: ['舊換新', '換機'],
  price: ['手機獎金', '獎金查詢', '查價'],
});

const itemAliases = Object.freeze({
  'outfit-rose': ['莓果制服', '莓果', '玫瑰制服'],
  'outfit-ocean': ['海藍制服', '海藍'],
  'outfit-gold': ['星光禮服', '星光'],
  'hair-braids': ['雙辮', '辮子'],
  'hair-pony': ['馬尾', '緞帶長馬尾'],
  'hair-silver': ['銀灰短髮', '銀灰'],
  'desk-oak': ['木質接待桌', '接待桌', '木桌'],
  'shelf-orange': ['橘光商品架', '商品架', '貨架'],
  'sofa-mint': ['薄荷雙人沙發', '薄荷沙發', '沙發'],
  'plant-palm': ['招財小盆栽', '小盆栽', '盆栽'],
  'lamp-gold': ['暖光立燈', '立燈', '燈'],
  'display-phone': ['手機展示座', '展示座'],
  'home-studio': ['河畔小屋', '小屋'],
  'home-loft': ['都會閣樓', '閣樓'],
  'scooter-mint': ['薄荷小機車', '薄荷機車', '機車'],
  'car-mint': ['薄荷小車', '薄荷汽車', '小車'],
  'car-sun': ['陽光旅行車', '旅行車'],
  'car-violet': ['紫色跑車', '跑車'],
  'unlock-express': ['城市接駁通行證', '接駁通行證', '快速通行證'],
});

const categoryLabels = Object.freeze({
  car: '交通工具', outfit: '服裝外觀', hair: '髮型外觀', home: '房屋',
  furniture: '家具', supplies: '布置用品', unlock: '功能解鎖',
});

function sourceRecord(id, title, excerpt, url) {
  const source = { id, title, excerpt };
  if (typeof url === 'string' && url.startsWith('https://')) source.url = url;
  return source;
}

function addSource(sources, source) {
  if (source && !sources.some(item => item.id === source.id)) sources.push(source);
}

function storeSource(store) {
  return sourceRecord(
    `city-data.store.${store.id}`,
    `${store.name || store.short} 門市資料`,
    `${store.district}；地址 ${store.address}；遊戲內請由城市導覽選擇「${store.short || store.name}」前往；相對方向依現行場景路線規則。`,
    store.mapUrl,
  );
}

function landmarkSource(landmark) {
  const area = landmark.coordinateStatus === 'area-landmark-no-single-point' ? '區域地標，沒有單一門牌點' : '地址地標，遊戲位置是視覺提示';
  return sourceRecord(
    `city-data.landmark.${landmark.id}`,
    `${landmark.name} 地標資料`,
    `${landmark.district}；${landmark.address}；${area}。遊戲內請由城市導覽查看地標提示，不提供實作座標或真實步行分鐘。`,
    landmark.source,
  );
}

function routeSource() {
  return sourceRecord('scene-rules.store-route', 'CozySceneRules 遊戲街區路線', '門市中心與道路使用壓縮遊戲座標；可在小城步行，來源不提供台北真實步行分鐘或導航比例。');
}

function economySource() {
  const taskText = ECONOMY.tasks.map(task => `${task.name} ${task.coins} 金幣`).join('、');
  return sourceRecord('game-config.economy', '隔離遊戲經濟規則', `遊戲任務金幣：${taskText}；1 枚遊戲金牌可換 ${ECONOMY.goldCoinValue} 金幣；只適用隔離試玩錢包。`);
}

function supervisorRewardSource() {
  const seconds = SUPERVISOR_RULES.minimumTalkMs / 1000;
  return sourceRecord(
    'supervisor-rules.daily-reward',
    '隔離遊戲主管聊天獎勵規則',
    `隔離遊戲中，每天最多領 ${SUPERVISOR_RULES.coins} 枚遊戲金幣一次；需先靠近${SUPERVISOR_RULES.name}並提問，閱讀對話至少 ${seconds} 秒後才能領取。這是遊戲資產，不代表正式獎金。`,
  );
}

function catalogSource(items = CATALOG) {
  const names = items.slice(0, 12).map(item => `${item.name}（${item.coins} 金幣${item.gold ? `、${item.gold} 金牌` : ''}）`).join('、');
  const suffix = items.length > 12 ? '等' : '';
  return sourceRecord('game-config.catalog', '隔離遊戲商品目錄', `${names}${suffix}；價格與類別取自遊戲商品目錄，不代表正式商品或正式權限。`);
}

function guestSource() {
  return sourceRecord('game-store.guest-policy', '隔離訪客遊戲權限', `訪客角色保存自己的錢包與物品，建立時一次 ${GUEST_WELCOME_COINS} 遊戲金幣；可逛九店、買物品與找主管聊天；九店布置只能參觀，業務大樓及業務任務不開放；1 枚遊戲金牌仍按 ${ECONOMY.goldCoinValue} 金幣兌換。`);
}

function permissionSource(guest = false) {
  if (guest) return guestSource();
  return sourceRecord('game-store.space-permission', 'game-store 共同布置規則', '本人登入角色可用自己的遊戲錢包購買並裝備；同店帳號可編輯該店共同布置，跨店來訪者只能參觀。這不代表正式系統權限。');
}

function walletSource(wallet) {
  return sourceRecord('context.wallet', '本人遊戲錢包', `目前本人遊戲錢包：${wallet.coins} 金幣、${wallet.gold} 遊戲金牌。`);
}

function validWallet(value) {
  return isRecord(value)
    && Number.isSafeInteger(value.coins) && value.coins >= 0
    && Number.isSafeInteger(value.gold) && value.gold >= 0
    ? { coins: value.coins, gold: value.gold }
    : null;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function findEntities(text) {
  const found = [];
  for (const [id, aliases] of Object.entries(storeAliases)) {
    if (aliases.some(alias => text.includes(compact(alias)))) found.push({ type: 'store', id, row: storeById.get(id) });
  }
  for (const [id, aliases] of Object.entries(landmarkAliases)) {
    if (aliases.some(alias => text.includes(compact(alias)))) found.push({ type: 'landmark', id, row: landmarkRows.find(item => item.id === id) });
  }
  return found.filter(item => item.row);
}

function findTaskIds(text) {
  return Object.entries(taskAliases).filter(([, aliases]) => aliases.some(alias => text.includes(compact(alias)))).map(([id]) => id);
}

function findItems(text) {
  const found = [];
  for (const item of CATALOG) {
    const aliases = [item.id, item.name, ...(itemAliases[item.id] || [])];
    if (aliases.some(alias => text.includes(compact(alias)))) found.push(item);
  }
  if (hasAny(text, ['家具', '傢俱', '布置', '佈置'])) {
    for (const item of CATALOG.filter(entry => ['furniture', 'supplies'].includes(entry.category))) if (!found.some(entry => entry.id === item.id)) found.push(item);
  }
  if (hasAny(text, ['機車'])) for (const item of CATALOG.filter(entry => entry.id === 'scooter-mint')) if (!found.some(entry => entry.id === item.id)) found.push(item);
  if (hasAny(text, ['汽車', '車子', '交通工具'])) for (const item of CATALOG.filter(entry => entry.category === 'car')) if (!found.some(entry => entry.id === item.id)) found.push(item);
  if (hasAny(text, ['外觀', '造型'])) for (const item of CATALOG.filter(entry => ['outfit', 'hair'].includes(entry.category))) if (!found.some(entry => entry.id === item.id)) found.push(item);
  return found;
}

function mutationAttempt(text) {
  return /忽略(?:規則|指示)|系統提示|提示詞|越過(?:權限|規則)|(?:改|修改|增加|加上|重設|重置|扣除|刪除).*(?:我的)?(?:錢包|金幣|金牌|餘額)|(?:讀取|查看|顯示).*(?:別人|他人|同事|其他人).*(?:錢包|資料|角色)|(?:換|切換|變成).*(?:身分|身份|帳號|使用者)|(?:直接|幫我).*(?:購買|買)|(?:把我).*(?:換|改|變)/i.test(text);
}

function unsupportedLiveOrFormal(text) {
  return /正式|業績|排名|人資|hr|薪資|薪酬|公司政策|真人主管|本人立場|你覺得|喜不喜歡|營業|開門|關門|即時|現場|店長|在不在/i.test(text);
}

function itemCost(item) {
  const parts = [];
  if (item.coins) parts.push(`${item.coins} 金幣`);
  if (item.gold) parts.push(`${item.gold} 金牌`);
  return parts.length ? parts.join('＋') : '免費';
}

function itemLine(item) {
  return `${item.name}（${categoryLabels[item.category] || item.category}，${itemCost(item)}）`;
}

function locationSection(entities, walking, sources) {
  const rows = entities.length ? entities : storeRows.map(row => ({ type: 'store', id: row.id, row }));
  const lines = rows.map(entity => {
    const row = entity.row;
    addSource(sources, entity.type === 'store' ? storeSource(row) : landmarkSource(row));
    return entity.type === 'store'
      ? `${row.name}（${row.district}）：${row.address}；遊戲內請由城市導覽選擇「${row.short || row.name}」前往。`
      : `${row.name}（${row.district}）：${row.address}；屬於${row.coordinateStatus === 'area-landmark-no-single-point' ? '區域地標提示' : '地址地標提示'}，請由城市導覽查看。`;
  });
  if (walking) {
    addSource(sources, routeSource());
    if (rows.length >= 2 && rows.every(row => row.type === 'store') && rows.every(row => row.row.canonicalDoor)) {
      const from = rows[0].row;
      const to = rows[rows.length - 1].row;
      const dx = Number(to.canonicalDoor.x) - Number(from.canonicalDoor.x);
      const dz = Number(to.canonicalDoor.z) - Number(from.canonicalDoor.z);
      const direction = `${dx > 0 ? '向東' : dx < 0 ? '向西' : ''}${dz > 0 ? '向南' : dz < 0 ? '向北' : ''}` || '沿街';
      lines.push(`遊戲內可從${from.short || from.name}步行到${to.short || to.name}，大致是${direction}；目前來源只保證壓縮遊戲相對位置，不提供真實台北步行分鐘。`);
    } else {
      lines.push('這些地點可在原創遊戲街區步行前往；目前來源不提供真實台北步行分鐘或導航路線。');
    }
  }
  return lines.join('\n');
}

function taskSection(text, taskIds, date, sources, guest = false) {
  if (guest) { addSource(sources, guestSource()); return '訪客可逛九店、購買遊戲物品、與街區同伴互動及找主管完成來源問答；內部業務大樓與業務任務不開放。每日聊天遊戲金幣另依主管交流規則，一天一次。'; }
  addSource(sources, economySource());
  const ids = taskIds.length ? taskIds : ECONOMY.tasks.map(task => task.id);
  const rows = ECONOMY.tasks.filter(task => ids.includes(task.id));
  const label = date ? `${date} 的隔離遊戲任務規則` : '隔離遊戲任務規則（日期未同步，我不猜今天日期）';
  const lines = [`${label}：${rows.map(task => `${task.name}完成後可得 ${task.coins} 遊戲金幣`).join('；')}。`];
  if (hasAny(text, ['上限', '每天最多', '每日最多'])) lines.push(`每日遊戲金幣上限為 ${ECONOMY.dailyCoinCap}；這是遊戲資產，不是正式績效或薪資。`);
  return lines.join('\n');
}

function supervisorRewardSection(sources) {
  addSource(sources, supervisorRewardSource());
  const seconds = SUPERVISOR_RULES.minimumTalkMs / 1000;
  return `隔離遊戲的主管聊天每天可領 ${SUPERVISOR_RULES.coins} 枚遊戲金幣，一天一次。流程是先靠近${SUPERVISOR_RULES.name}並提問，閱讀對話至少 ${seconds} 秒後才能領取；這是隔離遊戲資產，不代表正式獎金或績效。`;
}

function currencySection(text, sources, guest = false) {
  addSource(sources, guest ? guestSource() : economySource());
  if (hasAny(text, ['金牌', '兌換', '換金'])) return `隔離遊戲規則是 1 枚遊戲金牌兌換 ${ECONOMY.goldCoinValue} 金幣；確認前先看預覽，不能推論正式台獎或現金。`;
  return '這裡只提供隔離遊戲金幣規則；正式績效、台獎或其他正式資料不在小城來源內。';
}

function catalogSection(items, permission, sources, guest = false) {
  if (permission) addSource(sources, permissionSource(guest));
  const permissionText = guest ? '訪客可使用自己的遊戲錢包購買與裝備，九店共同布置只能參觀；這不提供任何內部業務權限。' : '購買與裝備需要本人登入的遊戲角色與自己的遊戲錢包；同店帳號可編輯共同布置，跨店來訪者只能參觀。這不代表正式系統權限。';
  if (!items.length) {
    addSource(sources, catalogSource());
    return permission
      ? permissionText
      : '商品目錄可以查遊戲物品與價格；請指出物品、家具、外觀或交通工具名稱。';
  }
  addSource(sources, catalogSource(items));
  const shown = items.slice(0, 8).map(itemLine).join('、');
  const more = items.length > 8 ? `；另有 ${items.length - 8} 件同類商品` : '';
  const prefix = permission ? '購買與裝備需要本人登入的遊戲角色及自己的遊戲錢包；' : '';
  return `${prefix}${shown}${more}。${guest ? permissionText : '家具布置仍依同店可編輯、跨店只能參觀的遊戲規則；不代表正式權限。'}`;
}

function walletSection(wallet, items, wantsAffordable, sources) {
  if (!wallet) return '沒有提供可核對的本人遊戲錢包，所以我不知道你的金幣／金牌餘額，也不猜可負擔物品。';
  addSource(sources, walletSource(wallet));
  if (!wantsAffordable) return `目前本人遊戲錢包有 ${wallet.coins} 金幣、${wallet.gold} 遊戲金牌。`;
  const affordable = (items.length ? items : CATALOG).filter(item => wallet.coins >= item.coins && wallet.gold >= item.gold);
  addSource(sources, catalogSource(items.length ? items : affordable));
  if (!affordable.length) return `目前本人遊戲錢包有 ${wallet.coins} 金幣、${wallet.gold} 遊戲金牌；指定商品中沒有同時符合成本的項目。是否已經擁有，請查看生活手帳背包；實際狀態以伺服器資料為準。`;
  return `目前本人遊戲錢包有 ${wallet.coins} 金幣、${wallet.gold} 遊戲金牌；依商品成本可負擔：${affordable.slice(0, 8).map(itemLine).join('、')}${affordable.length > 8 ? '等' : ''}。是否已經擁有，請查看生活手帳背包；實際狀態以伺服器資料為準。`;
}

function boundarySection() {
  return '正式業績、人資資料、即時營業狀態與真人主管立場不在已核對的小城來源內，我不知道，也不會猜測。';
}

function invalidResult() {
  return { answer: '問題內容無法辨識；請用繁中文本詢問九店／地標位置、遊戲任務、金幣金牌或隔離商品。', supported: false, sources: [], suggestions: [...suggestions] };
}

export function answerSupervisorQuestion(question, context = {}) {
  if (!safeText(question) || !isRecord(context)) return invalidResult();
  const text = compact(question);
  if (!text) return invalidResult();
  if (mutationAttempt(text)) return { answer: '我只能讀取已核對的小城來源，不能替你改錢包、換身分、讀取其他人的資料或直接購買。', supported: false, sources: [], suggestions: [...suggestions] };

  const entities = findEntities(text);
  const taskIds = findTaskIds(text);
  const items = findItems(text);
  const date = validDate(context.date);
  const wallet = validWallet(context.wallet);
  const guest = context.profile?.account_kind === 'guest';
  const sources = [];
  const sections = [];
  const locationWanted = entities.length > 0 || (hasAny(text, ['九店', '九家門市', '所有門市', '各門市']) && hasAny(text, routeWords));
  const walking = hasAny(text, ['怎麼走', '走路', '步行', '路線', '前往', '到哪', '距離', '跨店']);
  const catalogWanted = items.length > 0 || hasAny(text, catalogWords);
  const walletWanted = hasAny(text, walletWords);
  const boundary = unsupportedLiveOrFormal(text);
  const explicitGameContext = hasAny(text, ['遊戲', '隔離', '試玩', '小城']);
  const supervisorRewardIntent = hasAny(text, supervisorRewardWords)
    || (hasAny(text, ['主管']) && hasAny(text, ['金幣', '獎勵', '每天', '每日', '提問', '聊天', '對話']));
  const unsafeFormalSupervisorOnly = supervisorRewardIntent && boundary && !explicitGameContext;
  const unsafeFormalTaskOnly = boundary && !explicitGameContext && !entities.length && !catalogWanted && !walletWanted && taskIds.length > 0;
  const safeTaskIds = unsafeFormalTaskOnly ? [] : taskIds;
  const taskWanted = safeTaskIds.length > 0 || (!unsafeFormalTaskOnly && hasAny(text, ['任務', '每日', '今天怎麼玩', '完成回報']));
  const currencyWanted = !unsafeFormalSupervisorOnly && (hasAny(text, ['金牌', '兌換', '換金', 'coin', 'gold'])
    || (hasAny(text, ['金幣']) && !walletWanted && !catalogWanted && !taskWanted))
    && !hasAny(text, ['台獎', '手機獎金']);
  const permissionWanted = hasAny(text, permissionWords) || hasAny(text, ['家具', '傢俱', '布置', '佈置']);

  if (locationWanted) sections.push(locationSection(entities, walking, sources));
  if (taskWanted) sections.push(taskSection(text, safeTaskIds, date, sources, guest));
  if (supervisorRewardIntent && !unsafeFormalSupervisorOnly) sections.push(supervisorRewardSection(sources));
  if (currencyWanted) sections.push(currencySection(text, sources, guest));
  if (catalogWanted || permissionWanted) sections.push(catalogSection(items, permissionWanted, sources, guest));
  if (walletWanted) sections.push(walletSection(wallet, items, hasAny(text, ['買得起', '可負擔', '負擔得起']), sources));

  if (boundary) sections.push(boundarySection());
  if (!sections.length) return { answer: '這個問題沒有足夠的已核對小城來源，我不知道；可以改問九店／地標位置、遊戲任務與金幣、商品成本或本人遊戲錢包。', supported: false, sources: [], suggestions: [...suggestions] };

  const answer = sections.join('\n\n');
  const result = { answer, supported: sections.some(section => section !== boundarySection()), sources };
  if (boundary && !result.supported) result.suggestions = [...suggestions];
  return result;
}

export const supervisorKnowledgeSources = Object.freeze({
  stores: storeRows,
  landmarks: landmarkRows,
  economy: ECONOMY,
  catalog: CATALOG,
  supervisorRules: SUPERVISOR_RULES,
});
