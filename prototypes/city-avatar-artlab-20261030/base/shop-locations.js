(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CityShopLocations=api;})(typeof window==='undefined'?null:window,function(){'use strict';
 const definitions=[{id:'pet',name:'喵汪寵物店'},{id:'fashion',name:'橘光服飾店'},{id:'lifestyle',name:'日常選物店'},{id:'scooter',name:'薄荷機車行'},{id:'cars',name:'小城汽車展間'}];
 function select({layout,nav,obstacles,bounds,spawn}){// Reserved scenery lots are raised gardens, one merged lot and the existing night market.
 const reserved=new Set([0,19,29,30,46]);const candidates=layout.buildings.map((b,index)=>({index,building:b,stand:{x:b.x,z:b.z+b.d/2+1.1}})).filter(v=>!reserved.has(v.index)&&!nav.blocked(v.stand,obstacles,bounds)).sort((a,b)=>Math.hypot(a.building.x-spawn.x,a.building.z-spawn.z)-Math.hypot(b.building.x-spawn.x,b.building.z-spawn.z)||a.index-b.index);const result=[];for(const c of candidates){if(!nav.route(spawn,c.stand,obstacles,bounds).length)continue;result.push({...definitions[result.length],...c});if(result.length===definitions.length)break;}return result;}
 return{definitions,select};
});
