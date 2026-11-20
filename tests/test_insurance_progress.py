import copy, json, sys, tempfile, unittest
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/north12b'))
from insurance_progress import extract_progress, SHEET
class Progress(unittest.TestCase):
 def source(self):
  rows=[[None]*8 for _ in range(16)];rows[0][0]='手機保險 KPI 進度達成率';rows[12][7]='手機保險搭售率';rows[14]=['DNB-SYNTHETIC','台灣大哥大數位生活台北三創',99,99,99,99,.9,.4]
  return {SHEET:{'values':rows},SHEET+' _個人':{'values':[['統計期間：2099/10/01～2099/10/01']]}}
 def extract(self,b,sha='a'*64):return extract_progress(b,[{'code':'DNB-SYNTHETIC','name':'台北三創'}],'SYNTHETIC.xlsx',sha,'2099-10-02')
 def test_unproven_period_never_inherits_personal(self):
  s=self.extract(self.source());self.assertEqual(s['rows'][0]['rate'],.4);self.assertEqual(s['status'],'pending');self.assertIsNone(s['cutoff'])
 def test_period_publication_correction_retry(self):
  b=self.source();b[SHEET]['values'][1][0]='統計期間：2099/10/01～2099/10/01';s=self.extract(b);self.assertEqual(s['status'],'verified');self.assertEqual(s['cutoff'],'2099-10-01');self.assertEqual(s,self.extract(b));self.assertNotEqual(s['version'],self.extract(b,'b'*64)['version'])
 def test_missing_zero_headers_and_aliases(self):
  for value,expected in [(None,None),('',None),('0.5',None),('未知',None),(0,0),('49.999%',.49999),(-1,None),(True,None)]:
   b=self.source();b[SHEET]['values'][14][7]=value;self.assertAlmostEqual(self.extract(b)['rows'][0]['rate'],expected) if expected is not None else self.assertIsNone(self.extract(b)['rows'][0]['rate'])
  b=self.source();b[SHEET]['values'][12][7]='進度達成率';self.assertIsNone(self.extract(b)['rows'][0]['rate'])
  b=self.source();b[SHEET]['values'][14][1]='合成其他店';self.assertIsNone(self.extract(b)['rows'][0]['rate'])
 def test_ambiguous_period_duplicates_future_stay_pending(self):
  for text in ['統計期間：2099/09/01～2099/10/01','統計期間：2099/10/01～2099/10/03']:
   b=self.source();b[SHEET]['values'][1][0]=text;self.assertEqual(self.extract(b)['status'],'pending')
  b=self.source();b[SHEET]['values'].append(b[SHEET]['values'][14]);self.assertIsNone(self.extract(b)['rows'][0]['rate'])


class PersonalProgress(unittest.TestCase):
 def test_separate_private_artifacts_and_extraction_failure_intent(self):
  from insurance_progress import write_private_publication_artifacts
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);kpi=root/'kpicalc-1002-corrected.json';kpi.write_text('{"SYNTHETIC_KPI":"unchanged"}')
   intent=write_private_publication_artifacts(root,{},[],[],'1002.xlsx','a'*64,'2099-10-02')
   self.assertEqual(intent['outcome'],'complete');self.assertEqual(kpi.read_text(),'{"SYNTHETIC_KPI":"unchanged"}')
   for file in root.glob('insurance-*.json'): self.assertEqual(file.stat().st_mode & 0o777,0o600)
   old=(root/intent['payloadFile']).read_bytes()
   with patch('insurance_progress.private_publication_payload',side_effect=ValueError('SYNTHETIC_PARSE_FAILURE')):
    failed=write_private_publication_artifacts(root,{},[],[],'1002.xlsx','b'*64,'2099-10-02')
   self.assertEqual(failed['outcome'],'failed');self.assertIsNone(failed['payloadFile']);self.assertIsNone(failed['payloadSha256'])
   self.assertEqual((root/intent['payloadFile']).read_bytes(),old)
   self.assertEqual(json.loads((root/'insurance-publish-1002.json').read_text()),failed)

 def test_personal_period_independent_identity_and_column(self):
  from insurance_progress import extract_consultation_source, PERSONAL_SHEET
  rows=[[None]*13 for _ in range(7)];rows[0][0]='手機保險 KPI 進度達成率';rows[2][3]='2099/10/01 ~ 10/01';rows[4][12]='手機保險搭售率';rows[6]=['北一二區','北一二B','SYNTH_STORE','台北三創','合成角色','SYNTH_EMP','合*成',0,0,0,0,.9,.42857]
  book={PERSONAL_SHEET:{'values':rows}};stores=[{'code':'SYNTH_STORE','name':'台北三創'}];people=[{'employee_id':'SYNTH_EMP','store':'SYNTH_STORE','pname':'合*成'}]
  s=extract_consultation_source(book,stores,people,'SYNTHETIC.xlsx','a'*64,'2099-10-02');self.assertEqual(s['personal']['status'],'verified');self.assertEqual(s['personal']['cutoff'],'2099-10-01');self.assertEqual(s['personal']['rows'][0]['rate'],.42857);self.assertEqual(s['stores']['status'],'pending');self.assertIsNone(s['stores']['cutoff'])
  rows[6][2]='OTHER_STORE';s=extract_consultation_source(book,stores,people,'SYNTHETIC.xlsx','a'*64,'2099-10-02');self.assertIsNone(s['personal']['rows'][0]['rate']);self.assertEqual(s['personal']['rows'][0]['identityStatus'],'pending')

if __name__ == "__main__":
    unittest.main()
