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


SCRIPT = Path(__file__).with_name("update_phone_awards.py")
STORE = "01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金 7.xlsx"
PERSON = "01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金 7.xlsx"


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class AwardsSourceFreshnessTest(unittest.TestCase):
    def prepare(self, root: Path, *, store_content=b"store-new", person_content=b"person-new", mtime="2026-08-24T09:00:00+08:00"):
        origin = root / "onedrive"
        logs = root / "logs"
        origin.mkdir()
        logs.mkdir()
        store = origin / STORE
        person = origin / PERSON
        store.write_bytes(store_content)
        person.write_bytes(person_content)
        timestamp = datetime.fromisoformat(mtime).timestamp()
        os.utime(store, (timestamp, timestamp))
        os.utime(person, (timestamp, timestamp))
        return origin, logs, store, person

    def run_gate(self, origin: Path, logs: Path):
        env = {
            **os.environ,
            "REPORT_DATE_ISO": "2026-08-24",
            "REPORT_RUN_ID": "freshness-test-run",
            "PHONE_AWARDS_ORIGIN_DIR": str(origin),
            "PHONE_AWARDS_LOG_DIR": str(logs),
            "PHONE_AWARDS_VERIFY_SOURCE_ONLY": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        return subprocess.run([sys.executable, str(SCRIPT)], env=env, text=True, capture_output=True, check=False)

    def test_new_pair_passes_and_records_both_identities(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, store, person = self.prepare(Path(raw))
            (logs / "run-manifest-20260823.json").write_text(json.dumps({
                "runId": "prior-run", "sourceHashes": {"store": "0" * 64, "person": "1" * 64},
            }), encoding="utf-8")
            result = self.run_gate(origin, logs)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "fresh")
            self.assertEqual(payload["source_identity"]["store"]["sha256"], sha256(store.read_bytes()))
            self.assertEqual(payload["source_identity"]["person"]["sha256"], sha256(person.read_bytes()))
            self.assertEqual(payload["source_identity"]["store"]["canonical_basename"], STORE.rsplit(" ", 1)[0] + ".xlsx")

    def test_prior_hash_pair_blocks_even_when_filenames_and_mtime_are_new(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, store, person = self.prepare(Path(raw))
            (logs / "run-manifest-20260823.json").write_text(json.dumps({
                "runId": "prior-run",
                "sourceHashes": {"store": sha256(store.read_bytes()), "person": sha256(person.read_bytes())},
            }), encoding="utf-8")
            result = self.run_gate(origin, logs)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("SHA-256", result.stderr)

    def test_yesterday_original_mtime_blocks_even_with_new_staging_independent_of_filename(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, _, _ = self.prepare(Path(raw), mtime="2026-08-23T09:00:00+08:00")
            result = self.run_gate(origin, logs)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("mtime", result.stderr)

    def test_missing_person_source_blocks(self):
        with tempfile.TemporaryDirectory() as raw:
            origin, logs, _, person = self.prepare(Path(raw))
            person.unlink()
            result = self.run_gate(origin, logs)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("缺少", result.stderr)


if __name__ == "__main__":
    unittest.main()
