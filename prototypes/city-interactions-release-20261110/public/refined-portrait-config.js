(function(root){'use strict';const presets={
 'refined-p3-v1':{key:'p3',label:'鍾嘉玲',hairTone:0x2a2421,skinTone:0xecc0a3,faceWidth:.98,jaw:.13,brow:0x49342b,noseX:.94,mouthWidth:1.14,mouthCorner:.032,mouthOpen:.038,eyeAspect:.90,uniform:'dress',openSmile:true,badge:false,earrings:true},
 'refined-p5-v1':{key:'p5',label:'李舒緩',hairTone:0x302623,skinTone:0xedc4ab,faceWidth:1.03,jaw:.10,brow:0x48372e,noseX:1.04,mouthWidth:1.04,mouthCorner:-.004,eyeAspect:.90,uniform:'black-skirt'},
};root.CozyRefinedPortraitConfig=Object.freeze({presets:Object.freeze(presets),get:key=>presets[key]||null});})(globalThis);
