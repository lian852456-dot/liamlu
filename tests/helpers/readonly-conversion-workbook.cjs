'use strict';
const C=require('../../readonly-dashboard-core.js'),XLSX=require('../../assets/vendor/xlsx.full.min.js');
function workbook({days=3,bad=false}={}){
  const sheets=Object.fromEntries(['AQ締結率','RT每日','RT締結率','樞紐'].map(n=>[n,[[],[]]]));
  const aq=sheets['AQ締結率'],rt=sheets['RT每日'],total=sheets['RT締結率'],offsets=[5,37,69,101];
  for(const rows of [aq,rt,total])rows[0][0]='10/1 ~ 10/'+days;
  aq[0][5]='AQ上線數';aq[0][37]='AQ來客數';rt[0][5]='原TWM用戶上線數';rt[0][37]='原TWM用戶來客數';rt[0][69]='原TST用戶';
  const serial=date=>Math.round((Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
  for(let j=0;j<31;j++){const d=serial('2026-10-'+String(j+1).padStart(2,'0'));for(const o of offsets)rt[1][o+j]=d;for(const o of offsets.slice(0,3))aq[1][o+j]=d;}
  for(const [i,s] of C.STORES.entries()){
    const a=[],r=[],t=[];for(const row of [a,r,t]){row[2]='北一二B';row[3]=s.id;row[4]=s.name;}
    let an=0,ad=0,tn=0,td=0,sn=0,sd=0;
    for(let j=0;j<31;j++){
      const n=j<days?j+1:0,d=j<days?10+i:0,tw=j<days?j:0,twD=j<days?20+i:0,ts=j<days?1:0,tsD=j<days?2:0;
      a[5+j]=n;a[37+j]=d;a[69+j]=d?n/d:0;
      r[5+j]=tw;r[37+j]=twD;r[69+j]=ts;r[101+j]=tsD;r[144+j]=twD+tsD?(tw+ts)/(twD+tsD):0;
      an+=n;ad+=d;tn+=tw;td+=twD;sn+=ts;sd+=tsD;
    }
    a[36]=an;a[68]=ad;a[169]=2;a[170]=10;
    r[36]=tn;r[68]=td;r[100]=sn;r[132]=sd;
    t[5]=tn;t[6]=td;t[10]=sn;t[11]=sd;t[15]=tn+sn;t[16]=td+sd;t[17]=(tn+sn)/(td+sd);t[31]=3;t[32]=20;
    aq.push(a);rt.push(r);total.push(t);
  }
  sheets['樞紐'][0][0]='9/1 ~ 9/'+days;
  if(bad)aq[2][36]++;
  const wb=XLSX.utils.book_new();for(const [name,rows]of Object.entries(sheets))XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
  return Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
}
module.exports={workbook};
