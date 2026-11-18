const date='2099-10-02',store='台北三創';
function data(rate=0.4){return {meta:{sourceFile:'SYNTHETIC.xlsx',sourceSha256:'a'.repeat(64),reportDate:date,storeInsuranceProgress:{schema:'store-insurance-progress/v1',sourceFile:'SYNTHETIC.xlsx',sourceSha256:'a'.repeat(64),version:'b'.repeat(64),publicationDate:date,sheet:'搭售達成率 (手機保險)',column:'H',status:'verified',periodStart:'2099-10-01',cutoff:'2099-10-01',periodEvidence:{sheet:'搭售達成率 (手機保險)',cell:'A2',text:'統計期間：2099/10/01～2099/10/01'},rows:[{code:'DNB-SYNTHETIC',store,rate}]}},stores:[{code:'DNB-SYNTHETIC',name:store}],persons:[]};}
const values={advisor:'合成請益對象',icebreaker:'合成破冰',tools:'合成工具',approach:'合成作法',followup:'合成提醒'};
module.exports={date,store,data,values};
