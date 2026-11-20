const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10),stores=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
function data(rate=.42857,storeRate=.5){
 const sheet='搭售達成率 (手機保險)',periodStart=date.slice(0,7)+'-01';
 const s={schema:'insurance-consultation-source/v2',sourceFile:'SYNTHETIC.xlsx',sourceSha256:'a'.repeat(64),publicationDate:date,version:'b'.repeat(64),stores:{sheet,column:'H',status:'verified',periodStart,cutoff:date,periodEvidence:{sheet,cell:'A2',text:'SYNTHETIC STORE PERIOD'},rows:stores.map((store,i)=>({code:'SYNTHSTORE'+i,store:'台北'+store,rate:storeRate}))},personal:{sheet:sheet+' _個人',column:'M',status:'verified',periodStart,cutoff:date,periodEvidence:{sheet:sheet+' _個人',cell:'D3',text:'SYNTHETIC PERSONAL PERIOD'},rows:stores.map((store,i)=>({subjectId:'SYNTH'+String(i+1).padStart(3,'0'),storeCode:'SYNTHSTORE'+i,store:'台北'+store,maskedName:'合*成'+i,identityStatus:'verified',rate}))}};
 return {meta:{sourceFile:s.sourceFile,sourceSha256:s.sourceSha256,reportDate:date,insuranceConsultationSource:s},stores:stores.map((store,i)=>({code:'SYNTHSTORE'+i,name:'台北'+store})),persons:[]};
}
const values={advisor:'合成請益對象',icebreaker:'合成破冰',tools:'合成工具',approach:'合成作法',followup:'合成提醒'};
module.exports={date,stores,data,values};
