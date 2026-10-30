/* Decorative neighbors use the same swept navigation as the player. */
(function(root){'use strict';
 function build(rules,nav){
  const result=[],doors=rules.storeDoors,obs=rules.obstacles.outdoor,bounds=rules.bounds.outdoor;
  for(const [from,to]of[['jiuquan','sanchuang'],['jiuquan','dadaocheng'],['sanchuang','fuxingnan'],['dadaocheng','wanda'],['fuxingnan','hangzhounan'],['yongji','tonghua'],['hangzhounan','tonghua'],['tonghua','liuzhangli']]){
   const a=doors[from],b=doors[to];if(!a||!b)continue;const path=nav.route(a,b,obs,bounds);if(!path.length)continue;
   const oneWay=[{x:a.x,z:a.z}];for(const end of path){const start=oneWay.at(-1),n=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/2.8));for(let i=1;i<=n;i++)oneWay.push({x:start.x+(end.x-start.x)*i/n,z:start.z+(end.z-start.z)*i/n});}
   const loop=oneWay.concat(oneWay.slice(1,-1).reverse().map(p=>({...p})));
   if(loop.every((p,i)=>nav.clear(p,loop[(i+1)%loop.length],obs,bounds)))result.push(loop);
  }
  return result;
 }
 const api={build};root.CozyAmbientRoutes=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
