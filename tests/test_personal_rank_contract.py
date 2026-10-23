import copy
import importlib.util
import unittest
import tempfile
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("rank_contract", Path(__file__).parents[1] / "scripts/north12b/personal_rank_contract.py")
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)


def fixture():
    rows = [{"employee_id": "SYNTH01", "store": "甲", "role": "店長", "name": "甲*一", "rank": 17, "overall_rate": 1.25},
            {"employee_id": "SYNTH02", "store": "乙", "role": "副店長", "name": "乙*?", "rank": 9, "overall_rate": .8}]
    source = {"source_file": "1023.xlsx", "data_as_of_date": "2026-10-22", "sha256": "a" * 64, "records": rows}
    component = {"report_date": "2026-10-22", "data_as_of_date": "2026-10-22", "source_as_of_date": "2026-10-22", "source_file": "1023.xlsx", "aggregate": {"company_rank": 3}, "personal": [
        {"store": r["store"], "role": r["role"], "name": r["name"].replace("?", "［來源缺字］"), "overall_rate": r["overall_rate"], "rank": None, "rank_dod": None, "overall_rate_dod": None, "metrics": {"AQ": {"actual": 7}}} for r in rows]}
    protected = {"meta": {"sourceFile": "1023.xlsx", "month": "2026-10", "snapshotDay": 22}, "stores": [{"code": "S1", "name": "甲"}, {"code": "S2", "name": "乙"}], "persons": [{"store": "S" + str(i + 1), "pname": r["name"], "role": r["role"], "official": r["overall_rate"]} for i, r in enumerate(rows)]}
    previous = copy.deepcopy(source)
    previous.update(source_file="1022.xlsx", data_as_of_date="2026-10-21", sha256="b" * 64)
    previous["records"][0]["rank"] = 20
    return component, source, protected, previous


class RankContract(unittest.TestCase):
    def test_ooxml_rank_column_cutoff_and_missing_detail_are_checked(self):
        def workbook(path, header='排名', rank='17', sheet=R.SHEET):
            with zipfile.ZipFile(path,'w') as z:
                z.writestr('xl/workbook.xml', '<workbook xmlns="'+R.NS['s']+'" xmlns:r="'+R.REL+'"><sheets><sheet name="'+sheet+'" sheetId="1" r:id="rId1"/></sheets></workbook>')
                z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
                cells={'D5':'2026/10/01 ~ 10/22','I8':header,'B10':'北一二B','C10':'DNB_TEST','D10':'甲','E10':'店長','F10':'SYNTH01','G10':'甲*一','I10':rank,'J10':'1.25'}
                text=''.join('<c r="'+k+'" t="inlineStr"><is><t>'+v+'</t></is></c>' for k,v in cells.items())
                z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="'+R.NS['s']+'"><sheetData><row>'+text+'</row></sheetData></worksheet>')
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'1023.xlsx';workbook(p)
            source=R.read_source(p);self.assertEqual(source['records'][0]['rank'],17)
            self.assertEqual(source['data_as_of_date'],'2026-10-22')
            for options in [{'header':'店排名'},{'rank':'0'},{'sheet':'店績'}]:
                workbook(p,**options)
                with self.assertRaises(ValueError):R.read_source(p)
            wrong=Path(folder)/'1022.xlsx';workbook(wrong)
            with self.assertRaises(ValueError):R.read_source(wrong)

    def test_source_values_and_only_rank_fields_change(self):
        c, s, p, prev = fixture()
        before = copy.deepcopy(c)
        result = R.verified_ranks(c, s, p, prev)
        self.assertEqual(result["personal"][0]["rank"], 17)
        self.assertEqual(result["personal"][0]["rank_dod"], 3)
        self.assertNotIn("personal_semantics", result)
        self.assertEqual(result["personal_rank_semantics"], "individual-rank-v1")
        for original, repaired in zip(c["personal"], result["personal"]):
            for key in original.keys() - {"rank", "rank_dod"}:
                if key == 'name' and '［來源缺字］' in str(original[key]):
                    self.assertEqual(repaired[key], original[key].replace('［來源缺字］','?'))
                else:
                    self.assertEqual(original[key], repaired[key])
        self.assertEqual(c, before)

    def test_missing_rank_and_previous_stay_null(self):
        c, s, p, _ = fixture()
        s["records"][0]["rank"] = None
        result = R.verified_ranks(c, s, p)
        self.assertIsNone(result["personal"][0]["rank"])
        self.assertIsNone(result["personal"][1]["rank_dod"])

    def test_previous_employee_id_survives_store_attribution_move(self):
        c, s, p, prev = fixture()
        prev["records"][0]["store"] = "原店"
        self.assertEqual(R.verified_ranks(c, s, p, prev)["personal"][0]["rank_dod"], 3)

    def test_wrong_source_cutoff_or_protected_rate_rejected(self):
        for mutate in [lambda c, s, p: c.update(source_file="1022.xlsx"),
                       lambda c, s, p: c.update(data_as_of_date="2026-10-21"),
                       lambda c, s, p: p["meta"].update(snapshotDay=21),
                       lambda c, s, p: p["persons"][0].update(official=9),
                       lambda c, s, p: c["personal"][0].update(overall_rate=9)]:
            c, s, p, _ = fixture()
            mutate(c, s, p)
            with self.assertRaises(ValueError):
                R.verified_ranks(c, s, p)

    def test_missing_duplicate_foreign_or_wrong_role_person_rejected(self):
        for mutate in [lambda c: c["personal"].pop(),
                       lambda c: c["personal"].append(copy.deepcopy(c["personal"][0])),
                       lambda c: c["personal"][0].update(store="別店"),
                       lambda c: c["personal"][0].update(role="業代"),
                       lambda c: c["personal"][0].update(name="另一人")]:
            c, s, p, _ = fixture()
            mutate(c)
            with self.assertRaises(ValueError):
                R.verified_ranks(c, s, p)

    def test_annotation_canonicalization_does_not_guess_or_edit_name(self):
        c, s, p, _ = fixture()
        result = R.verified_ranks(c, s, p)
        self.assertEqual(result["personal"][1]["name"], "乙*?")
        s["records"][1]["name"] = "乙*人"
        with self.assertRaises(ValueError):
            R.verified_ranks(c, s, p)

    def test_same_masked_person_key_across_roles_is_ambiguous(self):
        c, s, p, _ = fixture()
        duplicate=copy.deepcopy(s['records'][0]);duplicate.update(role='副店長',employee_id='SYNTH03')
        s['records'].append(duplicate)
        with self.assertRaises(ValueError):R.verified_ranks(c,s,p)

    def test_invalid_rank_and_previous_identity_rejected(self):
        for invalid in [True, 0, -1, 1.5, float("nan"), "文字"]:
            c, s, p, _ = fixture()
            s["records"][0]["rank"] = invalid
            with self.assertRaises(ValueError):
                R.verified_ranks(c, s, p)
        c, s, p, prev = fixture()
        prev["records"][0]["name"] = "另一人"
        with self.assertRaises(ValueError):
            R.verified_ranks(c, s, p, prev)


if __name__ == "__main__":
    unittest.main()
