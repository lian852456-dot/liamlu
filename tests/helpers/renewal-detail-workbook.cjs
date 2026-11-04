const X=require('../../assets/vendor/xlsx.full.min.js'),{workbook}=require('./readonly-conversion-workbook.cjs');
function source({days=11}={}){
 const w=X.read(workbook({days}),{type:'buffer'});
 for(const name of ['AQ締結率','RT每日','RT締結率']){const r=X.utils.sheet_to_json(w.Sheets[name],{header:1,defval:null});for(const [i,region]of ['北一二A','北一二C','北一二D'].entries()){const row=r[2].slice();row[2]=region;row[3]='DNB'+(20001+i);row[4]='合成門市'+i;r.push(row);}w.Sheets[name]=X.utils.aoa_to_sheet(r);}
 const rows=X.utils.sheet_to_json(w.Sheets['AQ締結率'],{header:1,defval:null}).slice(2),b=[[],[],[],[]],o=[[],[],[],[]],p=[['進店課別','進店店點代碼','進店日期','方案描述(含換約案)','續約Y/N','@是否符合續約資格_進店(含提前續約)_E-15','Subscr Id(2T)']];
 o[0][1]='符合續約資格締結率分析 - by Tier (10/1 ~ 10/'+days+')';
 for(const [origin,c]of [['TWM',3],['TST',21]]){o[1][c]='原'+origin+'用戶';for(let i=0;i<5;i++){o[2][c+3*i]='ABCDE'[i];o[3][c+3*i]='上線數';o[3][c+3*i+1]='來客數';}}
 for(let i=0;i<6;i++){b[1][4+5*i]='ABCDEF'[i];['符合續約資格進店用戶數','1. 續約','2. NP OUT','3. 退租','4. 單純進店'].forEach((v,j)=>b[3][4+5*i+j]=v);}
 for(const r of rows){const row=['北一二部',r[2],r[3],r[4]];for(let i=0;i<6;i++)row.push(20,10,2,3,5);row.push(120,60,12,18,30);b.push(row);const serial=46300;p.push([r[2],r[3],serial,'合成方案 <標準>','N','1.符合續約資格','SYNTHETIC_'+r[3]]);}
 for(const region of ['北一二A','北一二B','北一二C','北一二D']){const row=[];row[1]=region;for(const c of [3,21])for(let i=0;i<5;i++){row[c+3*i]=2;row[c+3*i+1]=10;}o.push(row);}
 for(const [name,r]of [['Tier觀察',o],['RT用戶進店行為_店',b],['未續約明細',p]]){w.SheetNames.push(name);w.Sheets[name]=X.utils.aoa_to_sheet(r);}return w;
}
module.exports={source};
