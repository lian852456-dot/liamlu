// Synthetic only: crosses every original single-page capacity without private source data.
module.exports=function overflowFixture({storesPerRegion=11,lowCount=30,categories=15}={}){
 const period=['2026-02','2026-03','2026-04','2026-05','2026-06','2026-07'];
 return {contract:'north12-scores-brief-v1',period,filters:{},records:period.flatMap(monthKey=>Array.from({length:storesPerRegion*4},(_,i)=>({
   monthKey,region:'北一二'+'ABCD'[Math.floor(i/storesPerRegion)],store:'合成'+'ABCD'[Math.floor(i/storesPerRegion)]+String(i%storesPerRegion+1).padStart(2,'0'),
   score:i<lowCount?98:100,defects:i<lowCount?1:0,deduction:i<lowCount?2:0,
   metrics:i<lowCount?[{kind:'defect',status:'number',value:1,unit:'原表單位',group:'合成分類'+String(i%categories+1).padStart(2,'0'),label:'疏失',cell:'Z10'}]:[]
 })))};
};
