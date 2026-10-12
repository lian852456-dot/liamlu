"""Isolated regression tests for Y26 workbook price and model mapping.

These tests construct a minimal SpreadsheetML package from XML and use only
the approved October config. They never open or modify a private workbook.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
PRODUCER = ROOT / "docs/ops/google-drive-cloud-source-p0-20260824/runtime-after/update_phone_awards.py"
CONFIG_PATH = ROOT / "config/award-config-2026-10.json"
NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

SPEC = importlib.util.spec_from_file_location("y26_award_mapping_producer", PRODUCER)
assert SPEC and SPEC.loader
producer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = producer
SPEC.loader.exec_module(producer)


def q(tag: str) -> str:
    return f"{{{NS}}}{tag}"


def cell_value(root: ET.Element, ref: str):
    cell = root.find(f".//{q('c')}[@r='{ref}']")
    if cell is None:
        return None
    value = cell.find(q("v"))
    if value is not None:
        try:
            return float(value.text)
        except (TypeError, ValueError):
            return value.text
    inline = cell.find(f"{q('is')}/{q('t')}")
    return inline.text if inline is not None else None


def cell_formula(root: ET.Element, ref: str):
    cell = root.find(f".//{q('c')}[@r='{ref}']")
    formula = cell.find(q("f")) if cell is not None else None
    return formula.text if formula is not None else None


def sheet_row(root: ET.Element, row_number: int) -> ET.Element | None:
    return root.find(f".//{q('row')}[@r='{row_number}']")


def create_synthetic_package(base: Path, *, old_month: bool = True, stale_main_prices: bool = True):
    """Write four tiny XML sheets with stable style and old-month sentinels."""
    (base / "xl/worksheets").mkdir(parents=True)
    (base / "xl/_rels").mkdir(parents=True)
    sheet_names = ["店", "督", "同仁", "台獎機款"]
    workbook = ET.Element(q("workbook"))
    sheets = ET.SubElement(workbook, q("sheets"))
    rels = ET.Element(f"{{{PKG_REL_NS}}}Relationships")
    for index, name in enumerate(sheet_names, start=1):
        ET.SubElement(sheets, q("sheet"), {
            "name": name,
            f"{{{REL_NS}}}id": f"rId{index}",
            "sheetId": str(index),
        })
        ET.SubElement(rels, f"{{{PKG_REL_NS}}}Relationship", {
            "Id": f"rId{index}",
            "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
            "Target": f"worksheets/sheet{index}.xml",
        })
    ET.ElementTree(workbook).write(base / "xl/workbook.xml", encoding="utf-8", xml_declaration=True)
    ET.ElementTree(rels).write(base / "xl/_rels/workbook.xml.rels", encoding="utf-8", xml_declaration=True)

    for sheet_index, name in enumerate(sheet_names, start=1):
        root = ET.Element(q("worksheet"))
        ET.SubElement(root, q("dimension"), {"ref": "A1:AC68" if name == "台獎機款" else "A1:H7"})
        data = ET.SubElement(root, q("sheetData"))
        if name != "台獎機款":
            # Preserve a prior month block. The new config section must append
            # after it and leave these rows' values and styles alone.
            for row_number in range(1, 8):
                row = ET.SubElement(data, q("row"), {"r": str(row_number), "customHeight": "1"})
                for col_number, col in enumerate("ABCDEFGH", start=1):
                    ref = f"{col}{row_number}"
                    cell = ET.SubElement(row, q("c"), {"r": ref, "s": str(100 + row_number)})
                    if row_number == 1:
                        inline = ET.SubElement(cell, q("is"))
                        ET.SubElement(inline, q("t")).text = f"{name} header {col}"
                    elif row_number == 4 and col == "A" and old_month:
                        cell.set("t", "inlineStr")
                        inline = ET.SubElement(cell, q("is"))
                        ET.SubElement(inline, q("t")).text = "2026-09-v1"
                    elif row_number in (5, 6, 7):
                        cell.set("t", "inlineStr")
                        inline = ET.SubElement(cell, q("is"))
                        ET.SubElement(inline, q("t")).text = f"old-{name}-{row_number}-{col}"
                    else:
                        ET.SubElement(cell, q("v")).text = str(row_number * 10 + col_number)
            path = base / f"xl/worksheets/sheet{sheet_index}.xml"
            ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
            continue

        # Main Y26 sheet has the old positional template cells, styles and
        # deliberately stale price formulas so clearing/replacement is tested.
        rows_to_create = sorted(set(range(1, 7)) | set(range(7, 17)) | set(range(17, 33)) | set(range(52, 68)))
        for row_number in rows_to_create:
            row = ET.SubElement(data, q("row"), {"r": str(row_number)})
            for col_number in range(1, 30):
                col = producer.num_to_col(col_number)
                ref = f"{col}{row_number}"
                cell = ET.SubElement(row, q("c"), {"r": ref, "s": str(200 + row_number)})
                if stale_main_prices and row_number in (3, 5, 19, 21, 54, 56) and col in {"F", "G", "H", "J", "K", "L", "N", "O", "P", "R", "S", "T", "V", "W", "X", "Z", "AA", "AB"}:
                    ET.SubElement(cell, q("f")).text = "'舊月'!C4"
                    ET.SubElement(cell, q("v")).text = "9999"
                elif row_number in (1, 17, 52) and col in {"F", "J", "N", "R", "V", "Z"}:
                    cell.set("t", "inlineStr")
                    inline = ET.SubElement(cell, q("is"))
                    ET.SubElement(inline, q("t")).text = f"old-slot-{row_number}-{col}"
        ET.ElementTree(root).write(base / f"xl/worksheets/sheet{sheet_index}.xml", encoding="utf-8", xml_declaration=True)


def read_sheet_root(base: Path, name: str) -> ET.Element:
    return ET.parse(producer.sheet_path_for(base, name)).getroot()


def row_snapshot(root: ET.Element, rows: range) -> dict[int, str | None]:
    return {
        row_number: ET.tostring(sheet_row(root, row_number), encoding="unicode")
        for row_number in rows
    }


class Y26AwardMappingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="y26-award-mapping-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name) / "y26-package"
        self.base.mkdir()
        create_synthetic_package(self.base)
        self.config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        self.apply_config(self.config)

    def apply_config(self, config):
        producer.apply_award_config(copy.deepcopy(config))

    def expanded_config(self, count):
        expanded = copy.deepcopy(self.config)
        current_count = len(expanded["selectedModels"])
        for idx in range(current_count + 1, count + 1):
            name = f"Extra{idx}"
            expanded["selectedModels"].append(name)
            expanded["modelGroups"].append({"modelId": name, "displayName": f"Extra Model {idx}"})
            for rule in expanded["rewardRules"]:
                rule["amounts"][name] = [10, 20, 30] if rule["role"] == "seller" else [10, 20, 30, 40, 50]
            for role in ("manager", "supervisor", "seller"):
                expanded["emptyDeviceRewards"][role][name] = 5
        return expanded

    def names(self, count=None):
        selected = self.config["selectedModels"]
        return selected[:count] if count is not None else list(selected)

    def groups(self, names=None):
        return [{"name": name} for name in (names if names is not None else self.names())]

    def manager(self, name):
        return self.config["rewardRules"][0]["amounts"][name]

    def supervisor(self, name):
        return self.config["rewardRules"][1]["amounts"][name]

    def seller(self, name):
        return self.config["rewardRules"][2]["amounts"][name]

    def empty(self, role, name):
        return self.config["emptyDeviceRewards"][role][name]

    def sheet_bytes(self):
        return {
            name: producer.sheet_path_for(self.base, name).read_bytes()
            for name in ("店", "督", "同仁", "台獎機款")
        }

    def test_october_config_writes_all_160_role_and_empty_device_values(self):
        rows = producer.update_y26_award_mapping(self.base, self.groups())
        self.assertEqual(set(rows), {"manager", "supervisor", "seller"})
        self.assertEqual(set(rows["manager"]), set(self.names()))
        settings_seen = 0
        for role, sheet_name, getter, empty_col in (
            ("manager", "店", self.manager, "H"),
            ("supervisor", "督", self.supervisor, "H"),
            ("seller", "同仁", self.seller, "F"),
        ):
            root = read_sheet_root(self.base, sheet_name)
            starts = rows[role]
            for name in self.names():
                row = starts[name]
                values = getter(name)
                first_col = 3
                self.assertEqual([cell_value(root, f"{producer.num_to_col(first_col + i)}{row}") for i in range(len(values))], values)
                self.assertEqual(cell_value(root, f"{empty_col}{row}"), self.empty(role, name))
                settings_seen += len(values) + 1
        self.assertEqual(settings_seen, 160)

    def test_role_price_tables_are_separate_and_preserve_old_month_regions(self):
        old_rows = {
            sheet_name: row_snapshot(read_sheet_root(self.base, sheet_name), range(1, 8))
            for sheet_name in ("店", "督", "同仁")
        }
        rows = producer.update_y26_award_mapping(self.base, self.groups())
        for sheet_name in ("店", "督", "同仁"):
            self.assertEqual(row_snapshot(read_sheet_root(self.base, sheet_name), range(1, 8)), old_rows[sheet_name])
        name = self.names()[0]
        manager_row = rows["manager"][name]
        supervisor_row = rows["supervisor"][name]
        seller_row = rows["seller"][name]
        self.assertEqual(cell_value(read_sheet_root(self.base, "店"), f"C{manager_row}"), self.manager(name)[0])
        self.assertEqual(cell_value(read_sheet_root(self.base, "督"), f"C{supervisor_row}"), self.supervisor(name)[0])
        self.assertEqual(cell_value(read_sheet_root(self.base, "同仁"), f"C{seller_row}"), self.seller(name)[0])
        self.assertNotEqual(self.manager(name)[0], self.supervisor(name)[0])

    def test_main_mapping_is_keyed_by_model_name_when_groups_are_reordered(self):
        ordered = list(reversed(self.names()))
        rows = producer.update_y26_award_mapping(self.base, self.groups(ordered))
        data = [{
            "store": "北一二B整體",
            "actual_total": 100,
            "projected": 120,
            "rank": 1,
            "award": "Y",
            "items": [{"actual": i + 1, "target": i + 2, "rate": 0.5} for i, _ in enumerate(ordered)],
        } for _ in range(10)]
        producer.update_y26_store_sheet(self.base, self.groups(ordered), data)
        first_name = ordered[0]
        main = read_sheet_root(self.base, "台獎機款")
        self.assertEqual(cell_value(main, "F1"), producer.display_item_name(first_name))
        for role, sheet_name, price_row, source_col, expected_values in (
            ("manager", "店", 3, "C", self.manager(first_name)),
            ("supervisor", "督", 5, "C", self.supervisor(first_name)),
        ):
            source_row = rows[role][first_name]
            for tier, col in enumerate(("F", "G", "H")):
                formula_col = producer.num_to_col(producer.col_to_num(source_col) + tier)
                self.assertEqual(cell_formula(main, f"{col}{price_row}"), f"'{sheet_name}'!{formula_col}{source_row}")
                self.assertEqual(cell_value(main, f"{col}{price_row}"), expected_values[tier])
        self.assertEqual(cell_value(main, "F2"), "50%~79%")
        self.assertEqual(cell_value(main, "F4"), "80%~89%")

    def test_canonical_award_model_accepts_reordered_family_and_approved_aliases(self):
        self.assertEqual(
            producer.canonical_award_model("ZFlip8/ZFold8/ZFold8Ultra"),
            "ZFold8Ultra/ZFold8/ZFlip8",
        )
        self.assertEqual(
            producer.canonical_award_model(" zflip8 / ZFOLD8 / zfold8ultra "),
            "ZFold8Ultra/ZFold8/ZFlip8",
        )
        self.assertEqual(producer.canonical_award_model("A6x/A7Pro"), "A6x6G/128G/A7Pro")

    def test_canonical_award_model_does_not_match_partial_or_different_families(self):
        unrelated = "S26Ultra/ZFold8/ZFold8Ultra"
        self.assertEqual(producer.canonical_award_model(unrelated), unrelated)
        self.assertNotEqual(producer.canonical_award_model(unrelated), "S26Ultra")
        self.assertNotEqual(producer.canonical_award_model(unrelated), "ZFold8Ultra/ZFold8/ZFlip8")

    def test_canonical_award_model_rejects_ambiguous_equal_selected_families(self):
        ambiguous = copy.deepcopy(self.config)
        canonical = ambiguous["selectedModels"][0]
        reordered = "ZFlip8/ZFold8/ZFold8Ultra"
        ambiguous["selectedModels"] = [canonical, reordered]
        for rule in ambiguous["rewardRules"]:
            canonical_amount = copy.deepcopy(rule["amounts"][canonical])
            rule["amounts"] = {canonical: canonical_amount, reordered: copy.deepcopy(canonical_amount)}
        for role in ("manager", "supervisor", "seller"):
            canonical_empty = ambiguous["emptyDeviceRewards"][role][canonical]
            ambiguous["emptyDeviceRewards"][role] = {canonical: canonical_empty, reordered: canonical_empty}
        saved = producer.ACTIVE_AWARD_CONFIG
        try:
            self.apply_config(ambiguous)
            with self.assertRaisesRegex(ValueError, "Ambiguous"):
                producer.canonical_award_model("ZFold8/ZFold8Ultra/ZFlip8")
        finally:
            producer.ACTIVE_AWARD_CONFIG = saved
            producer.apply_award_config(copy.deepcopy(self.config))

    def test_load_central_award_rules_accepts_ten_and_thirteen_models_and_rejects_bad_sets(self):
        for count in (10, 13):
            with self.subTest(model_count=count):
                config = self.config if count == 10 else self.expanded_config(count)
                self.apply_config(config)
                names = list(config["selectedModels"])
                manager, supervisor = producer.load_central_award_rules(self.groups(names))
                self.assertEqual(set(manager), set(names))
                self.assertEqual(set(supervisor), set(names))
                bad_groups = [
                    self.groups(names[:-1]),
                    self.groups(names[:-1] + [names[0]]),
                ]
                for groups in bad_groups:
                    with self.subTest(groups=groups[-1]):
                        with self.assertRaises(ValueError):
                            producer.load_central_award_rules(groups)

    def test_manager_and_supervisor_tiers_use_actual_rate_at_each_threshold(self):
        model = self.names()[0]
        boundaries = (
            ("manager", (0.50, 0.80, 1.00, 1.20, 2.00), producer.manager_award_tier,
             producer.manager_award_for_item, self.manager(model)),
            ("supervisor", (0.80, 0.90, 1.00, 1.20, 2.00), producer.supervisor_award_tier,
             producer.supervisor_award_for_item, self.supervisor(model)),
        )
        for role, thresholds, tier_func, award_func, amounts in boundaries:
            with self.subTest(role=role):
                cases = []
                for idx, boundary in enumerate(thresholds):
                    cases.extend((
                        (boundary - 0.01, None if idx == 0 else idx - 1),
                        (boundary, idx),
                        (boundary + 0.01, idx),
                    ))
                for actual_rate, expected_tier in cases:
                    with self.subTest(actual_rate=actual_rate):
                        # `rate` is the projected rate and deliberately points
                        # to the opposite side of the threshold under test.
                        projected_rate = 2.50 if actual_rate < 2.00 else 0.10
                        item = {
                            "name": model,
                            "actual": 1,
                            "target": 2,
                            "actual_rate": actual_rate,
                            "rate": projected_rate,
                        }
                        self.assertEqual(tier_func(actual_rate), expected_tier)
                        expected_amount = 0 if expected_tier is None else amounts[expected_tier]
                        self.assertEqual(award_func(item), expected_amount)

    def test_ten_model_slots_clear_unused_prices_and_rewrite_via_store_sheet_hook(self):
        names = self.names()
        data = [{
            "store": "北一二B整體",
            "actual_total": 100,
            "projected": 120,
            "rank": 1,
            "award": "Y",
            "items": [{"actual": i + 1, "target": i + 2, "rate": 0.5} for i, _ in enumerate(names)],
        } for _ in range(10)]
        producer.update_y26_store_sheet(self.base, self.groups(), data)
        main = read_sheet_root(self.base, "台獎機款")
        for ref in ("V19", "W19", "X19", "Z19", "AA19", "AB19", "V21", "Z21"):
            self.assertIsNone(cell_formula(main, ref), ref)
            self.assertIsNone(cell_value(main, ref), ref)
        self.assertEqual(cell_value(main, "A7"), "北一二B")
        self.assertEqual(cell_value(main, "F7"), 1)
        self.assertEqual(cell_value(main, "G7"), 2)

    def test_thirteen_models_reach_z_slot_and_third_block(self):
        expanded = self.expanded_config(13)
        self.apply_config(expanded)
        names = expanded["selectedModels"]
        rows = producer.update_y26_award_mapping(self.base, self.groups(names))
        producer.update_y26_store_sheet(self.base, self.groups(names), [])
        main = read_sheet_root(self.base, "台獎機款")
        self.assertEqual(cell_value(main, "Z1"), producer.display_item_name(names[5]))
        self.assertEqual(cell_value(main, "Z17"), producer.display_item_name(names[11]))
        self.assertEqual(cell_value(main, "F52"), producer.display_item_name(names[12]))
        self.assertEqual(cell_formula(main, "F54"), f"'店'!C{rows['manager'][names[12]]}")
        self.assertEqual(cell_value(main, "F54"), 10)
        self.assertEqual(cell_formula(main, "F56"), f"'督'!C{rows['supervisor'][names[12]]}")
        self.assertEqual(cell_value(main, "F56"), 10)
        for ref in ("J54", "N54", "R54", "V54", "Z54", "J56", "Z56"):
            self.assertIsNone(cell_formula(main, ref), ref)
            self.assertIsNone(cell_value(main, ref), ref)

    def test_rejects_incomplete_duplicate_or_missing_config_without_writing(self):
        original = self.sheet_bytes()
        with self.assertRaises(ValueError):
            producer.update_y26_award_mapping(self.base, self.groups(self.names()[:-1]))
        self.assertEqual(self.sheet_bytes(), original)

        duplicate = self.names()[:-1] + [self.names()[0]]
        with self.assertRaises(ValueError):
            producer.update_y26_award_mapping(self.base, self.groups(duplicate))
        self.assertEqual(self.sheet_bytes(), original)

        saved = producer.ACTIVE_AWARD_CONFIG
        try:
            producer.ACTIVE_AWARD_CONFIG = None
            with self.assertRaises(ValueError):
                producer.update_y26_award_mapping(self.base, self.groups())
            self.assertEqual(self.sheet_bytes(), original)
        finally:
            producer.ACTIVE_AWARD_CONFIG = saved

    def test_rejects_duplicate_config_marker_without_partial_sheet_write(self):
        path = producer.sheet_path_for(self.base, "店")
        root = ET.parse(path).getroot()
        data = root.find(q("sheetData"))
        for row_number in (8, 9):
            row = ET.SubElement(data, q("row"), {"r": str(row_number)})
            cell = ET.SubElement(row, q("c"), {"r": f"A{row_number}", "t": "inlineStr"})
            inline = ET.SubElement(cell, q("is"))
            ET.SubElement(inline, q("t")).text = self.config["configVersion"]
        ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
        original = self.sheet_bytes()
        with self.assertRaises(ValueError):
            producer.update_y26_award_mapping(self.base, self.groups())
        self.assertEqual(self.sheet_bytes(), original)

    def test_repeated_run_is_idempotent_and_price_change_reuses_config_section(self):
        first_rows = producer.update_y26_award_mapping(self.base, self.groups())
        first_markers = {}
        for name in ("店", "督", "同仁"):
            root = read_sheet_root(self.base, name)
            first_markers[name] = [
                cell.attrib["r"] for cell in root.findall(f".//{q('c')}")
                if cell.attrib.get("r", "").startswith("A") and
                producer.text_of_cell(cell, []) == self.config["configVersion"]
            ]
        second_rows = producer.update_y26_award_mapping(self.base, self.groups())
        self.assertEqual(first_rows, second_rows)
        for name in ("店", "督", "同仁"):
            root = read_sheet_root(self.base, name)
            markers = [
                cell.attrib["r"] for cell in root.findall(f".//{q('c')}")
                if cell.attrib.get("r", "").startswith("A") and
                producer.text_of_cell(cell, []) == self.config["configVersion"]
            ]
            self.assertEqual(markers, first_markers[name])

        changed = copy.deepcopy(self.config)
        name = self.names()[0]
        changed["rewardRules"][0]["amounts"][name][0] += 111
        self.apply_config(changed)
        self.config = changed
        updated_rows = producer.update_y26_award_mapping(self.base, self.groups())
        self.assertEqual(updated_rows, first_rows)
        self.assertEqual(cell_value(read_sheet_root(self.base, "店"), f"C{first_rows['manager'][name]}"), self.manager(name)[0])
        root = read_sheet_root(self.base, "店")
        markers = [
            cell.attrib["r"] for cell in root.findall(f".//{q('c')}")
            if cell.attrib.get("r", "").startswith("A") and
            producer.text_of_cell(cell, []) == changed["configVersion"]
        ]
        self.assertEqual(markers, first_markers["店"])


if __name__ == "__main__":
    unittest.main()
