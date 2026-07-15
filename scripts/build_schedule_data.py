#!/usr/bin/env python3
"""Convert the locally synced TWM 班表 .xls files into private JSON.

LibreOffice is used only for reading the legacy .xls files. The source files
remain untouched. The generated JSON is written to an ignored private-data
folder for a separately authenticated private service; it is never bundled
into patrol.html or published to GitHub Pages.
"""

from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ONEDRIVE = Path("/Users/liamlu/Library/CloudStorage/OneDrive-個人/TWM 班表")
OUT = ROOT / "private-data" / "schedule.json"
SOFFICE = Path("/Users/liamlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice")
STORE_ORDER = ["酒泉", "萬大", "大稻埕", "復興", "三創", "杭州", "永吉", "通化", "六張犁"]


def clean(value: object) -> str:
    return str(value or "").replace("\u3000", " ").strip()


def convert_to_csv(source: Path, out_dir: Path) -> Path:
    profile = out_dir / "lo-profile"
    profile.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            str(SOFFICE),
            f"-env:UserInstallation=file://{profile}",
            "--headless",
            "--convert-to",
            "csv",
            "--outdir",
            str(out_dir),
            str(source),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    target = out_dir / f"{source.stem}.csv"
    if not target.exists():
        raise RuntimeError(f"LibreOffice did not create {target}: {result.stdout} {result.stderr}")
    return target


def parse_csv(csv_path: Path, source: Path) -> dict:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        rows = [list(row) for row in csv.reader(fh)]

    title = next((clean(c) for row in rows[:5] for c in row if "班表" in clean(c)), source.stem)
    month_text = next((clean(c) for row in rows[:8] for c in row if re.fullmatch(r"\d{3,4}/\d{1,2}班表", clean(c))), "")
    month_match = re.search(r"(\d{3,4})/(\d{1,2})", month_text)
    roc_year = int(month_match.group(1)) if month_match else 115
    month = int(month_match.group(2)) if month_match else 7
    year = roc_year + 1911 if roc_year < 1911 else roc_year

    role_row = next((row for row in rows if len(row) > 1 and clean(row[1]) == "職務"), [])
    name_row = next((row for row in rows if len(row) > 1 and clean(row[1]) == "姓名"), [])
    phone_row = next((row for row in rows if len(row) > 1 and clean(row[1]) == "電話"), [])
    hire_row = next((row for row in rows if len(row) > 1 and clean(row[1]) == "到職日"), [])

    max_cols = max(len(role_row), len(name_row), len(phone_row), len(hire_row))
    staff = []
    for idx in range(5, max_cols):
        name = clean(name_row[idx] if idx < len(name_row) else "")
        if not name:
            continue
        staff.append(
            {
                "name": name,
                "role": clean(role_row[idx] if idx < len(role_row) else "業務代表"),
                "column": idx,
            }
        )

    staff_by_col = {person["column"]: person for person in staff}
    days = []
    for row in rows:
        if len(row) < 5 or not re.fullmatch(r"\d{1,2}", clean(row[1])):
            continue
        day = int(clean(row[1]))
        weekday = clean(row[4])
        assignments = []
        for person in staff:
            status = clean(row[person["column"]] if person["column"] < len(row) else "")
            # 班表中的 V 結尾代表休假／例假／特休／抵休；其餘非空班別（全、早1、晚1、工5、開會/上課等）都算當日出勤。
            assignments.append({"name": person["name"], "role": person["role"], "status": status, "working": bool(status) and not status.endswith("V")})
        working = [a for a in assignments if a["working"]]
        managers = [a for a in working if "店長" in a["role"] or "主管" in a["role"]]
        days.append(
            {
                "date": f"{year:04d}-{month:02d}-{day:02d}",
                "day": day,
                "weekday": weekday,
                "staff": assignments,
                "workingStaff": working,
                "managers": managers,
            }
        )

    # Avoid leaking internal conversion-only column indexes to the browser.
    for person in staff:
        person.pop("column", None)

    return {
        "store": source.stem,
        "title": title,
        "sourceFile": source.name,
        "rocMonth": f"{roc_year}/{month:02d}",
        "month": f"{year:04d}-{month:02d}",
        "staff": staff,
        "days": days,
    }


def main() -> None:
    if not SOFFICE.exists():
        raise SystemExit(f"Missing LibreOffice reader: {SOFFICE}")
    sources = {path.stem: path for path in ONEDRIVE.glob("*.xls") if path.is_file()}
    missing = [name for name in STORE_ORDER if name not in sources]
    if missing:
        raise SystemExit(f"Missing TWM 班表 files: {', '.join(missing)}")

    with tempfile.TemporaryDirectory(prefix="twm-schedule-") as temp:
        temp_dir = Path(temp)
        stores = [parse_csv(convert_to_csv(sources[name], temp_dir), sources[name]) for name in STORE_ORDER]

    payload = {
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceFolder": "OneDrive / TWM 班表",
        "month": stores[0]["month"],
        "rocMonth": stores[0]["rocMonth"],
        "stores": stores,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    OUT.write_text(serialized, encoding="utf-8")
    print(f"Wrote private schedule {OUT} ({len(stores)} stores, {sum(len(s['days']) for s in stores)} store-days)")
    print("This file is intentionally ignored by Git; expose it only through an authenticated private data service.")


if __name__ == "__main__":
    main()
