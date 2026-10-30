/*
 * V4.3 Taipei city data.
 *
 * This is a small, replaceable data layer for the original Cozy3D map.  It is
 * deliberately not a Google Maps tile/embed/API client.  Store coordinates
 * come from the published Taipei address dataset; the gamePosition values are
 * a compressed east/south game coordinate used by world.js and city-ui.js.
 */
(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  if (root) {
    root.North12BCityData = value;
    root.CityData = value;
  }
}(typeof globalThis === 'object' ? globalThis : this, function () {
  const STORE_SOURCE = 'https://www.taiwanmobile.com.tw/cs/public/store/search.htm';
  const ADDRESS_SOURCE = 'https://data.taipei/dataset/detail?id=b7c8e724-1e98-45ee-a0bd-f3840623ed97';
  const DATA_DATE = '2026-10-23';
  const MAP_ORIGIN = 'https://www.google.com/maps/search/';
  const FORMAL_ORIGIN = 'https://lian852456-dot.github.io/liamlu/';

  function mapUrl(address) {
    // A normal user-facing Google Maps search URL; no Maps JS key, tile, or
    // iframe is loaded by the trial.  It is kept as a replaceable deep link.
    return MAP_ORIGIN + encodeURIComponent(address);
  }

  const coordinateSource = Object.freeze({
    type: 'taipei-address-position-csv',
    datasetUrl: ADDRESS_SOURCE,
    coordinateSystem: 'EPSG:3826 (TWD97 / TM2 zone 121) converted to WGS84',
    fields: ['街路段', '巷', '弄', '號', '橫座標', '縱座標'],
    accessed: DATA_DATE,
    precision: 'door-number point from Taipei address-position dataset'
  });

  // Game coordinates preserve direction and relative distance around 酒泉.
  // x is east-positive, z is south-positive; scale is intentionally compressed
  // for a phone-friendly toy city rather than a real-world walking distance.
  const stores = [
    {
      id: 'jiuquan', short: '酒泉', name: '酒泉生活門市', district: '大同區',
      address: '臺北市大同區酒泉街141號1樓', lat: 25.0721387175, lng: 121.5142344081,
      gamePosition: Object.freeze({x: 0, z: -2.7}),
      x: 0, z: -2.7, mapUrl: mapUrl('臺北市大同區酒泉街141號1樓'),
      note: '木質香氣，剛剛好的日常。'
    },
    {
      id: 'wanda', short: '萬大', name: '萬大生活門市', district: '萬華區',
      address: '臺北市萬華區萬大路275號1樓', lat: 25.0254625226, lng: 121.5005752307,
      gamePosition: Object.freeze({x: -20, z: 37}),
      x: -8.2, z: 25.3, mapUrl: mapUrl('臺北市萬華區萬大路275號1樓'),
      note: '老城街角的溫暖日常。'
    },
    {
      id: 'dadaocheng', short: '大稻埕', name: '大稻埕生活門市', district: '大同區',
      address: '臺北市大同區延平北路2段156號', lat: 25.0579475645, lng: 121.5114244489,
      gamePosition: Object.freeze({x: -2, z: 17}),
      x: -1.7, z: 5.8, mapUrl: mapUrl('臺北市大同區延平北路2段156號'),
      note: '沿著老街，慢慢逛一圈。'
    },
    {
      id: 'fuxingnan', short: '復興南', name: '復興南生活門市', district: '大安區',
      address: '臺北市大安區復興南路2段179號', lat: 25.0269481510, lng: 121.5436801897,
      gamePosition: Object.freeze({x: 20, z: 17}),
      x: 17.7, z: 24.4, mapUrl: mapUrl('臺北市大安區復興南路2段179號'),
      note: '城市綠意裡的生活提案。'
    },
    {
      id: 'sanchuang', short: '三創', name: '三創生活門市', district: '中正區',
      address: '臺北市中正區市民大道3段2號', lat: 25.0456330061, lng: 121.5310209937,
      gamePosition: Object.freeze({x: 20, z: -3}),
      x: 10.1, z: 13.2, mapUrl: mapUrl('臺北市中正區市民大道3段2號'),
      note: '科技與日常，剛好碰面。'
    },
    {
      id: 'hangzhounan', short: '杭州南', name: '杭州南生活門市', district: '大安區',
      address: '臺北市大安區杭州南路2段85號', lat: 25.0288400869, lng: 121.5219798636,
      gamePosition: Object.freeze({x: 20, z: 37}),
      x: 4.6, z: 23.3, mapUrl: mapUrl('臺北市大安區杭州南路2段85號'),
      note: '巷口陽光，靜靜亮著。'
    },
    {
      id: 'yongji', short: '永吉', name: '永吉生活門市', district: '信義區',
      address: '臺北市信義區松隆路76號1樓', lat: 25.0443958848, lng: 121.5690188230,
      gamePosition: Object.freeze({x: 40, z: -3}),
      x: 32.9, z: 13.9, mapUrl: mapUrl('臺北市信義區松隆路76號1樓'),
      note: '把日常放進一點好心情。'
    },
    {
      id: 'tonghua', short: '通化', name: '通化生活門市', district: '大安區',
      address: '臺北市大安區通化街16號', lat: 25.0319828433, lng: 121.5541689147,
      gamePosition: Object.freeze({x: 40, z: 37}),
      x: 24.0, z: 21.4, mapUrl: mapUrl('臺北市大安區通化街16號'),
      note: '夜裡也有剛好的暖光。'
    },
    {
      id: 'liuzhangli', short: '六張犁', name: '六張犁生活門市', district: '大安區',
      address: '臺北市大安區和平東路3段258號', lat: 25.0214960047, lng: 121.5553438647,
      gamePosition: Object.freeze({x: 40, z: 57}),
      x: 24.7, z: 27.7, mapUrl: mapUrl('臺北市大安區和平東路3段258號'),
      note: '山腳下，走慢一點。'
    }
  ].map(item => Object.freeze({
    ...item,
    coordinateSource,
    addressSource: STORE_SOURCE,
    mapProvider: 'external-google-maps-search-only'
  }));

  // These are area landmarks.  The official tourism pages publish the named
  // district/address area, but not a single door-number coordinate for the
  // night markets (and the Taipei 101 address is not represented as one exact
  // row in the downloaded address CSV).  Keep lat/lng null instead of inventing
  // a precision claim; gamePosition is an explicitly labelled visual hint.
  const landmarks = [
    Object.freeze({
      id: 'taipei101', name: '台北101', district: '信義區',
      address: '臺北市信義區信義路5段7號', lat: null, lng: null,
      coordinateStatus: 'address-published-no-matching-door-row', gamePosition: Object.freeze({x: 40, z: 17}), x: 30, z: 20,
      source: 'https://www.travel.taipei/zh-tw/attraction/details/217',
      mapUrl: mapUrl('臺北市信義區信義路5段7號')
    }),
    Object.freeze({
      id: 'shilin-night-market', name: '士林夜市', district: '士林區',
      address: '臺北市士林區大東路、大南路、文林路、基河路間與週邊', lat: null, lng: null,
      coordinateStatus: 'area-landmark-no-single-point', gamePosition: Object.freeze({x: 20, z: -23}), x: 6, z: -13,
      referencePoint: Object.freeze({address:'臺北市士林區基河路101號',lat:25.0879577328,lng:121.5241658992,meaning:'士林市場門牌參考點，非整個夜市中心',source:'https://www.tcma.gov.taipei/News_Content.aspx?n=1A4C7120ABFD0F9F&s=80903C918A9F93E3&sms=26C5BF03E7963F4E'}),
      source: 'https://www.travel.taipei/zh-tw/attraction/details/1536',
      mapUrl: mapUrl('臺北市士林區士林夜市')
    }),
    Object.freeze({
      id: 'ningxia-night-market', name: '寧夏夜市', district: '大同區',
      address: '臺北市大同區寧夏路（南京西路與民生西路間）', lat: null, lng: null,
      coordinateStatus: 'area-landmark-no-single-point', gamePosition: Object.freeze({x: 0, z: 10}), x: 3.8, z: 7.5,
      source: 'https://www.travel.taipei/zh-tw/attraction/details/1560',
      mapUrl: mapUrl('臺北市大同區寧夏夜市')
    })
  ];

  const formalLinks = Object.freeze({
    operations: FORMAL_ORIGIN + 'home.html',
    report: FORMAL_ORIGIN + 'index.html',
    kpi: FORMAL_ORIGIN + 'kpi-battle.html',
    awards: FORMAL_ORIGIN + 'kpi-battle.html#awards',
    tradein: FORMAL_ORIGIN + 'tradein-progress.html',
    price: FORMAL_ORIGIN + 'awards-battle.html'
  });

  const formalLinkReadback = Object.freeze({
    operations: Object.freeze({ title: '北一二B 智慧營運中心', evidence: '常用入口；KPI 戰情、台獎戰情、每日回報系統' }),
    report: Object.freeze({ title: '北一二B 每日回報系統', evidence: '每日回報系統' }),
    kpi: Object.freeze({ title: 'KPI 戰情｜北一二B 智慧營運中心', evidence: 'KPI 戰情' }),
    awards: Object.freeze({ title: 'KPI 戰情｜北一二B 智慧營運中心', evidence: '台獎區段（#awards）' }),
    tradein: Object.freeze({ title: '舊換新專區・目標進度｜北一二B', evidence: '舊換新專區、本月進度、九店進度、個人進度' }),
    price: Object.freeze({ title: '台獎戰情｜北一二B', evidence: '既有手機台獎查詢；正式權限保持' })
  });

  const formalLinkAlternates = Object.freeze({
    phoneAwards: FORMAL_ORIGIN + 'awards-battle.html',
    priceQuery: FORMAL_ORIGIN + 'threec-query.html'
  });

  return Object.freeze({
    version: 'city-taipei-v1',
    mapVersion: 'cozy-pocket-taipei-v2',
    dataDate: DATA_DATE,
    map: Object.freeze({
      kind: 'compressed-relative-cozy3d',
      provider: 'original-cozy3d',
      coordinateSystem: 'WGS84 source coordinates; game x east-positive, z south-positive',
      scaleMetersPerGameUnit: null,
      scaleDescription: '手工壓縮的相對方向提示；各方向不等比例，不代表實際距離或導航比例。',
      disclaimer: '原創壓縮 3D 遊戲街區；不是 Google Maps 地圖圖磚或嵌入。'
    }),
    sources: Object.freeze({ storeLocator: STORE_SOURCE, addressDataset: ADDRESS_SOURCE }),
    stores: Object.freeze(stores),
    landmarks: Object.freeze(landmarks),
    formalLinks,
    formalLinkReadback,
    formalLinkAlternates,
    economy: Object.freeze({ gameGoldToCoins: 50, source: 'ISOLATED_DEMO_WALLET_ONLY' })
  });
}));
