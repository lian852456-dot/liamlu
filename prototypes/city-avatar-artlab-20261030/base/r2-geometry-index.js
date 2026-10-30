/* Exact BufferGeometry vertex deduplication for static compiled surfaces.
 * Hashing is 32-bit FNV over raw attribute bits; hash collisions are checked
 * against representative source vertices before any merge is accepted.
 * Morph and interleaved attributes are intentionally left untouched.
 */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(root.THREE||globalThis.THREE);
 else if(root)root.CozyGeometryIndex=factory(root.THREE);
})(typeof window==='undefined'?globalThis:window,function(T){
 'use strict';
 const HASH_OFFSET=2166136261,HASH_PRIME=16777619;
 function hashByte(hash,byte){return Math.imul(hash^(byte&0xff),HASH_PRIME)>>>0;}
 function hashWord(hash,word){let value=Number(word)>>>0;hash=hashByte(hash,value);hash=hashByte(hash,value>>>8);hash=hashByte(hash,value>>>16);return hashByte(hash,value>>>24);}
 function hashText(hash,text){for(let index=0;index<text.length;index++)hash=hashByte(hash,text.charCodeAt(index));return hash;}
 function supportedAttribute(attribute){return !!attribute&&!!attribute.array&&!attribute.isInterleavedBufferAttribute;}
 function hasMorphAttributes(geometry){return Object.values(geometry.morphAttributes||{}).some(list=>Array.isArray(list)&&list.length>0);}
 function makeDescriptor(name,attribute){
  const array=attribute.array,itemSize=attribute.itemSize,bytesPerElement=array.BYTES_PER_ELEMENT||1;
  const bitView=(array instanceof Float32Array||array instanceof Float64Array||array instanceof Int32Array||array instanceof Uint32Array)&&array.byteOffset%4===0?new Uint32Array(array.buffer,array.byteOffset,array.byteLength/4):null;
  const isBigInt=typeof array[0]==='bigint';
  const byteView=bitView||!isBigInt?null:new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
  function forEachWord(vertex,callback){
   const base=vertex*itemSize;
   if(bitView){
    const first=bytesPerElement===8?base*2:base;
    for(let component=0;component<itemSize*(bytesPerElement===8?2:1);component++)callback(bitView[first+component]);
    return;
   }
   for(let component=0;component<itemSize;component++){
    const value=array[base+component];
    if(byteView){
     const offset=(base+component)*bytesPerElement;
     for(let byte=0;byte<bytesPerElement;byte+=4){let word=0;for(let part=0;part<4&&byte+part<bytesPerElement;part++)word|=byteView[offset+byte+part]<<(part*8);callback(word>>>0);}
    }else callback(Number(value)>>>0);
   }
  }
  function sameVertex(first,second){
   const firstBase=first*itemSize,secondBase=second*itemSize;
   if(bitView){
    const firstOffset=bytesPerElement===8?firstBase*2:firstBase,secondOffset=bytesPerElement===8?secondBase*2:secondBase,wordCount=itemSize*(bytesPerElement===8?2:1);
    for(let word=0;word<wordCount;word++)if(bitView[firstOffset+word]!==bitView[secondOffset+word])return false;
    return true;
   }
   if(byteView){
    const firstOffset=firstBase*bytesPerElement,secondOffset=secondBase*bytesPerElement;
    for(let byte=0;byte<itemSize*bytesPerElement;byte++)if(byteView[firstOffset+byte]!==byteView[secondOffset+byte])return false;
    return true;
   }
   for(let component=0;component<itemSize;component++)if(!Object.is(array[firstBase+component],array[secondBase+component]))return false;
   return true;
  }
  return{name,itemSize,normalized:attribute.normalized===true,bytesPerElement,forEachWord,sameVertex};
 }
 function dedupeGeometry(input){
  if(!T||!input?.attributes||!supportedAttribute(input.attributes.position)||hasMorphAttributes(input))return input;
  const names=Object.keys(input.attributes).sort(),attributes=names.map(name=>[name,input.attributes[name]]);
  if(attributes.some(([,attribute])=>!supportedAttribute(attribute)))return input;
  const descriptors=attributes.map(([name,attribute])=>makeDescriptor(name,attribute));
  let schemaHash=HASH_OFFSET;
  for(const descriptor of descriptors){schemaHash=hashText(schemaHash,descriptor.name);schemaHash=hashWord(schemaHash,descriptor.itemSize);schemaHash=hashWord(schemaHash,descriptor.normalized?1:0);schemaHash=hashWord(schemaHash,descriptor.bytesPerElement);}
  const position=input.attributes.position,vertexCount=position.count,indexAttribute=input.index,indexArray=indexAttribute?.array||indexAttribute;
  if(!vertexCount)return input;
  const sourceCount=indexAttribute?(indexAttribute.count??indexArray.length):vertexCount;
  const indexData=indexAttribute?new indexArray.constructor(sourceCount):new (vertexCount>65535?Uint32Array:Uint16Array)(sourceCount);
  const representatives=new Uint32Array(vertexCount),buckets=new Map();let uniqueCount=0;
  const hashVertex=sourceIndex=>{let hash=schemaHash;for(const descriptor of descriptors)descriptor.forEachWord(sourceIndex,word=>{hash=hashWord(hash,word)});return hash>>>0;};
  const sameVertex=(first,second)=>descriptors.every(descriptor=>descriptor.sameVertex(first,second));
  for(let offset=0;offset<sourceCount;offset++){
   const sourceIndex=indexAttribute?indexArray[offset]:offset,hash=hashVertex(sourceIndex);let bucket=buckets.get(hash),outputIndex;
   if(bucket===undefined){outputIndex=uniqueCount;representatives[uniqueCount++]=sourceIndex;buckets.set(hash,outputIndex);}
   else if(Array.isArray(bucket)){
    for(const candidate of bucket)if(sameVertex(sourceIndex,representatives[candidate])){outputIndex=candidate;break;}
    if(outputIndex===undefined){outputIndex=uniqueCount;representatives[uniqueCount++]=sourceIndex;bucket.push(outputIndex);}
   }else if(sameVertex(sourceIndex,representatives[bucket]))outputIndex=bucket;
   else{outputIndex=uniqueCount;representatives[uniqueCount++]=sourceIndex;buckets.set(hash,[bucket,outputIndex]);}
   indexData[offset]=outputIndex;
  }
  const identity=sourceCount===vertexCount&&uniqueCount===vertexCount;
  if(identity){let unchanged=true;for(let offset=0;offset<sourceCount;offset++)if(indexData[offset]!==offset){unchanged=false;break;}if(unchanged)return input;}
  const output=new T.BufferGeometry();
  for(const [name,attribute] of attributes){const array=new attribute.array.constructor(uniqueCount*attribute.itemSize),source=attribute.array;for(let outputIndex=0;outputIndex<uniqueCount;outputIndex++){const sourceIndex=representatives[outputIndex],sourceOffset=sourceIndex*attribute.itemSize,targetOffset=outputIndex*attribute.itemSize;for(let component=0;component<attribute.itemSize;component++)array[targetOffset+component]=source[sourceOffset+component];}const next=new T.BufferAttribute(array,attribute.itemSize,attribute.normalized===true);if(attribute.usage!==undefined&&typeof next.setUsage==='function')next.setUsage(attribute.usage);if(attribute.gpuType!==undefined)next.gpuType=attribute.gpuType;output.setAttribute(name,next);}
  output.setIndex(new T.BufferAttribute(indexData,1,indexAttribute?.normalized===true));
  for(const group of input.groups||[])output.addGroup(group.start,group.count,group.materialIndex);
  if(input.drawRange)output.setDrawRange(input.drawRange.start,input.drawRange.count);
  output.name=input.name||'';output.userData={...(input.userData||{})};output.boundingBox=input.boundingBox?.clone?.()||null;output.boundingSphere=input.boundingSphere?.clone?.()||null;
  return output;
 }
 return{dedupeGeometry};
});
