const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const code=fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../patrol.html'),'utf8');

test('面談讀寫只走受保護 POST action 並納入巡店 session 錯誤格式',()=>{
  assert.match(code,/action === 'interview_read'\) result = supervisorInterviewReadPayload_/);
  assert.match(code,/action === 'interview_write'\) result = supervisorInterviewWritePayload_/);
  assert.match(code,/ptRequireSession_\(body\.token, 'interview_read'\)/);
  assert.match(code,/ptRequireSession_\(body\.token, 'interview_write'\)/);
  assert.match(code,/const patrolActions = \[[^\]]*'interview_read'[^\]]*'interview_write'/);
  assert.match(html,/action==='interview_read'\|\|action==='interview_write'/);
});

test('面談資料使用獨立工作表，拒收員編並以季度隔離',()=>{
  assert.match(code,/SUPERVISOR_INTERVIEW_SHEET = '督導面談紀錄'/);
  assert.doesNotMatch(code,/SUPERVISOR_INTERVIEW_CLIENT_FIELDS = \[[\s\S]{0,240}employeeId/);
  assert.match(code,/面談資料含不允許欄位/);
  assert.match(code,/row\.quarter !== currentQuarter/);
  assert.match(code,/existing\[index\]\.quarter !== currentQuarter\) sheet\.deleteRow/);
});

test('名冊沿用私有班表且前端新季度歸零由純模型負責',()=>{
  assert.match(code,/const schedule = readSchedule\(supervisorInterviewCurrentMonth_\(\)\)/);
  assert.match(html,/新季度會自動全部重設為尚未面談/);
  assert.match(html,/SupervisorInterviewModel\.quarterProgress/);
  assert.match(html,/雲端儲存並讀回完成/);
});
