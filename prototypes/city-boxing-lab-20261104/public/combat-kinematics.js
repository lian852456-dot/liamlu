(function(root){'use strict';
const specs=Object.freeze({punch:{duration:820,impact:240,reach:1.16,points:3,step:.22},hook:{duration:1000,impact:320,reach:1.25,points:4,step:.14},guard:{duration:750},dodge:{duration:900},retreat:{duration:850}});
function motion(kind,age,seq=0){const s=specs[kind];if(!s||age<0||age>s.duration)return{x:0,z:0,progress:0};const t=age/s.duration,beat=Math.sin(Math.PI*t);if(kind==='punch'||kind==='hook'){const peak=s.impact/s.duration;return{x:0,z:s.step*(t<peak?Math.sin(t/peak*Math.PI/2):Math.cos((t-peak)/(1-peak)*Math.PI/2)),progress:t};}if(kind==='dodge')return{x:(seq%2?1:-1)*.42*beat,z:-.12*beat,progress:t};if(kind==='retreat')return{x:0,z:-.38*beat,progress:t};return{x:0,z:0,progress:t};}
function position(side,kind,age,seq){const m=motion(kind,age,seq),heading=side<0?Math.PI/2:-Math.PI/2;return{x:side*.66+Math.sin(heading)*m.z+Math.cos(heading)*m.x,z:Math.cos(heading)*m.z-Math.sin(heading)*m.x};}
const api=Object.freeze({specs,motion,position});if(typeof module!=='undefined')module.exports=api;root.CozyBoxingKinematics=api;
})(typeof globalThis==='undefined'?this:globalThis);
