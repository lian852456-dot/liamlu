/* Test-only synthetic backend. No requests reach a formal endpoint. */
exports.install=function () {
  const OriginalDate=Date;
  window.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2099-10-02T07:00:00Z']));}static now(){return new OriginalDate('2099-10-02T07:00:00Z').valueOf();}};
  const stores=['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
  window.__summaryCalls=[];window.__readMode='ok';window.__preadMode='ok';window.__heldReads=[];window.__heldPersonal=[];
  window.__summaryRows=stores.slice(0,7).flatMap((store,i)=>[16,21].map(seg=>({date:'2099-10-02',store,seg,savedAt:(seg===16?'15':'20')+':'+String(10+i),kpi:80+i,rank:20+i,early_renew:0,rt_close_num:1,rt_close_den:2,rt_close_pct:50,insurance_num:i===0?0:i===1?20:i===2?1:i===3?null:i===4?'junk':i===5?0:1,insurance_den:i===0?0:i===1?100:i===2?1:i===5?5:2,insurance_pct:99,'5g':0,aq_ttl:3,aq999:i===5?'2bad':i===0?0:i+(seg===21?10:0),aq1399:i===4?null:i%2,rt_pts:4,special_renew:0,premium_renew:0,rt999:i===6?-1:i+1,rt1399:i%2,haosu:i/2,acc:i*100,film:0,insurance:1,myvideo:0,apple_google:0,hbo:0,netflix:0,management_focus_json:JSON.stringify({op_online:i%2,op_accum:i*3,op_target:i===5?null:20,mycharge_clicked:i%2,mycharge_tagged:2,mycharge_pct:99}),zero_reason:i===0&&seg===21?'合成：已明確回報零，尚未完成簽約。':'',zero_consult:'合成長姓名同仁－陳王歐陽複姓排版測試',zero_method:'合成請益：確認需求後分開說明方案，再安排回訪，全文換行不省略。'.repeat(10),zero_plan:'合成明日計畫：開店前複盤，午前回訪。'})));
  window.__summaryRows.push({date:'2099-10-02',store:'杭州南',seg:16,aq999:10000});
  const originalFetch=window.fetch.bind(window);
  window.fetch=async (url,options={})=>{
    if(new URL(String(url),location.href).origin===location.origin)return originalFetch(url,options);
    const p=JSON.parse(options.body||'{}');window.__summaryCalls.push(p);
    if(p.action==='read') {
      if(window.__readMode==='throw')throw new Error('synthetic disconnected');
      const data=window.__readMode==='empty'?{}:Object.fromEntries(window.__summaryRows.filter(r=>r.date===p.date&&Number(r.seg)===Number(p.seg)).map(r=>[r.store,{...r, ...(r.store==='杭州南'?{date:'2099-10-01'}:{})}]));
      const result=window.__readMode==='error'?{status:'error',message:'synthetic access expired'}:{status:'ok',data:window.__readMode==='malformed'?null:data};
      const response=new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
      if(window.__holdRead)return new Promise(resolve=>window.__heldReads.push({payload:p,release:()=>resolve(response)}));
      return response;
    }
    if(p.action==='pread'){
      const name='合成長姓名同仁－陳王歐陽複姓排版測試';
      const result=window.__preadMode==='error'?{status:'error',message:'synthetic personal access expired'}:{status:'ok',data:{通化:{[name]:{date:p.date,seg:p.seg,store:'通化',name,failed:['aq999'],data:{aq999:0},extra:{customers:0,consult_person:name,consult_store:'台北三創',consult_method:'合成個人請益全文排版測試，不省略或橫向拖動。'.repeat(16),fail_reason:'合成原因',improve_plan:'合成改善'}}}}};
      const response=new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
      if(window.__holdPersonal)return new Promise(resolve=>window.__heldPersonal.push({payload:p,release:()=>resolve(response)}));
      return response;
    }
    return new Response(JSON.stringify({status:'error',message:'synthetic harness denies all other actions'}));
  };
};
