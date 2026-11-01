(function(root){'use strict';const presets={
 'photo-p1-v1':{key:'p1',label:'袁宇程',hairTone:0x292320,skinTone:0xe7b99e,faceWidth:1.075,jaw:.055,brow:0x46362e,noseX:1.10,mouthWidth:.95,mouthCorner:-.004,eyeAspect:.86,uniform:'banded',mask:true,badge:true},
 'photo-p2-v1':{key:'p2',label:'蔡妘㮀',hairTone:0x483027,skinTone:0xecc0a4,faceWidth:1.025,jaw:.12,brow:0x574034,noseX:1.05,mouthWidth:1.15,mouthCorner:.021,eyeAspect:1,uniform:'banded',necklace:true,badge:true},
 'photo-p3-v1':{key:'p3',label:'鍾嘉玲',hairTone:0x2a2421,skinTone:0xf1c6aa,faceWidth:.94,jaw:.20,brow:0x49342b,noseX:.94,mouthWidth:1.06,mouthCorner:.032,eyeAspect:.96,uniform:'banded',openSmile:true,badge:true},
 'photo-p4-v1':{key:'p4',label:'莊佩璇',hairTone:0x392821,skinTone:0xefc6b0,faceWidth:.97,jaw:.23,brow:0x563d32,noseX:.96,mouthWidth:1.02,mouthCorner:.005,eyeAspect:.90,uniform:'sleeveless',necklace:false}
};root.CozyPortraitConfig=Object.freeze({presets:Object.freeze(presets),get:key=>presets[key]||null});})(globalThis);
