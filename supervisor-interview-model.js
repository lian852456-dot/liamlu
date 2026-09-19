(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.SupervisorInterviewModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const FIELD_HEADERS=Object.freeze({
    reporter:['填報人員'],
    organization:['面談人員組織'],
    employeeId:['面談人員編號'],
    interviewee:['面談人員'],
    reason:['面談原因'],
    formStatus:['表單狀態'],
    interviewDate:['面談日期'],
    filledDate:['填表日期'],
    closedDate:['結案日期'],
    guidance:['建議與指導'],
    feedback:['同仁回饋']
  });
  const PERSISTED_FIELDS=Object.freeze([
    'reporter','organization','interviewee','reason','formStatus','interviewDate',
    'filledDate','closedDate','guidance','feedback','sourceMonth','quarter'
  ]);

  function text(value){return String(value==null?'':value).replace(/[\u00a0\u3000]/g,' ').trim();}
  function normalizeHeader(value){return text(value).replace(/\s+/g,'');}
  function pad(value){return String(value).padStart(2,'0');}
  function validDate(year,month,day){
    const date=new Date(Date.UTC(year,month-1,day));
    return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
  }
  function normalizeDate(value){
    if(value instanceof Date&&!Number.isNaN(value.getTime())){
      return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`;
    }
    if(typeof value==='number'&&Number.isFinite(value)){
      const epoch=Date.UTC(1899,11,30)+Math.round(value)*86400000;
      const date=new Date(epoch);
      return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;
    }
    const match=text(value).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if(!match)return '';
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    return validDate(year,month,day)?`${year}-${pad(month)}-${pad(day)}`:'';
  }
  function quarterForDate(value){
    const date=normalizeDate(value);if(!date)return '';
    const [year,month]=date.split('-').map(Number);
    return `${year}-Q${Math.ceil(month/3)}`;
  }
  function quarterMonths(quarter){
    const match=text(quarter).match(/^(\d{4})-Q([1-4])$/);
    if(!match)return [];
    const year=Number(match[1]);
    const start=(Number(match[2])-1)*3+1;
    return [0,1,2].map(offset=>`${year}-${pad(start+offset)}`);
  }
  function currentQuarter(value){
    const date=value instanceof Date?value:new Date(value||Date.now());
    if(Number.isNaN(date.getTime()))return '';
    return `${date.getFullYear()}-Q${Math.ceil((date.getMonth()+1)/3)}`;
  }
  function detectHeader(matrix,maxRows=50){
    const rows=Array.isArray(matrix)?matrix:[];
    let best=null;
    for(let rowIndex=0;rowIndex<Math.min(maxRows,rows.length);rowIndex+=1){
      const normalized=(rows[rowIndex]||[]).map(normalizeHeader);
      const map={};
      Object.entries(FIELD_HEADERS).forEach(([field,aliases])=>{
        const accepted=aliases.map(normalizeHeader);
        const index=normalized.findIndex(value=>accepted.includes(value));
        if(index>=0)map[field]=index;
      });
      const count=Object.keys(map).length;
      if(!best||count>best.count)best={rowIndex,map,count};
    }
    return best;
  }
  function persistedRow(raw){
    const out={};PERSISTED_FIELDS.forEach(field=>{out[field]=raw[field]||'';});return out;
  }
  function parseMatrix(matrix){
    const rows=Array.isArray(matrix)?matrix:[];
    const header=detectHeader(rows);
    const missing=Object.keys(FIELD_HEADERS).filter(field=>!header||!Number.isInteger(header.map[field]));
    if(missing.length)return {blocked:true,rows:[],errors:[`缺少必要欄位：${missing.join('、')}`],invalidRows:[],headerRow:-1,employeeIdsDiscarded:0};
    const parsed=[];const invalidRows=[];let employeeIdsDiscarded=0;
    rows.slice(header.rowIndex+1).forEach((cells,index)=>{
      if(!Array.isArray(cells)||!cells.some(value=>text(value)))return;
      const get=field=>cells[header.map[field]];
      const raw={
        reporter:text(get('reporter')),organization:text(get('organization')),
        interviewee:text(get('interviewee')),reason:text(get('reason')),
        formStatus:text(get('formStatus')),interviewDate:normalizeDate(get('interviewDate')),
        filledDate:normalizeDate(get('filledDate')),closedDate:normalizeDate(get('closedDate')),
        guidance:text(get('guidance')),feedback:text(get('feedback'))
      };
      const employeeId=text(get('employeeId'));if(employeeId)employeeIdsDiscarded+=1;
      raw.sourceMonth=raw.interviewDate.slice(0,7);
      raw.quarter=quarterForDate(raw.interviewDate);
      const errors=[];
      if(!raw.organization)errors.push('缺少面談人員組織');
      if(!raw.interviewee)errors.push('缺少面談人員');
      if(!raw.interviewDate)errors.push('面談日期無法辨識');
      if(!raw.reason)errors.push('缺少面談原因');
      if(!raw.formStatus)errors.push('缺少表單狀態');
      ['reporter','organization','interviewee','reason','formStatus'].forEach(field=>{if(raw[field].length>120)errors.push(`${field} 過長`);});
      ['guidance','feedback'].forEach(field=>{if(raw[field].length>2000)errors.push(`${field} 過長`);});
      if(errors.length)invalidRows.push({rowNumber:header.rowIndex+index+2,errors});
      else parsed.push(persistedRow(raw));
    });
    return {blocked:Boolean(invalidRows.length||!parsed.length),rows:invalidRows.length?[]:parsed,errors:invalidRows.length?['存在無效資料列，整批停止']:(!parsed.length?['沒有可匯入的面談紀錄']:[]),invalidRows,headerRow:header.rowIndex,employeeIdsDiscarded};
  }
  function recordKey(row){
    return [row&&row.interviewDate,row&&row.organization,row&&row.interviewee,row&&row.reason].map(text).join('|');
  }
  function personKey(value){return text(value).replace(/\s+/g,'');}
  function quarterProgress(roster,records,quarter){
    const activeQuarter=text(quarter);
    const people=[];const byPerson=new Map();
    (Array.isArray(roster)?roster:[]).forEach(item=>{
      const name=text(item&&item.name);const key=personKey(name);
      if(!key||byPerson.has(key))return;
      const person={name,store:text(item&&item.store),role:text(item&&item.role)};
      byPerson.set(key,person);people.push(person);
    });
    const completed=new Map();const inProgress=new Map();
    (Array.isArray(records)?records:[]).forEach(row=>{
      if(text(row&&row.quarter)!==activeQuarter)return;
      const key=personKey(row&&row.interviewee);if(!key)return;
      const status=text(row&&row.formStatus);
      const target=/已結案|已完成/.test(status)?completed:inProgress;
      if(!target.has(key))target.set(key,row);
    });
    const rows=people.map(person=>{
      const key=personKey(person.name);
      const complete=completed.get(key)||null;
      const pending=complete?null:(inProgress.get(key)||null);
      return {...person,status:complete?'completed':pending?'in_progress':'not_interviewed',record:complete||pending};
    });
    return {
      quarter:activeQuarter,total:rows.length,
      completed:rows.filter(row=>row.status==='completed').length,
      inProgress:rows.filter(row=>row.status==='in_progress').length,
      missing:rows.filter(row=>row.status==='not_interviewed').length,
      rows
    };
  }
  function monthsEnding(endMonth,count=3){
    const match=text(endMonth).match(/^(\d{4})-(\d{2})$/);if(!match)return [];
    const cursor=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,1));const result=[];
    for(let index=0;index<count;index+=1){result.unshift(`${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth()+1)}`);cursor.setUTCMonth(cursor.getUTCMonth()-1);}
    return result;
  }

  return Object.freeze({FIELD_HEADERS,PERSISTED_FIELDS,normalizeHeader,normalizeDate,quarterForDate,quarterMonths,currentQuarter,detectHeader,parseMatrix,persistedRow,recordKey,personKey,quarterProgress,monthsEnding});
});
