import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "render_goodspeed_detail.py"
HEADERS = [
    "店點", "統計日期", "同仁", "認列狀態", "產品／方案", "頻寬", "約期",
    "36M加碼", "500M", "1G", "速率加碼", "當日公司\n認列點數", "當日戰報\n含另加點數",
]


def workbook(path: Path, count: int, malformed: bool = False) -> None:
    book = Workbook()
    sheet = book.active
    sheet.title = "好速上線明細"
    sheet.append(["北一二B 好速上線明細｜2026-09-29"])
    sheet.append(HEADERS)
    for index in range(count):
        row = [f"台北店{index}", datetime(2026, 9, 28), f"同仁{index}", "認列（公司）",
               "999S", "150M", "24M", 0, "", "", 0, 1, 1]
        if malformed and index == count - 1:
            row = [f"台北店{index}"]
        sheet.append(row)
    sheet.append([])
    sheet.append([f"資料日：2026-09-28｜當日認列 {count} 筆／來源剔除 0 筆"])
    book.save(path)


def run(tmp_path: Path, count: int, rows_per_page: int = 12):
    source = tmp_path / f"source-{count}.xlsx"
    output = tmp_path / f"out-{count}.png"
    receipt = tmp_path / f"out-{count}.json"
    workbook(source, count)
    subprocess.run([sys.executable, str(SCRIPT), "render", str(source), str(output),
                    "--receipt", str(receipt), "--rows-per-page", str(rows_per_page)],
                   check=True)
    subprocess.run([sys.executable, str(SCRIPT), "verify", str(source), str(receipt)], check=True)
    return json.loads(receipt.read_text(encoding="utf-8"))


class GoodspeedRendererTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self.tempdir.name)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_zero_seven_eight_and_nine_rows(self):
        for count in (0, 7, 8, 9):
            with self.subTest(count=count):
                receipt = run(self.tmp_path, count)
                self.assertEqual(receipt["row_count"], count)
                self.assertEqual(len(receipt["row_keys"]), count)
                self.assertEqual(sum(item["rows"] for item in receipt["files"]), count)

    def test_overflow_is_complete_and_paginated(self):
        receipt = run(self.tmp_path, 17, rows_per_page=8)
        self.assertEqual([item["rows"] for item in receipt["files"]], [8, 8, 1])
        self.assertEqual(len(receipt["drawn_rows"]), 17)

    def test_store_only_row_is_rejected(self):
        source = self.tmp_path / "broken.xlsx"
        workbook(source, 9, malformed=True)
        result = subprocess.run([sys.executable, str(SCRIPT), "render", str(source),
                                 str(self.tmp_path / "broken.png")], text=True, capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("GOODSPEED_PNG_ROW_MISMATCH", result.stdout)


if __name__ == "__main__":
    unittest.main()
