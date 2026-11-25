import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSubject, formatAnswer} from '../nori-tradein.mjs';

const stores = ['三創','通化'].map(store=>({store,actual_units:2}));
function source(people) {
  return {month:'2026-11',source_period:{start:'2026-11-01'},source_cutoff_date:'2026-11-20',
    people, stores, summary:{actual_units:4}};
}
const person = {store:'三創',masked_name:'林＊晴',actual_units:2};

test('自然問句、遮罩、門市、全區與未指定對象',()=>{
  for(const text of ['林小晴目前舊換新筆數','請問林小晴的舊換新有幾筆？','林＊晴舊換新','林小晴舊換新還差幾台']) {
    assert.equal(parseSubject(text).masked,person.masked_name,text);
  }
  assert.deepEqual(parseSubject('三創林小晴舊換新筆數'),{store:'三創',masked:person.masked_name});
  assert.deepEqual(parseSubject('通化店舊換新幾台'),{store:'通化'});
  assert.deepEqual(parseSubject('北一二B舊換新筆數'),{area:true});
  assert.ok(parseSubject('我們店舊換新還差幾台').prompt);
  for(const q of ['上個月回收幾台','今天舊換新筆數','11/20舊換新'])assert.ok(parseSubject(q).message);
});
test('來源列為單位，保留截止日、零件及未知值',()=>{
  const q=parseSubject('林小晴舊換新筆數');
  assert.match(formatAnswer(source([person]),q).message,/三創「林＊晴」本月舊換新累計 2 台。月目標 3 台，尚差 1 台。.*2026-11-20/);
  assert.match(formatAnswer(source([{...person,actual_units:0}]),q).message,/累計 0 台/);
  assert.match(formatAnswer(source([{...person,actual_units:null}]),q).message,/尚未提供/);
  assert.match(formatAnswer(source([]),q).message,/查無/);
});
test('跨店同遮罩可追問，同店重名不猜人',()=>{
  const q=parseSubject('林小晴舊換新筆數');
  const both=source([person,{...person,store:'通化',actual_units:0}]);
  const result=formatAnswer(both,q);
  assert.equal(result.choices.length,2);
  assert.match(formatAnswer(both,result.choices[1]).message,/通化.*累計 0 台/);
  assert.deepEqual(formatAnswer(source([person,person]),q).choices,[]);
});
