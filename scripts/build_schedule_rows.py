#!/usr/bin/env python3
"""Convert transcribed 班表 shift grids into 「班表明細」 rows (12-column TSV).

Use this when the month's schedule only arrives as images (photos/screenshots of
each store's 班表) instead of the synced .xls files that
``build_schedule_data.py`` consumes. One text file per store is transcribed by
hand or by OCR, and this script derives every remaining column, then reconciles
each day against the headcount totals printed on the source sheet.

Input format — one file per store under ``--data-dir``::

    # store: 大稻埕
    # staff: 黃國勛|店長, 曹婉如|副店長, 王凱弘|業務代表
    # checkcols: 全 上班人數 休假人數 請假人數
    1 六 公V 全 全 2 2 0 1
    ...

Each body line is ``<日> <星期> <每位同仁的班別...> <來源表的檢核欄...>``. A shift
of ``-`` means the source cell was blank. ``checkcols`` names the tally columns
printed to the right of the grid; only ``上班人數`` is used for reconciliation.

The 出勤 / 值班主管 columns are NOT transcribed — they are derived by the rules
below, which were reverse-engineered from the 2026-07 production rows and hold
for all 1426 of them with zero exceptions:

* ``出勤``     = 否 when the shift is blank or ends in ``V``; otherwise 是.
* ``值班主管`` = 是 when 職務 is 店長 / 代理店長 / 副店長 and 出勤 is 是.

Known source-file quirk: rows containing ``開會/上課`` tally that person twice in
the sheet's own ``上班人數`` formula, so those days are reported as mismatches
and should be read against the ``全`` column instead.

Personal data (phone numbers, hire dates) present on the source images is
deliberately not carried into the sheet — 班表明細 has no columns for it.
"""

from __future__ import annotations

import argparse
import datetime
import re
from collections import defaultdict
from pathlib import Path


MANAGER_ROLES = {"店長", "代理店長", "副店長"}
WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]
STORE_ORDER = ["酒泉", "萬大", "大稻埕", "復興", "三創", "杭州", "永吉", "通化", "六張犁"]

HEADERS = [
    "版本月份", "門市", "日期", "日", "週", "同仁",
    "職務", "班別", "出勤", "值班主管", "來源檔", "匯入時間",
]


def is_working(shift: str) -> bool:
    """A shift is attendance unless it is blank or a ``…V`` leave code."""
    value = (shift or "").strip()
    if value in ("", "-"):
        return False
    return not value.endswith("V")


def parse_store_file(path: Path) -> tuple[dict, list[tuple[str, str]], list[list[str]]]:
    meta: dict[str, str] = {}
    body: list[list[str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            match = re.match(r"#\s*(\w+):\s*(.*)", line)
            if match:
                meta.setdefault(match.group(1), match.group(2).strip())
            continue
        if line.strip():
            body.append(line.split())

    staff: list[tuple[str, str]] = []
    for chunk in meta["staff"].split(","):
        name, role = chunk.strip().split("|")
        staff.append((name.strip(), role.strip()))
    return meta, staff, body


def build(data_dir: Path, month: str, imported_at: str) -> tuple[list[list[str]], list[str], list[tuple]]:
    year, mon = (int(part) for part in month.split("-"))
    rows: list[list[str]] = []
    problems: list[str] = []
    summary: list[tuple] = []

    for path in sorted(data_dir.glob("*.txt")):
        meta, staff, body = parse_store_file(path)
        store = meta["store"]
        headcount = len(staff)
        source = meta.get("src", f"{store}.png")
        tally = meta.get("checkcols", "").split()
        expected_days = (datetime.date(year + mon // 12, mon % 12 + 1, 1)
                         - datetime.timedelta(days=1)).day
        if len(body) != expected_days:
            problems.append(f"{store}: 有 {len(body)} 天，應為 {expected_days}")

        for parts in body:
            day = int(parts[0])
            shifts = parts[2:2 + headcount]
            checks = parts[2 + headcount:]
            if len(shifts) != headcount:
                problems.append(f"{store} {day}日: 班別數 {len(shifts)} != 人數 {headcount}")
                continue

            weekday = WEEKDAYS[datetime.date(year, mon, day).weekday()]
            if weekday != parts[1]:
                problems.append(f"{store} {day}日: 星期 {parts[1]} 與實際 {weekday} 不符")

            working = sum(1 for shift in shifts if is_working(shift))
            if "上班人數" in tally:
                index = tally.index("上班人數")
                if index < len(checks) and checks[index].isdigit():
                    printed = int(checks[index])
                    if printed != working:
                        problems.append(
                            f"{store} {day}日: 上班人數 表={printed} 算={working}"
                            f"  ({' '.join(shifts)})"
                        )

            for (name, role), shift in zip(staff, shifts):
                shift = "" if shift == "-" else shift
                attendance = "是" if is_working(shift) else "否"
                manager = "是" if role in MANAGER_ROLES and attendance == "是" else "否"
                rows.append([
                    month, store, f"{month}-{day:02d}", str(day), weekday,
                    name, role, shift, attendance, manager, source, imported_at,
                ])

        summary.append((store, headcount, len(body)))

    rows.sort(key=lambda row: (
        STORE_ORDER.index(row[1]) if row[1] in STORE_ORDER else len(STORE_ORDER),
        row[2],
    ))
    return rows, problems, summary


def report_missing_managers(rows: list[list[str]]) -> dict[str, list[str]]:
    by_day: dict[tuple[str, str], list[list[str]]] = defaultdict(list)
    for row in rows:
        by_day[(row[1], row[2])].append(row)
    missing: dict[str, list[str]] = defaultdict(list)
    for (store, date), day_rows in by_day.items():
        if not any(row[9] == "是" for row in day_rows):
            missing[store].append(date)
    return missing


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", type=Path, required=True,
                        help="directory holding one transcribed .txt per store")
    parser.add_argument("--month", required=True, help="version month, e.g. 2026-08")
    parser.add_argument("--out", type=Path, required=True, help="TSV destination")
    parser.add_argument("--imported-at", default=None,
                        help="匯入時間 stamp; defaults to now in ISO-8601 Z")
    parser.add_argument("--with-header", action="store_true",
                        help="emit the header row (omit when appending to the sheet)")
    args = parser.parse_args()

    imported_at = args.imported_at or (
        datetime.datetime.now(datetime.timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%S.000Z")
    )
    rows, problems, summary = build(args.data_dir, args.month, imported_at)

    lines = [HEADERS] + rows if args.with_header else rows
    args.out.write_text(
        "".join("\t".join(row) + "\n" for row in lines), encoding="utf-8"
    )

    print(f"produced {len(rows)} rows -> {args.out}")
    for store, headcount, days in summary:
        print(f"  {store:<6} {headcount:>2} 人 × {days} 天")

    missing = report_missing_managers(rows)
    if missing:
        print("\n沒有值班主管的日子（店長與副店長同日皆休，需人工確認）：")
        for store, dates in sorted(missing.items()):
            print(f"  {store}: {' '.join(sorted(dates))}")

    print("\n對帳：")
    if problems:
        for problem in problems:
            print(f"  ✗ {problem}")
        print(f"  共 {len(problems)} 項不符")
    else:
        print("  ✓ 每日上班人數與來源表檢核欄一致")


if __name__ == "__main__":
    main()
