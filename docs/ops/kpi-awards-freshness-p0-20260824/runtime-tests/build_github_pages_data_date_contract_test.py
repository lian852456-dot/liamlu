#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
ACTUAL_WORK_DIR = Path("/Users/liamlu/Downloads/liam-agent/report-automation/work")
PROJECT_ROOT = Path("/Users/liamlu/Downloads/liam-agent")
sys.path.insert(0, str(ACTUAL_WORK_DIR))
sys.path.insert(0, str(SCRIPT_DIR))

from build_github_pages_data import canonical_input_source_file, resolve_date_contract  # noqa: E402


class DateContractTest(unittest.TestCase):
    def test_run_date_and_cutoff_date_are_separate(self) -> None:
        report = {
            "report_date_iso": "2026-08-22",
            "source_date_range": "2026/08/01 ~ 08/21",
        }
        report_run_date, data_cutoff_date = resolve_date_contract(
            report,
            "2026-08-22",
            "2026-08-21",
        )
        self.assertEqual(report_run_date.isoformat(), "2026-08-22")
        self.assertEqual(data_cutoff_date.isoformat(), "2026-08-21")

    def test_filename_is_not_accepted_as_formal_data_date(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "source_date_range"):
            resolve_date_contract({
                "report_date_iso": "2026-08-22",
                "source_date_range": "0822.xlsx",
            })

    def test_awards_source_file_uses_canonical_input_path_and_never_falls_back(self) -> None:
        self.assertEqual(
            canonical_input_source_file({
                "source_path": "/private/input/0822.xlsx",
                "source_file": "wrong.xlsx",
            }),
            "0822.xlsx",
        )
        self.assertEqual(canonical_input_source_file({"source_file": "0822.xlsx"}), "0822.xlsx")
        with self.assertRaisesRegex(RuntimeError, "canonical source_path/source_file"):
            canonical_input_source_file({})

    def test_current_0822_artifacts_build_0821_snapshots(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            site_data = root / "data"
            private_data = root / "private-data"
            source_dir = root / "source"
            outputs_dir = root / "outputs"
            source_dir.mkdir()
            outputs_dir.mkdir()
            shutil.copy2(
                PROJECT_ROOT / "report-automation/input/google-drive/0822.xlsx",
                source_dir / "0822.xlsx",
            )
            fixture_path = root / "today_report_data.json"
            fixture = json.loads((ACTUAL_WORK_DIR / "report_data_2026-08-22.json").read_text(encoding="utf-8"))
            fixture.update({
                "report_date_iso": "2026-08-22",
                "source_path": str(PROJECT_ROOT / "report-automation/input/google-drive/0822.xlsx"),
                "source_file": "0822.xlsx",
                "source_date_range": "2026/08/01 ~ 08/21",
            })
            fixture_path.write_text(json.dumps(fixture), encoding="utf-8")
            # The builder only accepts immutable award source identity.  Keep
            # this fixture entirely temporary; today's real summary must never
            # be used to prove a historical D+1 date contract.
            award_summary = json.loads(
                (PROJECT_ROOT / "report-automation/outputs/phone_awards_update_summary.json").read_text(encoding="utf-8")
            )
            award_summary.update({
                "run_id": "fixture-20260822-awards",
                "report_run_date": "2026-08-22",
                "source_freshness": {"status": "fresh"},
                "source_identity": {
                    "store": {
                        "canonical_basename": "01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx",
                        "sha256": "a" * 64,
                        "mtime": "2026-08-21T09:40:28+08:00",
                        "run_id": "fixture-20260822-awards",
                    },
                    "person": {
                        "canonical_basename": "01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx",
                        "sha256": "b" * 64,
                        "mtime": "2026-08-21T09:40:56+08:00",
                        "run_id": "fixture-20260822-awards",
                    },
                },
            })
            (outputs_dir / "phone_awards_update_summary.json").write_text(
                json.dumps(award_summary), encoding="utf-8"
            )
            command = [
                sys.executable,
                str(SCRIPT_DIR / "build_github_pages_data.py"),
                "--source-dir", str(source_dir),
                "--outputs-dir", str(outputs_dir),
                "--site-data-dir", str(site_data),
                "--today-report-path", str(fixture_path),
                "--private-kpi-output", str(private_data / "kpi-battle-latest.json"),
                "--report-run-date", "2026-08-22",
                "--data-cutoff-date", "2026-08-21",
            ]
            subprocess.run(command, check=True, capture_output=True, text=True)
            kpi = json.loads((private_data / "kpi-battle-latest.json").read_text(encoding="utf-8"))
            awards = json.loads((private_data / "phone-awards-battle-latest.json").read_text(encoding="utf-8"))
            self.assertEqual(kpi["report_run_date"], "2026-08-22")
            self.assertEqual(kpi["report_date"], "2026-08-21")
            self.assertEqual(kpi["data_as_of_date"], "2026-08-21")
            self.assertEqual(kpi["source_file"], "0822.xlsx")
            self.assertEqual(awards["report_run_date"], "2026-08-22")
            self.assertEqual(awards["report_date"], "2026-08-21")
            self.assertNotIn("source_file", awards)
            self.assertEqual(
                awards["source_files"]["store"]["basename"],
                "01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx",
            )
            self.assertEqual(
                awards["source_files"]["person"]["basename"],
                "01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx",
            )
            self.assertEqual(awards["phone_items"], 13)
            self.assertEqual(awards["store_rows"], 10)


if __name__ == "__main__":
    unittest.main()
