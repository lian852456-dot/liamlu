#!/usr/bin/env python3
"""Regression tests for source identity only; no Excel parsing or production output writes."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import Workbook


SCRIPT = Path(__file__).with_name("update_phone_awards.py")
STORE = "01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金 7.xlsx"
PERSON = "01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金 7.xlsx"


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class AwardsSourceFreshnessTest(unittest.TestCase):
    @staticmethod
    def write_workbook(path: Path, sheet: str, cells: dict[str, str]) -> None:
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = sheet
        for cell, value in cells.items():
            worksheet[cell] = value
        workbook.save(path)

    def prepare(self, root: Path, *, store_content=b"store-new", person_content=b"person-new", mtime="2026-08-24T09:00:00+08:00"):
        origin = root / "onedrive"
        logs = root / "logs"
        origin.mkdir()
        logs.mkdir()
        store = origin / STORE
        person = origin / PERSON
        self.write_workbook(
            store,
            "上線數KPI_店點達成率_明細",
            {"H6": "2026/08/01 ~ 08/23", "A1": store_content.decode("ascii")},
        )
        self.write_workbook(
            person,
            "手機競賽_個人達成率",
            {"D6": "2026/08/01 ~ 08/23", "A1": person_content.decode("ascii")},
        )
        kpi = root / "0824.xlsx"
        self.write_workbook(
            kpi,
            "上線數KPI_達成率",
            {"D6": "2026/08/01 ~ 08/23", "C10": "2026/08/01 ~ 08/23", "C57": "2026/08/01 ~ 08/23"},
        )
        timestamp = datetime.fromisoformat(mtime).timestamp()
        os.utime(store, (timestamp, timestamp))
        os.utime(person, (timestamp, timestamp))
        return origin, logs, store, person, kpi

    def run_gate(self, origin: Path, logs: Path, kpi: Path):
        env = {
            **os.environ,
            "REPORT_DATE_ISO": "2026-08-24",
            "REPORT_RUN_ID": "freshness-test-run",
            "PHONE_AWARDS_ORIGIN_DIR": str(origin),
            "PHONE_AWARDS_SOURCE_MODE": "local-emergency",
            "PHONE_AWARDS_LOCAL_EMERGENCY_ENABLED": "1",
            "PHONE_AWARDS_LOG_DIR": str(logs),
            "REPORT_KPI_SOURCE": str(kpi),
            "PHONE_AWARDS_VERIFY_SOURCE_ONLY": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        return subprocess.run([sys.executable, str(SCRIPT)], env=env, text=True, capture_output=True, check=False)

    def test_new_pair_passes_and_records_both_identities(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, store, person, kpi = self.prepare(Path(raw))
            (logs / "run-manifest-20260823.json").write_text(json.dumps({
                "runId": "prior-run", "sourceHashes": {"store": "0" * 64, "person": "1" * 64},
            }), encoding="utf-8")
            result = self.run_gate(origin, logs, kpi)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "fresh")
            self.assertEqual(payload["source_identity"]["store"]["sha256"], sha256(store.read_bytes()))
            self.assertEqual(payload["source_identity"]["person"]["sha256"], sha256(person.read_bytes()))
            self.assertEqual(payload["source_identity"]["store"]["canonical_basename"], STORE.rsplit(" ", 1)[0] + ".xlsx")

    def test_prior_hash_pair_blocks_even_when_filenames_and_mtime_are_new(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, store, person, kpi = self.prepare(Path(raw))
            (logs / "run-manifest-20260823.json").write_text(json.dumps({
                "runId": "prior-run",
                "sourceHashes": {"store": sha256(store.read_bytes()), "person": sha256(person.read_bytes())},
            }), encoding="utf-8")
            result = self.run_gate(origin, logs, kpi)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("SHA-256", result.stderr)

    def test_older_sync_mtime_is_recorded_but_does_not_replace_business_date_validation(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, _, _, kpi = self.prepare(Path(raw), mtime="2026-08-23T09:00:00+08:00")
            result = self.run_gate(origin, logs, kpi)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["source_identity"]["store"]["mtime"], "2026-08-23T09:00:00+08:00")

    def test_verified_business_date_beats_newer_local_mtime(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, _, _, kpi = self.prepare(Path(raw), mtime="2026-08-23T09:00:00+08:00")
            stale_store = origin / STORE.replace(" 7.xlsx", " 8.xlsx")
            stale_person = origin / PERSON.replace(" 7.xlsx", " 8.xlsx")
            self.write_workbook(
                stale_store,
                "上線數KPI_店點達成率_明細",
                {"H6": "2026/08/01 ~ 08/22"},
            )
            self.write_workbook(
                stale_person,
                "手機競賽_個人達成率",
                {"D6": "2026/08/01 ~ 08/22"},
            )
            newer = datetime.fromisoformat("2026-08-24T09:00:00+08:00").timestamp()
            os.utime(stale_store, (newer, newer))
            os.utime(stale_person, (newer, newer))
            result = self.run_gate(origin, logs, kpi)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["source_identity"]["store"]["basename"], STORE)
            self.assertEqual(payload["source_identity"]["person"]["basename"], PERSON)

    def test_missing_person_source_blocks(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, _, person, kpi = self.prepare(Path(raw))
            person.unlink()
            result = self.run_gate(origin, logs, kpi)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("缺少", result.stderr)


if __name__ == "__main__":
    unittest.main()
