export const STORES=Object.freeze([
{id:'jiuquan',name:'酒泉',travelUnits:0}, {id:'wanda',name:'萬大',travelUnits:4}, {id:'dadaocheng',name:'大稻埕',travelUnits:3},
{id:'fuxingnan',name:'復興南',travelUnits:5}, {id:'sanchuang',name:'三創',travelUnits:4}, {id:'hangzhounan',name:'杭州南',travelUnits:5},
{id:'yongji',name:'永吉',travelUnits:6}, {id:'tonghua',name:'通化',travelUnits:6}, {id:'liuzhangli',name:'六張犁',travelUnits:7}]);
export const ECONOMY=Object.freeze({version:'city-economy-v1',goldCoinValue:50,starterCoins:320,starterGold:12,dailyCoinCap:100,sessionHours:8,workReceiptMinutes:10,
 tasks:[{id:'report',name:'完成回報',coins:30},{id:'kpi',name:'查看 KPI',coins:15},{id:'awards',name:'查看台獎',coins:15},{id:'tradein',name:'查看舊換新',coins:20},{id:'price',name:'手機獎金查詢',coins:20}]});
export const VEHICLES=Object.freeze({
 'scooter-mint':Object.freeze({id:'scooter-mint',name:'薄荷小機車',category:'car',priceStatus:'pending',coins:0,gold:null,currency:'personalGold',style:'scooter',speed:6.2}),
 'car-mint':Object.freeze({id:'car-mint',name:'薄荷小車',category:'car',priceStatus:'pending',coins:0,gold:null,currency:'personalGold',style:'mint',speed:8.2}),
 'car-sun':Object.freeze({id:'car-sun',name:'陽光旅行車',category:'car',priceStatus:'pending',coins:0,gold:null,currency:'personalGold',style:'sun',speed:9.4}),
 'car-violet':Object.freeze({id:'car-violet',name:'紫色跑車',category:'car',priceStatus:'pending',coins:0,gold:null,currency:'personalGold',style:'violet',speed:11})
});
export const CATALOG=Object.freeze([
{id:'outfit-rose',category:'outfit',name:'莓果制服',coins:45,gold:0,style:'rose'},
{id:'outfit-ocean',category:'outfit',name:'海藍制服',coins:55,gold:0,style:'ocean'},
{id:'outfit-gold',category:'outfit',name:'星光禮服色系',coins:35,gold:1,style:'gold'},
{id:'hair-braids',category:'hair',name:'雙辮造型',coins:35,gold:0,style:'braids'},
{id:'hair-pony',category:'hair',name:'緞帶長馬尾',coins:40,gold:0,style:'pony'},
{id:'hair-silver',category:'hair',name:'銀灰短髮色',coins:30,gold:0,style:'silver'},
{id:'desk-oak',category:'furniture',name:'木質接待桌',coins:35,gold:0},
{id:'shelf-orange',category:'furniture',name:'橘光商品架',coins:40,gold:0},
{id:'sofa-mint',category:'furniture',name:'薄荷雙人沙發',coins:50,gold:0},
{id:'plant-palm',category:'supplies',name:'招財小盆栽',coins:15,gold:0},
{id:'lamp-gold',category:'supplies',name:'暖光立燈',coins:25,gold:0},
{id:'display-phone',category:'supplies',name:'手機展示座',coins:30,gold:0},
{id:'home-studio',category:'home',name:'河畔小屋',priceStatus:'pending',coins:0,gold:null,currency:'personalGold',style:'riverside'},
{id:'home-loft',category:'home',name:'都會閣樓',priceStatus:'pending',coins:0,gold:null,currency:'personalGold',style:'loft'},
{id:'pet-cat',category:'pet',name:'橘光小貓',kind:'cat',coins:40,gold:0,style:'cat'},
{id:'pet-dog',category:'pet',name:'暖陽小狗',kind:'dog',coins:55,gold:0,style:'dog'},
{id:'pet-ribbon-mint',category:'petAccessory',name:'薄荷小領巾',kind:'ribbon',coins:15,gold:0,style:'mint'},
{id:'pet-ribbon-sun',category:'petAccessory',name:'陽光小領巾',kind:'ribbon',coins:20,gold:0,style:'sun'},
VEHICLES['scooter-mint'],
VEHICLES['car-mint'],
VEHICLES['car-sun'],
VEHICLES['car-violet'],
{id:'unlock-express',category:'unlock',name:'城市接駁通行證',coins:0,gold:2,style:'express'}]);
export const CHARACTERS=['orange','sunny','forest','violet'];
export function taipeiDate(now=Date.now()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now))}
