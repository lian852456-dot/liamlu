#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.dont_write_bytecode = True

WORK_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(WORK_DIR))

# This focused data-contract test does not read Excel or render images. Keep its
# imports isolated from optional local runtime dependencies.
openpyxl = types.ModuleType("openpyxl")
openpyxl.load_workbook = lambda *args, **kwargs: None
sys.modules.setdefault("openpyxl", openpyxl)
pil = types.ModuleType("PIL")
for name in ("Image", "ImageDraw", "ImageFont"):
    module = types.ModuleType(f"PIL.{name}")
    setattr(pil, name, module)
    sys.modules.setdefault(f"PIL.{name}", module)
sys.modules.setdefault("PIL", pil)

from build_github_pages_data import (  # noqa: E402
    canonical_input_source_file,
    extract_phone_awards,
    extract_phone_awards_battle,
)


class AwardsSourceFileTest(unittest.TestCase):
    @staticmethod
    def date_provenance(sheet: str, cell: str, date_range: str) -> dict:
        return {
            "sheet": sheet,
            "value_kind": "literal-string",
            "cells": [{
                "cell": cell,
                "formula": None,
                "formula_layer_value": date_range,
                "cached_value": date_range,
                "display_value": date_range,
                "number_format": "General",
            }],
        }

    def source_summary(self) -> dict:
        run_id = "awards-20260824-store-person"
        date_range = "2026/08/01 ~ 08/23"
        store_provenance = self.date_provenance("上線數KPI_店點達成率_明細", "H6", date_range)
        person_provenance = self.date_provenance("手機競賽_個人達成率", "D6", date_range)
        return {
            "run_id": run_id,
            "report_run_date": "2026-08-24",
            "source_freshness": {"status": "fresh"},
            "source_identity": {
                "store": {
                    "provider": "onedrive-cloud",
                    "driveItemId": "store-drive-item-id",
                    "basename": "01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx",
                    "canonical_basename": "01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx",
                    "lastModifiedDateTime": "2026-08-24T01:00:00Z",
                    "eTag": "store-etag-v2",
                    "size": 123456,
                    "sha256": "a" * 64,
                    "staged_sha256": "a" * 64,
                    "mtime": "2026-08-24T09:00:00+08:00",
                    "run_id": run_id,
                    "source_date_range": date_range,
                    "source_data_date": "2026-08-23",
                    "date_provenance": store_provenance,
                },
                "person": {
                    "provider": "onedrive-cloud",
                    "driveItemId": "person-drive-item-id",
                    "basename": "01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx",
                    "canonical_basename": "01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx",
                    "lastModifiedDateTime": "2026-08-24T01:00:01Z",
                    "eTag": "person-etag-v2",
                    "size": 234567,
                    "sha256": "b" * 64,
                    "staged_sha256": "b" * 64,
                    "mtime": "2026-08-24T09:00:01+08:00",
                    "run_id": run_id,
                    "source_date_range": date_range,
                    "source_data_date": "2026-08-23",
                    "date_provenance": person_provenance,
                },
            },
            "source_batch": {
                "schema_version": "north12b-source-batch/v1",
                "report_run_date": "2026-08-24",
                "data_cutoff_date": "2026-08-23",
                "batch_id": "c" * 64,
                "kpi": {
                    "sha256": "d" * 64,
                    "source_data_date": "2026-08-23",
                    "date_provenance": {"value_kind": "literal-string"},
                },
                "awards": {
                    "store": {"sha256": "a" * 64, "source_data_date": "2026-08-23", "date_provenance": store_provenance},
                    "person": {"sha256": "b" * 64, "source_data_date": "2026-08-23", "date_provenance": person_provenance},
                },
            },
            "store_progress": [],
        }

    def test_temp_awards_outputs_keep_independent_source_identities(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            summary_path = root / "phone_awards_update_summary.json"
            summary_path.write_text(json.dumps(self.source_summary()), encoding="utf-8")
            source_file = canonical_input_source_file({
                "source_path": "/private/input/0822.xlsx",
                "source_file": "ignored.xlsx",
            })
            phone = extract_phone_awards(summary_path, "2026-08-24", "2026-08-23")
            battle = extract_phone_awards_battle(summary_path, "2026-08-24", "2026-08-23")
            output_path = root / "phone-awards-battle-latest.json"
            output_path.write_text(json.dumps(battle), encoding="utf-8")

            self.assertEqual(source_file, "0822.xlsx")
            self.assertNotIn("source_file", phone)
            self.assertEqual(phone["data_as_of_date"], "2026-08-23")
            self.assertEqual(phone["source_files"]["store"]["basename"], "01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx")
            self.assertEqual(json.loads(output_path.read_text(encoding="utf-8"))["source_files"]["person"]["basename"], "01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx")
            with self.assertRaisesRegex(RuntimeError, "canonical source_path/source_file"):
                canonical_input_source_file({})
            with self.assertRaisesRegex(RuntimeError, "canonical source_path/source_file"):
                canonical_input_source_file({"source_path": "/private/input"})

    def test_missing_award_source_identity_blocks_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "phone_awards_update_summary.json"
            summary_path.write_text(json.dumps({"store_progress": []}), encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "source_identity"):
                extract_phone_awards_battle(summary_path, "2026-08-24", "2026-08-23")


if __name__ == "__main__":
    unittest.main()
