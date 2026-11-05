const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const H=require('../../offline-html.js'),B=require('../../battle-html-export.js'),K=require('../../kpi-battle-controller.js'),S=require('../../readonly-store-snapshot.js'),A=require('../../readonly-dashboard-adapter.js'),D=require('../../department-readonly-core.js'),DA=require('../../department-readonly-assets.js'),DF=require('./department-readonly-synthetic.cjs'),P=require('../../patrol-inspection-export.js'),O=require('../../north12-officer-core.js'),X=require('../../assets/vendor/xlsx.full.min.js');
const {fixture}=require('./readonly-dashboard-fixture.cjs'),{workbook}=require('./readonly-conversion-workbook.cjs');
async function samples(){
 const bundle=fixture(),data=K.mergeKpiBattleSupplement(K.kpicalcToKpiBattleView(bundle.kpiResult.data,'合成讀取時間'),bundle.privateResult.snapshot.kpiBattle);
 data.personal[0].name='測＊員';data.secret='DO_NOT_EXPORT_SECRET';data.employeeId='DO_NOT_EXPORT_ID';
 const awards=structuredClone(bundle.privateResult.snapshot.awardsBattle);awards.overall.store='北一二B整體';awards.secret='DO_NOT_EXPORT_SECRET';awards.source_date_range='2026/10/01～2026/10/13';
 const store=S.fromModel(A.fromBundle(bundle),{generatedAt:'2026-10-18T04:00:00Z',exampleLabel:'合成測試資料，非正式營運數據'}),department=DF.input(),patrol={contract:P.CONTRACT,month:'2026-11',stores:['合成門市'],rows:[{checkId:'synthetic-check',date:'2026-11-04',store:'合成門市',inspector:'合成督導',item:104,result:'abnormal',note:'合成缺失',improvement:'尚待改善',media:[]}],readAt:'2026-11-04T00:00:00Z',demo:true};
 const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../north12-officer-export-assets.js'),'utf8'),context);const assets=context.window.North12OfficerExportAssets;
 const officer=O.parseWorkbook(X.read(workbook({days:3}),{type:'buffer'}),X,{sha256:'a'.repeat(64),source_name:'SYNTHETIC.xlsx',source_bytes:1});
 const E=await import('../../tradein-export-core.mjs'),R=await import('../../tradein-reminder.mjs');
 const people=Array.from({length:9},(_,i)=>['合成門市'+(i%3),'合＊'+i,'同仁',i===8?null:i,[{model:'合成機款 128G',units:i}]]);
 const rules={...E.rulesForMonth('2026-10'),isDemo:true},tradein=E.buildExportModel({active:true,mode:'public',people,allowedStores:['合成門市0','合成門市1','合成門市2'],storeSummaries:[{store:'合成門市0',actual:14,target:18},{store:'合成門市1',actual:12,target:18},{store:'合成門市2',actual:null,target:18}]},'all',rules);
 return {data,awards,store,department,patrol,officer,assets,tradein,html:{kpi:B.buildKpi(data),awards:B.buildAwards(awards),store:S.buildHtml(store),department:D.createHTML(department,DA),patrol:P.buildHTML(patrol),officer:O.buildHtml(officer,assets),tradein:R.createTradeinHtml(tradein)}};
}
module.exports={samples};
