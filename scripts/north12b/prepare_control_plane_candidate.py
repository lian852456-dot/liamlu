#!/usr/bin/env python3
"""Build review-only local automation/runbook candidates; never install them."""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import tomllib
from pathlib import Path

MANUAL_THREAD_ID = "6aa35d1f-a438-83e8-81b2-77074837f7fc"
LEDGER_ROOT = "/Users/liamlu/Downloads/liam-agent/report-automation/work/final-mail-ledger"
GATE_PATH = "/Users/liamlu/Downloads/liam-agent/report-automation/work/entrypoint_gate.mjs"
REPO = Path(__file__).resolve().parents[2]
PRIVATE_ROOT = REPO.parent / "control-plane-candidate-20261013"
EXPECTED_INPUTS = {
    "b2": "2f09e9a1941418f3433c974bad8d6b85bb28abe1b6fe483e85e4a260532092d5",
    "b10": "8b7b1f8dfc2fba1a449688897aba118b25be437cf2c76b03b5d3bf0c0a6f11e7",
    "runbook": "9d8b436fdc27563ffef9381364fdb4339174cb476ae24dbd05dc4aeb649f20e0",
}
LIVE_INPUTS = {
    "b2": Path("/Users/liamlu/.codex/automations/b-2/automation.toml"),
    "b10": Path("/Users/liamlu/.codex/automations/b-10-00/automation.toml"),
    "runbook": Path("/Users/liamlu/Downloads/liam-agent/report-automation/docs/B2_DAILY_AUTOMATION_RUNBOOK.md"),
}

B2_ADDENDUM = f"""\
\n\n[候選最高優先寄信控制契約；取代較早的附件數、寄送和補寄指示]
- 本機 Mac 是唯一可 materialize 正式 sealed batch、使用 Outlook connector、執行寄信與讀回的環境。每日 KPI 清單依已核准的當日 manifest 為 13 件、台獎為 6 件；先以完整最終 manifest 核對，不得按舊 9 件門檻寄送。
- KPI 與台獎都必須使用同一固定 reservation ledger：`{LEDGER_ROOT}`；ledger 由本機 bridge 固定，不可由 request 指定。每種 mail type 執行 `node {GATE_PATH} reserve request.json`，request 只含 `entrypoint="b-2"`、type、sealed manifest path 與 fresh complete Sent Items `rawSentEvidence`。只有 reserve 成功後，才立即執行 `authorize`，沿用相同 entrypoint/type/manifest/token；只有 authorize 回傳一次性 permit 才可呼叫已授權 Outlook connector。connector 的 to、subject、text_content、attachment_files、save_to_sent_items 必須逐欄取自 permit；不得從其他目錄或 mutable outputs 取附件，不得自行呼叫 sender 跳過 bridge。
- `rawSentEvidence.query` 必須是完整 Sent Items 查詢，含 `folder="Sent Items"`、`complete=true`、report date、subject、checkedAt；checkedAt 不得舊於 60 秒。每個 message 含 id/subject/recipients/cc/bcc/body_path，attachments 含 name/materialized_path/inline=false；不可手寫或推定來源/config/body/attachment hashes，bridge 會從 sealed provenance 與下載 bytes 計算。當天既有郵件若不等於同一 sealed manifest，立即 BLOCKED；不得寄第二封、不得只補缺件。
- `authorize` 後只寄 permit 回傳的固定收件人、主旨、正文與附件路徑。寄後立即下載 Sent Items 正文與附件、重新取得 fresh complete `rawSentEvidence`，並執行 `node {GATE_PATH} complete request.json`，含相同 entrypoint/type/manifest/token 與下載證據；只有唯一 exact match、所有 hash/bytes/正文/來源/config 核對相符才標 `VERIFIED`。來源/config identity 從 sealed body 的 provenance line 讀取，不可自行推定。
- send timeout、connector 結果不明、process crash、complete/readback 不確定、reservation 已存在或任何 hash 不符：停止並保留 draft/sealed files，禁止重試或重寄。後續只由唯讀 reconcile 確認狀態。
- 若本 Mac、固定 ledger、sealed gate 或 Outlook connector 不可用，不得改到 cloud 執行、不得用本機其他 lock 代替；保留草稿並以 BLOCKED 結束。這些是候選設定，未部署前不得視為生效。"""

B10_ADDENDUM = f"""\
\n\n[候選最高優先 recovery 權限邊界；取代任何較早允許寄信或網站寫入的步驟]
- b-10-00 僅執行 Google Drive/Outlook/Sent Items/網站的唯讀 reconcile，使用 b-2 共用的 Mac ledger `{LEDGER_ROOT}` 讀取狀態；不得呼叫 `reserve`、`authorize` 或 Outlook sender，不得 build/修補或寫入正式網站。
- 若狀態為 `IN_FLIGHT`、既有郵件附件與 sealed manifest 不同、查詢不完整/過期、寄送或讀回結果不確定，立即 fail closed，保留 sealed draft 並通知 needs-attention；不清除 reservation、不重送、不改寫正式檔。
- 只有唯一 exact Sent Items match 與 ledger receipt 完全一致時標記 VERIFIED；其餘只回報 read-only reconcile 狀態。"""

MANUAL_INSTRUCTIONS = f"""# Manual workflow candidate — conversation {MANUAL_THREAD_ID}

This is a review-only instruction candidate for the exact ChatGPT conversation above. It is not installed or sent to that conversation.

The manual workflow must materialize the reviewed sealed batch and execute all local steps on this Mac, using the same bridge-fixed ledger as scheduled b-2: `{LEDGER_ROOT}`. Use only entrypoint id `manual:{MANUAL_THREAD_ID}`. Call `node {GATE_PATH} reserve request.json` with `entrypoint`, mail `type`, `manifestPath`, and fresh complete Sent Items `rawSentEvidence`; do not pass a ledger path. The query must state `folder="Sent Items"`, `complete=true`, report date, subject, and checkedAt no older than 60 seconds. Each message must include id/subject/recipients/cc/bcc/body_path and each attachment name/materialized_path/inline=false. Then call `authorize` with the same identity plus the returned token. Only the one-time permit returned by authorize may drive the direct Outlook connector call; copy `to`, `subject`, `text_content`, `attachment_files`, and `save_to_sent_items` exactly from the permit. The lookup supplied to reserve and complete must be fresh, complete Sent Items evidence; complete also receives the downloaded body and attachments. The bridge computes hashes and derives source/config identity from the sealed body provenance line; never invent hashes or provenance. After sending, obtain a new fresh complete Sent Items query and call `complete`; success requires one exact match.

If this conversation cannot access the same Mac filesystem, local gate, shared ledger, sealed batch or Outlook connector, stop without sending and retain the draft/sealed files. If a same-day message already exists with any mismatch from the sealed manifest, stop without a second send or partial resend. Any timeout, crash, `IN_FLIGHT` state, missing/uncertain readback or hash mismatch is non-retryable until a human performs read-only reconciliation. Do not clear reservations or create a different local/cloud lock.

The manual workflow is not allowed to run a separate cloud sender. Do not change the conversation, automation schedule, recipient, or live files as part of applying this candidate. Separate explicit approval is required before activation."""

RUNBOOK_ADDENDUM = f"""\n\n## Candidate shared Outlook control plane (review only; not active until approved and installed)

This addendum is a candidate control-plane change for the local b-2 sender, the manual ChatGPT workflow `{MANUAL_THREAD_ID}`, and the read-only b-10-00 reconciler. It supersedes the older 9-attachment / catch-up-send language above for the applicable v4 mail flow. The expected final mail contract is 13 KPI direct attachments and 6 awards direct attachments, validated against the approved per-date manifest.

- The Mac path `{LEDGER_ROOT}` is the one shared reservation ledger, fixed inside the Mac-local bridge; callers cannot select another ledger. b-2 and the exact manual conversation must materialize the same sealed batch and call `reserve`, `authorize`, and `complete` through `{GATE_PATH}` using entrypoints `b-2` and `manual:{MANUAL_THREAD_ID}` respectively; b-10-00 may read/reconcile that ledger but cannot reserve, authorize, or send.
- For each date/type, perform a fresh complete Sent Items query before `reserve`, supplied as raw `rawSentEvidence`. `query` must state `folder="Sent Items"`, `complete=true`, report date, subject and checkedAt no older than 60 seconds. Each message includes id, subject, recipients, cc, bcc, body_path; each attachment includes name, materialized_path, inline=false. The bridge materializes bytes and computes hashes. Existing same-day mail is acceptable only when there is exactly one message whose body, source/config identity and complete attachment manifest match the sealed batch. Any mismatch or ambiguity blocks all sending for that mail type; do not send a replacement or a partial resend.
- `reserve` alone never authorizes send (`sendAllowed=false`). Immediately call `authorize` with its token; only its one-shot permit may supply the direct Outlook parameters and immutable body/attachment paths. After send, download the sent body/attachments, perform a new fresh complete Sent Items query, and call `complete` with the same token and downloaded evidence. Verify exact unique message identity and all body/source/config/attachment hashes before marking VERIFIED. Source/config identity comes only from the sealed body's provenance line.
- Any failure after reservation, including crash, timeout, unknown send result or incomplete readback, retains the reservation and draft. Do not retry send, clear the ledger, switch to a cloud-local lock, or publish a success result. b-10-00 may only report a read-only reconcile result.
- If Mac access, the gate, shared ledger or Outlook connector is unavailable, fail closed and retain the draft. No live TOML, runbook, manual conversation or automation settings are changed by generating this candidate.
"""


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def toml_model(text: str) -> dict:
    return tomllib.loads(text)


def replace_prompt(text: str, original: dict, addition: str, expected_id: str) -> str:
    if original.get("id") != expected_id or original.get("status") != "ACTIVE":
        raise ValueError("AUTOMATION_ID_OR_STATUS_GUARD_FAILED")
    if original.get("kind") != "cron" or original.get("execution_environment") != "local":
        raise ValueError("AUTOMATION_ENVIRONMENT_GUARD_FAILED")
    if original.get("target", {}).get("project_id") != "local-a9c76003bdec9b55baf2c9737e2a842f":
        raise ValueError("AUTOMATION_PROJECT_GUARD_FAILED")
    if not original.get("rrule") or not original.get("cwds"):
        raise ValueError("SCHEDULE_OR_CWD_MISSING")
    prompt = original.get("prompt")
    if not isinstance(prompt, str) or not prompt:
        raise ValueError("PROMPT_MISSING")
    # TOML prompt occupies exactly one physical line in the live files. Replacing
    # only this line preserves every other byte/value, including recipients.
    matches = list(re.finditer(r"(?m)^prompt = (?:\"(?:\\.|[^\"\\])*\"|'[^']*')$", text))
    if len(matches) != 1:
        raise ValueError("PROMPT_LINE_NOT_UNIQUE")
    encoded = json.dumps(prompt + addition, ensure_ascii=False)
    candidate = text[:matches[0].start()] + "prompt = " + encoded + text[matches[0].end():]
    parsed = toml_model(candidate)
    for key, value in original.items():
        if key != "prompt" and parsed.get(key) != value:
            raise ValueError(f"NON_PROMPT_FIELD_CHANGED:{key}")
    if not parsed["prompt"].startswith(prompt):
        raise ValueError("ORIGINAL_PROMPT_NOT_PRESERVED")
    return candidate


def build_candidates(b2_text: str, b10_text: str, runbook_text: str) -> dict[str, str]:
    b2 = toml_model(b2_text)
    b10 = toml_model(b10_text)
    if b2.get("rrule") != "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=9;BYMINUTE=45;BYSECOND=0":
        raise ValueError("B2_SCHEDULE_GUARD_FAILED")
    if b10.get("rrule") != "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=10;BYMINUTE=0;BYSECOND=0":
        raise ValueError("B10_SCHEDULE_GUARD_FAILED")
    if "每日戰報 9 個 direct attachments" not in runbook_text or "台獎信" not in runbook_text:
        raise ValueError("RUNBOOK_CONTEXT_GUARD_FAILED")
    return {
        "b-2.candidate.toml": replace_prompt(b2_text, b2, B2_ADDENDUM, "b-2"),
        "b-10-00.candidate.toml": replace_prompt(b10_text, b10, B10_ADDENDUM, "b-10-00"),
        "B2_DAILY_AUTOMATION_RUNBOOK.candidate.md": runbook_text.rstrip() + RUNBOOK_ADDENDUM,
        f"manual-workflow-{MANUAL_THREAD_ID}.candidate.md": MANUAL_INSTRUCTIONS,
    }


def write_candidate(output: Path, inputs: dict[str, Path], *, expected_inputs: dict[str, str] = EXPECTED_INPUTS,
                    private_root: Path = PRIVATE_ROOT) -> dict:
    output = output.resolve()
    if not output.is_relative_to(private_root.resolve()):
        raise ValueError("OUTPUT_MUST_BE_IN_PRIVATE_CANDIDATE_ROOT")
    if output.exists():
        raise ValueError("OUTPUT_ALREADY_EXISTS")
    text = {key: path.read_text(encoding="utf-8") for key, path in inputs.items()}
    actual_hashes = {key: sha(value) for key, value in text.items()}
    if actual_hashes != expected_inputs:
        raise ValueError("LIVE_INPUT_HASH_GUARD_FAILED; re-review current targets")
    candidates = build_candidates(text["b2"], text["b10"], text["runbook"])
    output.mkdir(parents=True, mode=0o700)
    for name, content in candidates.items():
        (output / name).write_text(content, encoding="utf-8")
    for name, key in [("b-2.candidate.toml", "b2"), ("b-10-00.candidate.toml", "b10"),
                      ("B2_DAILY_AUTOMATION_RUNBOOK.candidate.md", "runbook")]:
        old = text[key].splitlines(keepends=True)
        new = candidates[name].splitlines(keepends=True)
        (output / (name + ".patch")).write_text("".join(difflib.unified_diff(old, new, fromfile=key, tofile=name)), encoding="utf-8")
    receipt = {
        "status": "prepared_review_only_not_installed",
        "manual_conversation_id": MANUAL_THREAD_ID,
        "ledger_root": LEDGER_ROOT,
        "inputs_sha256": actual_hashes,
        "candidates_sha256": {name: sha(value) for name, value in candidates.items()},
        "preserved_toml_fields": ["version", "id", "kind", "name", "status", "rrule", "model", "reasoning_effort", "notification_policy", "execution_environment", "target", "cwds", "created_at", "updated_at"],
        "modified_toml_fields": ["prompt"],
        "external_sends": 0,
        "automation_mutations": 0,
        "runtime_writes": 0,
    }
    (output / "candidate-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=PRIVATE_ROOT / "candidate")
    args = parser.parse_args()
    receipt = write_candidate(args.output, LIVE_INPUTS)
    print(json.dumps(receipt, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
