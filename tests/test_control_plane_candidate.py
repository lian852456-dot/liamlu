import importlib.util
import json
import tempfile
import tomllib
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/north12b/prepare_control_plane_candidate.py"
SPEC = importlib.util.spec_from_file_location("control_candidate", MODULE_PATH)
candidate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(candidate)


def automation(identifier, hour, minute, recipient):
    return f'''version = 1
id = "{identifier}"
kind = "cron"
name = "synthetic"
prompt = "Run with existing recipient {recipient}; preserve this exact prompt."
status = "ACTIVE"
rrule = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR={hour};BYMINUTE={minute};BYSECOND=0"
model = "synthetic-model"
reasoning_effort = "medium"
notification_policy = "failed_runs_only"
execution_environment = "local"
target = {{ type = "project", project_id = "local-a9c76003bdec9b55baf2c9737e2a842f" }}
cwds = ["/synthetic/workspace"]
created_at = 100
updated_at = 200
'''


RUNBOOK = "# Synthetic\n\nStep 5 says 每日戰報 9 個 direct attachments and 台獎信.\n"


class ControlPlaneCandidateTests(unittest.TestCase):
    def setUp(self):
        self.b2 = automation("b-2", 9, 45, "owner@example.invalid")
        self.b10 = automation("b-10-00", 10, 0, "owner@example.invalid")

    def build(self, b2=None, b10=None, runbook=None):
        return candidate.build_candidates(b2 or self.b2, b10 or self.b10, runbook or RUNBOOK)

    def test_only_prompt_changes_and_all_timing_owner_fields_are_preserved(self):
        result = self.build()
        for name, before in (("b-2.candidate.toml", self.b2), ("b-10-00.candidate.toml", self.b10)):
            old = tomllib.loads(before)
            new = tomllib.loads(result[name])
            self.assertEqual(old["prompt"], new["prompt"][:len(old["prompt"])])
            self.assertIn("owner@example.invalid", new["prompt"])
            self.assertEqual({k: v for k, v in old.items() if k != "prompt"},
                             {k: v for k, v in new.items() if k != "prompt"})
        self.assertIn("13 件", tomllib.loads(result["b-2.candidate.toml"])["prompt"])
        self.assertIn("不得呼叫 `reserve`", tomllib.loads(result["b-10-00.candidate.toml"])["prompt"])

    def test_manual_candidate_is_bound_to_exact_conversation_and_mac_fail_closed(self):
        text = self.build()[f"manual-workflow-{candidate.MANUAL_THREAD_ID}.candidate.md"]
        self.assertIn(candidate.MANUAL_THREAD_ID, text)
        self.assertIn(candidate.LEDGER_ROOT, text)
        self.assertIn(candidate.GATE_PATH + " reserve", text)
        self.assertIn("manual:" + candidate.MANUAL_THREAD_ID, text)
        self.assertIn("authorize", text)
        self.assertIn("complete", text)
        self.assertIn("stop without sending and retain the draft", text)
        self.assertIn("same-day message", text)
        self.assertIn("not installed", text)

    def test_runbook_addendum_only_appends_and_preserves_existing_content(self):
        result = self.build()["B2_DAILY_AUTOMATION_RUNBOOK.candidate.md"]
        self.assertTrue(result.startswith(RUNBOOK.rstrip()))
        self.assertIn(candidate.LEDGER_ROOT, result)
        self.assertIn(candidate.MANUAL_THREAD_ID, result)
        self.assertIn("13 KPI direct attachments and 6 awards direct attachments", result)

    def test_wrong_schedule_or_status_fails_closed(self):
        changed = self.b2.replace("BYMINUTE=45", "BYMINUTE=46")
        with self.assertRaisesRegex(ValueError, "B2_SCHEDULE_GUARD_FAILED"):
            self.build(b2=changed)
        disabled = self.b10.replace('status = "ACTIVE"', 'status = "PAUSED"')
        with self.assertRaisesRegex(ValueError, "AUTOMATION_ID_OR_STATUS_GUARD_FAILED"):
            self.build(b10=disabled)

    def test_manual_candidate_is_tied_only_to_approved_thread_and_runbook_context_is_guarded(self):
        self.assertEqual("manual-workflow-6aa35d1f-a438-83e8-81b2-77074837f7fc.candidate.md",
                         f"manual-workflow-{candidate.MANUAL_THREAD_ID}.candidate.md")
        with self.assertRaisesRegex(ValueError, "RUNBOOK_CONTEXT_GUARD_FAILED"):
            self.build(runbook="# changed without known 9-item context")

    def test_candidate_writer_is_private_new_directory_only_and_records_zero_side_effects(self):
        with tempfile.TemporaryDirectory() as root_name:
            root = Path(root_name)
            inputs = {}
            values = {"b2": self.b2, "b10": self.b10, "runbook": RUNBOOK}
            for key, value in values.items():
                path = root / f"{key}.txt"
                path.write_text(value, encoding="utf-8")
                inputs[key] = path
            expected = {key: candidate.sha(value) for key, value in values.items()}
            out = root / "private-output"
            receipt = candidate.write_candidate(out, inputs, expected_inputs=expected, private_root=root)
            self.assertEqual("prepared_review_only_not_installed", receipt["status"])
            self.assertEqual(0, receipt["external_sends"])
            self.assertEqual(0, receipt["automation_mutations"])
            self.assertEqual(0, receipt["runtime_writes"])
            self.assertTrue((out / "b-2.candidate.toml.patch").exists())
            self.assertTrue((out / f"manual-workflow-{candidate.MANUAL_THREAD_ID}.candidate.md").exists())
            with self.assertRaisesRegex(ValueError, "OUTPUT_ALREADY_EXISTS"):
                candidate.write_candidate(out, inputs, expected_inputs=expected, private_root=root)
            with self.assertRaisesRegex(ValueError, "OUTPUT_MUST_BE_IN_PRIVATE_CANDIDATE_ROOT"):
                candidate.write_candidate(root.parent / "outside", inputs, expected_inputs=expected, private_root=root)


if __name__ == "__main__":
    unittest.main()
