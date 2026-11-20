"""Prepare a standalone private preview from a verified original monthly report."""
import argparse
import hashlib
import json
from collections import defaultdict
from datetime import date
from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook
from insurance_progress import PERSONAL_SHEET, SHEET, canonical_store, write_private_publication_artifacts


def prepare(source, report_date, expected_hash, roster_path, output):
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != expected_hash or source.name != date.fromisoformat(report_date).strftime('%m%d.xlsx'):
        raise ValueError('REPORT_SOURCE_MISMATCH')
    roster_rows = json.loads(roster_path.read_text())
    if roster_rows[0] != ['employee_id', 'masked_name', 'store', 'role', 'status']:
        raise ValueError('ROSTER_SCHEMA_CHANGED')
    roster = defaultdict(list)
    for row in roster_rows[1:]:
        if row:
            roster[str(row[0]).strip()].append(row)
    workbook = load_workbook(BytesIO(raw), read_only=True, data_only=True)
    try:
        stores = [{'code':str(r[3]), 'name':str(r[4])} for r in
                  workbook['上線數KPI_店點達成率_明細'].iter_rows(min_row=15, max_col=5, values_only=True)
                  if r[2] == '北一二B' and str(r[3]).startswith('DNB')]
        if len(stores) != 9 or len({s['code'] for s in stores}) != 9:
            raise ValueError('STORE_ROSTER_PENDING')
        people = []
        for r in workbook['上線數KPI_個人達成率_明細'].iter_rows(min_row=10, max_col=7, values_only=True):
            if r[:2] != ('北一二區', '北一二B') or not r[5]:
                continue
            identity = str(r[5]).strip()
            matches = roster[identity]
            verified = (len(matches) == 1 and len(matches[0]) >= 5 and matches[0][4] == 'active'
                        and canonical_store(matches[0][2]) == canonical_store(r[3]))
            # Unmatched rows cannot bind a rate to this identity.
            people.append({'employee_id':identity, 'store':str(r[2]) if verified else '',
                           'pname':str(r[6] or '')})
        book = {name:{'values':list(workbook[name].iter_rows(max_col=columns, values_only=True))}
                for name, columns in [(SHEET, 8), (PERSONAL_SHEET, 13)] if name in workbook.sheetnames}
    finally:
        workbook.close()
    output.mkdir(mode=0o700, exist_ok=False)
    return write_private_publication_artifacts(output, book, stores, people, source.name, digest, report_date)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--report-date', required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--roster', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.source, args.report_date, args.expected_sha256, args.roster, args.output)
    print(result['outcome'])
    raise SystemExit(0 if result['outcome'] == 'complete' else 1)
