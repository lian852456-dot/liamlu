"""Independent source/workbook/PNG completeness gates for the normal entrypoint."""
from copy import deepcopy
from pathlib import Path
import hashlib,importlib.util,json,os,tempfile,unittest
from openpyxl import Workbook,load_workbook
import test_qis_personal as personal_test
qis=personal_test.qis
os.environ.setdefault('REPORT_DATE','2026-10-13')
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('qis_gate_renderer',ROOT/'scripts/north12b/render_xlsx_cjk.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
FONT_DIR=Path(os.environ.get('FONT_DIR',ROOT/'font-assets'))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()

class QisVerification(unittest.TestCase):
    def setUp(self):
        source,_=personal_test.PersonalQisTest().make_source();self.addCleanup(source.unlink,missing_ok=True)
        w=load_workbook(source)
        for row in w['QIS個績']:
            for cell in row:
                if isinstance(cell.value,str) and cell.value.startswith('合成'):cell.value=cell.value.replace('合成','合*')
        w.save(source);w.close()
        roster=personal_test.PersonalQisTest().roster()
        for p in roster['persons']:p['pname']=p['pname'].replace('合成','合*')
        self.personal=qis.extract_personal_qis(source,roster,'2026-10-13')
        w=load_workbook(source,data_only=True);self.values=list(w['QIS個績'].values);w.close()
        self.book=Workbook();self.sheet=self.book.active;self.sheet.title='QIS店績'
        for col,value in enumerate(['店點','達成率','計件數','服務態度','專業能力','原始分數'],1):self.sheet.cell(2,col,value)
        for rn in range(3,13):
            for col,value in enumerate(['合成店',1.5,12,97.72,98.01,97.865],1):self.sheet.cell(rn,col,value)
        self.sheet['A14']='來源：1013.xlsx QIS店績，截至2026-10-13；整體按9店平均。'
        self.sheet['A16']='個人未達98追分｜截至 2026/10/13｜1人'
        rn=18
        for key in ['below98','noData','pending']:
            if key!='below98':rn+=3
            for col,value in enumerate(['店點','同仁','目前分數','計件數','追加100分筆數'],1):self.sheet.cell(rn-1,col,value)
            for p in self.personal[key]:
                score='尚無資料' if key=='noData' else p['current_score'] if p['current_score'] is not None else '待核'
                needed='首筆100即100' if key=='noData' else '待核' if key=='pending' else p['additional_100']
                for col,value in enumerate([p['store'],p['name'],score,p['case_count'] if p['case_count'] is not None else '待核',needed],1):self.sheet.cell(rn,col,value)
                rn+=1
        self.sheet.cell(rn+1,1,self.personal['precisionNote'])
        self.sheet.cell(rn+2,1,'QIS個績共3人：未達98 1人、尚無計件 1人、待核 1人。')
    def verify(self,personal=None):
        qis.verify_personal_qis(personal or self.personal,self.values,self.personal['sourceSha256'],'2026-10-13','2026-10-13',self.sheet)
    def test_complete_low_zero_and_pending_populations_pass(self):self.verify()
    def test_missing_individual_workbook_row_rejected(self):
        self.sheet['B18']=None
        with self.assertRaisesRegex(AssertionError,'DISPLAY_MISMATCH'):self.verify()
    def test_omitted_employee_or_followup_rejected(self):
        for key in ['rows','below98','noData','pending']:
            p=deepcopy(self.personal);p[key].pop()
            with self.subTest(key=key),self.assertRaises(AssertionError):self.verify(p)
    def test_wrong_source_and_personal_cutoff_rejected(self):
        p=deepcopy(self.personal);p['sourceSha256']='f'*64
        with self.assertRaisesRegex(AssertionError,'SOURCE_MISMATCH'):self.verify(p)
        p=deepcopy(self.personal);p['cutoffDate']='2026-10-12'
        with self.assertRaisesRegex(AssertionError,'DATE_MISMATCH'):self.verify(p)
    def test_wrong_n_s_and_nonminimal_added_count_rejected(self):
        for field in ['case_count','current_score','additional_100','source_count_raw','source_score_raw']:
            p=deepcopy(self.personal);v=p['below98'][0][field];p['below98'][0][field]=str(float(v)+1) if isinstance(v,str) else v+1
            with self.subTest(field=field),self.assertRaises(AssertionError):self.verify(p)
    @unittest.skipUnless((FONT_DIR/'NotoSansTC-Bold.ttf').is_file(),'provide FONT_DIR with the existing CJK fonts')
    def test_actual_png_receipt_binds_each_person_code_and_fonts(self):
        renderer.FONT_DIR=FONT_DIR;renderer.FONT_REGULAR=FONT_DIR/'NotoSansTC-Regular.ttf';renderer.FONT_BOLD=FONT_DIR/'NotoSansTC-Bold.ttf'
        with tempfile.TemporaryDirectory() as d:
            png=Path(d)/'qis.png';book=Path(d)/'book.xlsx';self.book.save(book)
            receipt=renderer.render_qis_landscape(self.sheet,self.sheet,png)
            receipt.update(workbookSha256=sha(book),rendererSha256=sha(renderer.__file__),fontSha256={n:sha(FONT_DIR/n) for n in ['NotoSansTC-Regular.ttf','NotoSansTC-Bold.ttf']})
            args=lambda r:qis.verify_personal_qis_render(self.personal,r,png,book,renderer.__file__,FONT_DIR)
            self.assertEqual(args(receipt)['rows'],3)
            for mutation in ['drop','wrong_value','pngSha256','workbookSha256','rendererSha256','fontSha256','dimensions','fontShrinking']:
                r=deepcopy(receipt)
                if mutation=='drop':r['drawnRows'].pop()
                elif mutation=='wrong_value':next(x for x in r['drawnRows'] if x['kind']=='people')['values'][4]=999
                elif mutation=='fontSha256':r[mutation]={}
                elif mutation=='dimensions':r[mutation]=[1,1]
                elif mutation=='fontShrinking':r[mutation]=True
                else:r[mutation]='f'*64
                with self.subTest(mutation=mutation),self.assertRaises(AssertionError):args(r)

if __name__=='__main__':unittest.main()
