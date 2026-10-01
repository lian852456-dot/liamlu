const XLSX=require('../../assets/vendor/xlsx.full.min.js');
const Core=require('../../department-scores-core.js');
const groups=[['帳務類',[ '保全金疏失','刷卡類疏失','電信資費未即時入帳','溢收未入帳','疏失數','排名']],['人事類',['逾時登入','貼標缺漏','排班缺漏','凌晨登出','出勤缺漏','提早離店','總計','排名']],['門市庫存類',['調撥未簽收','未盤點','總計','排名']],['TQM遠端查核',['查核店數','抽盤結果','保管疏失','盤點規範','紀錄表','未宣導','未簽名','缺失數','排名']],['店務日誌',['查核店數','缺失頁次','缺失店數','排名']],['資安類',['打包缺漏','登記本','文件櫃','個資留存','資安事件','安全規範','電腦未關機','缺失數','排名']]];
function sheet({month=7,layout='final-recycle',offset=0,rowStart=60,missingRow=false,errorScore=false,errorRank=false}={}){
 const rows=Array.from({length:rowStart+12},()=>[]),merges=[];
 rows[2]=['不合格','區域','主管','轄下店數','店務缺失總數','缺失扣分','店務管理指標成績','排名'];
 let c=8;function group(name,labels){rows[2][c]=name;merges.push({s:{r:2,c},e:{r:3,c:c+labels.length-1}});labels.forEach((s,i)=>{rows[5][c+i]=s;});c+=labels.length;}
 groups.forEach(([n,l])=>group(n,l));c+=offset;
 if(layout.startsWith('warning'))group('文件回送預警缺失',['疏失數','排名']);
 group('文件回送懲處final',['疏失數','排名']);group('作廢憑證未回送final',['疏失數']);
 group('CSMO服務查核',layout==='warning-no-recycle'?['店數','缺失數','查核分數','指標扣分']:['缺失數','查核分數','指標扣分']);
 if(layout!=='warning-no-recycle')group('舊機回收判等缺失',['缺失數','排名']);
 rows[5][c]='驗證';
 const counts=[2,2,2,3];for(let i=0;i<4;i++)rows[10+i]=['','北一二'+String.fromCharCode(65+i),'合成督導'+i,counts[i],999,10,90,4];
 let r=rowStart;for(let i=0;i<4;i++)for(let j=1;j<=counts[i];j++){
   rows[r]=['','北一二'+String.fromCharCode(65+i),'合成店'+String.fromCharCode(65+i)+j,1,0,j===1?.5:0,j===1?99.5:100,10];
   for(let k=8;k<=c;k++)rows[r][k]=0;
   r++;
 }
 if(missingRow)rows[rowStart]=[];
 const s=XLSX.utils.aoa_to_sheet(rows);s['!merges']=merges;
 if(errorScore)s['G'+(rowStart+1)]={t:'e',v:23,w:'#REF!'};
 if(errorRank){const h=Core.mapping(s).metrics.find(v=>v.kind==='rank'&&/舊機/.test(v.header));s[h.column+(rowStart+1)]={t:'e',v:23,w:'#REF!'};}
 return s;
}
function workbook(options={}){const name=String(options.month||7)+'月';return {SheetNames:['近半年成績',name],Sheets:{'近半年成績':XLSX.utils.aoa_to_sheet([['區域','姓名','店點(2026.07)','職稱',2026.02,2026.07],['北一二A','合成參照','合成店A1','合成職稱',12,19]]),[name]:sheet(options)}};}
const month=options=>Core.parseWorkbook(workbook(options)).months[0];
module.exports={sheet,workbook,month};
