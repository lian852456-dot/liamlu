'use strict';
const C=require('../../readonly-dashboard-core.js'),XLSX=require('../../assets/vendor/xlsx.full.min.js');
function workbook({days=3,bad=false,month='2026-10',rateGap=11,priorGap=67,fixed31=false,blankRtTotal=false,bookType='xlsx'}={}){
  const sheets=Object.fromEntries(['AQ締結率','RT每日','RT締結率','樞紐'].map(n=>[n,[[],[]]]));
  const [year,m]=month.split('-').map(Number),length=new Date(Date.UTC(year,m,0)).getUTCDate(),slots=fixed31?31:length,offsets=Array.from({length:4},(_,i)=>5+i*(slots+1)),[anCol,adCol,arCol,tsdCol]=offsets,rrCol=tsdCol+slots+1+rateGap,priorCol=arCol+slots+1+priorGap;
  const aq=sheets['AQ締結率'],rt=sheets['RT每日'],total=sheets['RT締結率'];
  for(const rows of [aq,rt,total])rows[0][0]=m+'/1 ~ '+m+'/'+days;
  aq[0][anCol]='AQ上線數';aq[0][adCol]='AQ來客數';aq[0][arCol]='AQ締結率';aq[0][priorCol]='上月同期';aq[1][priorCol]='上線數';aq[1][priorCol+1]='來客數';
  rt[0][anCol]='原TWM用戶上線數';rt[0][adCol]='原TWM用戶來客數';rt[0][arCol]='原TST用戶';rt[0][rrCol]='RT 締結率';
  for(const c of [anCol,adCol,arCol])aq[1][c+slots]='TTL';
  for(const [c,label]of [[anCol,'TTL'],[adCol,'TTL'],[arCol,'上線'],[tsdCol,'來客'],[rrCol,'TTL']])rt[1][c+slots]=label;
  for(const [c,label]of [[5,'原TWM用戶'],[10,'原TST用戶'],[15,'符合續約資格TTL'],[27,'上月同期'],[33,'MOM']])total[0][c]=label;
  for(const c of [5,10,15])['上線數','來客數','締結率'].forEach((v,j)=>total[1][c+j]=v);
  total[1][31]='TTL\n上線數';total[1][32]='TTL\n來客數';
  const serial=date=>Math.round((Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
  for(let j=0;j<slots;j++){const d=serial(month+'-'+String(j+1).padStart(2,'0'));for(const o of [...offsets,rrCol])rt[1][o+j]=d;for(const o of offsets.slice(0,3))aq[1][o+j]=d;}
  for(const [i,s] of C.STORES.entries()){
    const a=[],r=[],t=[];for(const row of [a,r,t]){row[2]='北一二B';row[3]=s.id;row[4]=s.name;}
    const noRt=blankRtTotal&&i===0;
    let an=0,ad=0,tn=0,td=0,sn=0,sd=0;
    for(let j=0;j<length;j++){
      const n=j<days?j+1:0,d=j<days?10+i:0,hasRt=j<days&&!noRt;
      const tw=hasRt?j:0,twD=hasRt?20+i:0,ts=hasRt?1:0,tsD=hasRt?2:0;
      a[anCol+j]=n;a[adCol+j]=d;a[arCol+j]=d?n/d:0;
      r[anCol+j]=tw;r[adCol+j]=twD;r[arCol+j]=ts;r[tsdCol+j]=tsD;r[rrCol+j]=twD+tsD?(tw+ts)/(twD+tsD):0;
      an+=n;ad+=d;tn+=tw;td+=twD;sn+=ts;sd+=tsD;
    }
    if(fixed31&&length<slots){a[anCol+length]=0;r[tsdCol+length]='0';}
    a[anCol+slots]=an;a[adCol+slots]=ad;a[priorCol]=2;a[priorCol+1]=10;
    r[anCol+slots]=tn;r[adCol+slots]=td;r[arCol+slots]=sn;r[tsdCol+slots]=sd;
    t[5]=tn;t[6]=td;t[10]=sn;t[11]=sd;t[15]=tn+sn;t[16]=td+sd;t[17]=noRt?null:(tn+sn)/(td+sd);t[31]=3;t[32]=20;
    aq.push(a);rt.push(r);total.push(t);
  }
  const previous=new Date(Date.UTC(year,m-2,1)).getUTCMonth()+1;
  sheets['樞紐'][0][0]=previous+'/1 ~ '+previous+'/'+days;
  if(bad)aq[2][anCol+slots]++;
  const wb=XLSX.utils.book_new();for(const [name,rows]of Object.entries(sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
  return Buffer.from(XLSX.write(wb,{type:'buffer',bookType}));
}
module.exports={workbook};
