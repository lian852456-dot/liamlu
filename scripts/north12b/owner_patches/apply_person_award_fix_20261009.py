#!/usr/bin/env python3
"""Apply and test the personal-award empty-row fix in the active report reader.

Only the personal source reader is changed. Keep existing source validation,
monthly model configuration, fonts, names, rendering and delivery settings.
"""
import argparse
import ast
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile

VERSION = "person-award-empty-row-20261009-v1"
OLD_LOOP = "    for row in range(11, 52):\n"
NEW_LOOP = '''    source_rows = sorted({int(re.search(r"\\d+$", ref).group()) for ref in cells})
    for row in source_rows:
        if row < 11:
            continue
        store = value(cells, shared, "D", row).strip()
        emp_id = value(cells, shared, "F", row).strip()
        name = value(cells, shared, "G", row).strip()
        # Formatted/formula-only rows are not employees. A real employee with
        # zero award amounts still belongs in every output.
        if not any((store, emp_id, name)):
            continue
        if not store or not name:
            raise ValueError(f"PERSON_AWARD_IDENTITY_INCOMPLETE at source row {row}")
'''


def corrected_source(source):
    functions = [n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "build_person_awards_from_source"]
    if len(functions) != 1:
        raise ValueError("PERSON_AWARD_FIX_TARGET_CHANGED: source reader not found")
    fn = functions[0]
    lines = source.splitlines(keepends=True)
    block = "".join(lines[fn.lineno-1:fn.end_lineno])
    if NEW_LOOP in block:
        return source
    if block.count(OLD_LOOP) != 1:
        raise ValueError("PERSON_AWARD_FIX_TARGET_CHANGED: review the active reader before patching")
    for column, variable in (("D", "store"), ("F", "emp_id"), ("G", "name")):
        value = f'value(cells, shared, "{column}", row)'
        if block.count(value) != 1:
            raise ValueError("PERSON_AWARD_FIX_TARGET_CHANGED: unexpected identity mapping")
        block = block.replace(value, variable)
    block = block.replace(OLD_LOOP, NEW_LOOP)
    patched = "".join(lines[:fn.lineno-1]) + block + "".join(lines[fn.end_lineno:])
    compile(patched, "active-awards-reader", "exec")
    return patched


def verify(target):
    with tempfile.TemporaryDirectory(prefix="person-award-tests-") as temp:
        test = Path(temp) / "test_person_award_rows.py"
        test.write_text(TEST_SOURCE, encoding="utf-8")
        env = dict(os.environ, PERSON_AWARDS_SCRIPT=str(target))
        subprocess.run([sys.executable, str(test), "-v"], env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, required=True, help="the update_phone_awards.py actually invoked by this processing run")
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    target = args.target.resolve(strict=True)
    source = target.read_text(encoding="utf-8")
    patched = corrected_source(source)
    if args.verify_only:
        if source != patched:
            raise ValueError("PERSON_AWARD_FIX_NOT_APPLIED")
        verify(target)
        print(VERSION, "verified", hashlib.sha256(target.read_bytes()).hexdigest())
        return
    with tempfile.TemporaryDirectory(prefix="person-award-candidate-") as temp:
        candidate = Path(temp) / "update_phone_awards.py"
        candidate.write_text(patched, encoding="utf-8")
        verify(candidate)
    if args.dry_run:
        print(VERSION, "dry-run passed")
        return
    if patched != source:
        backup = target.with_name(target.name + ".before-person-award-fix-20261009")
        if not backup.exists():
            backup.write_bytes(target.read_bytes())
        temporary = target.with_name(target.name + ".person-award-fix.tmp")
        temporary.write_text(patched, encoding="utf-8")
        temporary.chmod(target.stat().st_mode)
        temporary.replace(target)
    verify(target)
    print(VERSION, "applied", hashlib.sha256(target.read_bytes()).hexdigest())


# The exact synthetic regression tests are embedded below so this private
# correction is usable in a fresh scheduled runtime without any old local path.
TEST_SOURCE = '"""Exercise the actual daily award reader with sparse source worksheet cells."""\nimport importlib.util\nimport os\nimport tempfile\nimport unittest\nfrom pathlib import Path\nfrom unittest.mock import patch\nfrom xml.etree import ElementTree as ET\n\n\nSCRIPT = Path(os.environ["PERSON_AWARDS_SCRIPT"])\nspec = importlib.util.spec_from_file_location("person_awards_runtime", SCRIPT)\nawards = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(awards)\n\n\ndef cell(ref, value):\n    element = ET.Element(awards.q("c"), {"r": ref, "t": "inlineStr"})\n    ET.SubElement(ET.SubElement(element, awards.q("is")), awards.q("t")).text = str(value)\n    return element\n\n\ndef worksheet(records):\n    values = {"I10": "實際總獎金", "J10": "推估獎金", "K10": "排名", "L10": "是否領獎"}\n    for row, record in records.items():\n        values.update({f"{column}{row}": value for column, value in record.items()})\n    return {ref: cell(ref, value) for ref, value in values.items()}\n\n\ndef person(**overrides):\n    return {"D": "台北酒泉", "E": "業代", "F": "TEST001", "G": "測*員", "I": 0, "J": 0, "K": 0, "L": "N", **overrides}\n\n\nclass PersonAwardRowsTest(unittest.TestCase):\n    def read(self, records):\n        with patch.object(awards, "read_first_sheet", return_value=([], worksheet(records))):\n            return awards.build_person_awards_from_source()\n\n    def test_formula_only_blank_row_is_removed_and_zero_award_employee_is_kept(self):\n        people = self.read({11: person(), 51: {"I": 0, "J": 0, "K": 0, "L": ""}})\n        self.assertEqual(len(people), 1)\n        self.assertEqual((people[0]["actual_total"], people[0]["projected"], people[0]["award"]), (0, 0, "N"))\n        self.assertEqual(people[0]["emp_id"], "TEST001")\n\n    def test_whitespace_only_identity_is_removed(self):\n        self.assertEqual(self.read({11: {"D": " \\u3000", "F": "\\u00a0", "G": "\\t", "I": 0}}), [])\n\n    def test_source_roster_can_extend_beyond_old_row_51_limit(self):\n        people = self.read({11: person(), 52: person(F="TEST002", G="另*員", I=100, J=200, K=2, L="Y"), 90: {"I": 0}})\n        self.assertEqual([p["emp_id"] for p in people], ["TEST002", "TEST001"])\n        self.assertEqual((people[0]["actual_total"], people[0]["projected"], people[0]["rank"]), (100, 200, 2))\n\n    def test_partial_identity_is_reported_instead_of_silently_dropped(self):\n        for column in ("D", "G"):\n            with self.subTest(column=column), self.assertRaisesRegex(ValueError, "PERSON_AWARD_IDENTITY_INCOMPLETE at source row 11"):\n                self.read({11: person(**{column: ""})})\n\n    def test_named_employee_without_id_remains_visible(self):\n        self.assertEqual(len(self.read({11: person(F="")})), 1)\n\n    def test_html_and_xlsx_rows_share_the_filtered_people(self):\n        people = self.read({11: person(), 51: {"I": 0, "J": 0}})\n        rows = awards.person_rows_for_xlsx(people, {"header": 1, "blue": 2, "green": 3})\n        self.assertEqual(len(rows), 3)\n        self.assertEqual(rows[2][3][0], "測*員")\n        with tempfile.TemporaryDirectory() as directory:\n            output = Path(directory) / "people.html"\n            awards.write_person_html(people, output)\n            html = output.read_text()\n            self.assertEqual(html.split("<tbody>")[1].count("<tr>"), 1)\n            self.assertIn("測*員", html)\n\n\nif __name__ == "__main__":\n    unittest.main()\n'

if __name__ == "__main__":
    main()
