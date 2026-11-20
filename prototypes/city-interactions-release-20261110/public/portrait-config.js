(function(root){'use strict';
const presets={
 'portrait-trial-a-v1':{key:'a',hairTone:0x3d2c24,skinTone:0xf0c7ad,faceWidth:.95,jaw:.17,brow:0x514033,noseX:.96,mouthWidth:.95,mouthCorner:.008,uniform:'olive'},
 'portrait-trial-b-v1':{key:'b',hairTone:0x211e1b,skinTone:0xe9bda3,faceWidth:1.025,jaw:.085,brow:0x3a302d,noseX:1.08,mouthWidth:1.08,mouthCorner:.011,uniform:'banded',glasses:true,badge:true},
 'portrait-trial-c-v1':{key:'c',hairTone:0x302623,skinTone:0xedc4ab,faceWidth:1.03,jaw:.10,brow:0x48372e,noseX:1.04,mouthWidth:1.04,mouthCorner:-.004,uniform:'banded'}
};root.CozyPortraitConfig=Object.freeze({presets:Object.freeze(presets),get:key=>presets[key]||null});
})(globalThis);
