const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const F=require('../fixtures/insurance-progress.cjs'),{setup}=require('./insurance-runtime.cjs');
const {render}=require('../../scripts/north12b/render_insurance_source.cjs');
const template=fs.readFileSync(path.resolve(__dirname,'../../gas/InsuranceFixedSource.gs'),'utf8');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function fixed({unconfigured=false,changePin=()=>{},changeSource=()=>{}}={}){
 const source=F.data(.375,.5);
 const part=source.meta.insuranceConsultationSource,reportFile=F.date.slice(5).replace('-','')+'.xlsx';
 Object.assign(source.meta,{reportDate:F.date,sourceFile:reportFile});
 Object.assign(part,{sourceFile:reportFile,version:hash('synthetic-version')});
 changeSource(source);
 const payload={schema:'insurance-source-payload/v1',data:{meta:source.meta,stores:source.stores}};
 const bytes=Buffer.from(JSON.stringify(payload)),pin={fileId:'synthetic_drive_file',ownerEmail:'owner@example.invalid',payloadSha256:hash(bytes),sourceSha256:part.sourceSha256,reportDate:F.date,cutoff:F.date,people:9};
 changePin(pin);
 const f=setup(source,unconfigured?template:render(template,pin));
 const meta={id:pin.fileId,name:'north12b-insurance-consult-source-v1.json',mimeType:'application/json',version:'1',size:bytes.length,parents:['root'],shared:false,trashed:false,owners:[{me:true,emailAddress:pin.ownerEmail,permissionId:'owner'}],permissions:[{id:'owner',type:'user',role:'owner'}],permissionIds:['owner']};
 let currentBytes=bytes,reads=0;
 f.ctx.Drive={Files:{get(id){assert.equal(id,pin.fileId);reads++;return {...meta};}}};
 f.ctx.DriveApp={getRootFolder:()=>({getId:()=>'root'}),getFileById(id){assert.equal(id,pin.fileId);return {getBlob:()=>({getBytes:()=>Array.from(currentBytes),getDataAsString:()=>currentBytes.toString('utf8')})};}};
 const gasDigest=f.ctx.Utilities.computeDigest;f.ctx.Utilities.computeDigest=(algo,value)=>Array.isArray(value)?Array.from(crypto.createHash('sha256').update(Buffer.from(value)).digest()):gasDigest(algo,value);
 f.ctx.console={log(){}};
 f.useFixedSource();let sessionProof;
 const proof=()=>sessionProof??=f.login();
 const read=(session=proof())=>f.handle({action:'employee_insurance_read',...session,dataDate:F.date});
 return {f,pin,meta,get proof(){return proof();},read,setBytes:b=>{currentBytes=b;},get reads(){return reads;}};
}
module.exports={fixed,template};
