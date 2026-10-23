"""Source-verified individual ranks; never grant whole-person metric semantics."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import zipfile
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

SHEET = "上線數KPI_個人達成率_明細"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
SEMANTICS = "individual-rank-v1"


def store_key(value):
    value = re.sub(r"\s+", "", str(value or ""))
    return re.sub(r"^(台灣大哥大數位生活台北|台灣大哥大台北|台北)", "", value)


def mask_name(value):
    # The existing snapshot displays a literal source '?' as ［來源缺字］.
    # Canonicalize that annotation for matching only; never infer or edit a name.
    value = str(value or "").strip().replace("＊", "*").replace("［來源缺字］", "?")
    if not value:
        raise ValueError("RANK_NAME_MISSING")
    if "*" in value:
        return value
    return "*" if len(value) == 1 else value[0] + "*" + (value[-1] if len(value) > 2 else "")


def person_key(row, stores=None):
    store = str(row.get("store") or "")
    store = (stores or {}).get(store, store)
    return (store_key(store), mask_name(row.get("name", row.get("pname"))), str(row.get("role") or ""))


def index_rows(rows, stores=None):
    result = {}
    visible_keys = set()
    for row in rows:
        key = person_key(row, stores)
        if not key[0] or not key[2] or key in result or key[:2] in visible_keys:
            raise ValueError("RANK_IDENTITY_AMBIGUOUS")
        result[key] = row
        visible_keys.add(key[:2])
    if not result:
        raise ValueError("RANK_PEOPLE_MISSING")
    return result


def number(value, *, rank=False):
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        raise ValueError("RANK_NUMBER_INVALID")
    try:
        value = float(value)
    except (ValueError, TypeError):
        raise ValueError("RANK_NUMBER_INVALID") from None
    if not math.isfinite(value) or (rank and (value < 1 or not value.is_integer())):
        raise ValueError("RANK_NUMBER_INVALID")
    return int(value) if rank else value


def read_source(path):
    """Read cached OOXML values, with exact sheet/identity/date checks."""
    path = Path(path)
    with zipfile.ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ["".join(x.itertext()) for x in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        book = ET.fromstring(archive.read("xl/workbook.xml"))
        sheet = next((s for s in book.find("s:sheets", NS) if s.get("name") == SHEET), None)
        if sheet is None:
            raise ValueError("RANK_INDIVIDUAL_SHEET_REQUIRED")
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = next(r.get("Target") for r in rels if r.get("Id") == sheet.get("{" + REL + "}id"))
        target = target.lstrip("/") if target.startswith("/") else "xl/" + target
        xml = ET.fromstring(archive.read(target))
        cells = {}
        for cell in xml.iter("{" + NS["s"] + "}c"):
            value = cell.find("s:v", NS)
            value = value.text if value is not None else "".join(cell.findtext("s:is/s:t", "", NS))
            if cell.get("t") == "s":
                value = strings[int(value)]
            cells[cell.get("r")] = value
    period = str(cells.get("D5") or "")
    if str(cells.get("I8") or "").strip() != "排名":
        raise ValueError("RANK_COLUMN_CONTRACT_MISMATCH")
    match = re.search(r"(\d{4})/(\d{1,2})/\d{1,2}\s*[~～至-]\s*(?:(\d{4})/)?(\d{1,2})/(\d{1,2})", period)
    if not match:
        raise ValueError("RANK_SOURCE_DATE_REQUIRED")
    cutoff = date(int(match[3] or match[1]), int(match[4]), int(match[5]))
    if path.name != (cutoff + timedelta(days=1)).strftime("%m%d.xlsx"):
        raise ValueError("RANK_SOURCE_FILE_DATE_MISMATCH")
    records, ids = [], set()
    for rn in sorted({int(re.sub(r"\D", "", k)) for k in cells if k and re.sub(r"\D", "", k)}):
        if rn < 10 or cells.get(f"B{rn}") != "北一二B":
            continue
        if not str(cells.get(f"C{rn}", "")).startswith("DNB"):
            continue
        employee = str(cells.get(f"F{rn}") or "").strip()
        if not re.fullmatch(r"[A-Z0-9]{5,12}", employee) or employee in ids:
            raise ValueError("RANK_SOURCE_EMPLOYEE_INVALID")
        ids.add(employee)
        records.append({"employee_id": employee, "store": cells.get(f"D{rn}"),
                        "role": cells.get(f"E{rn}"), "name": cells.get(f"G{rn}"),
                        "rank": number(cells.get(f"I{rn}"), rank=True),
                        "overall_rate": number(cells.get(f"J{rn}"))})
    index_rows(records)
    return {"source_file": path.name, "data_as_of_date": cutoff.isoformat(),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "records": records}


def verified_ranks(component, source, protected=None, previous=None):
    """Return a copy changing only ranks and narrowly scoped provenance."""
    cutoff = source["data_as_of_date"]
    if any(component.get(k) != cutoff for k in ("report_date", "data_as_of_date", "source_as_of_date")):
        raise ValueError("RANK_COMPONENT_DATE_MISMATCH")
    if component.get("source_file") != source["source_file"]:
        raise ValueError("RANK_COMPONENT_SOURCE_MISMATCH")
    expected = index_rows(source["records"])
    actual = index_rows(component.get("personal", []))
    if expected.keys() != actual.keys():
        raise ValueError("RANK_IDENTITY_SET_MISMATCH")
    for key, row in actual.items():
        if number(row.get("overall_rate")) != number(expected[key].get("overall_rate")):
            raise ValueError("RANK_OFFICIAL_RATE_MISMATCH")
    if protected is not None:
        meta = protected.get("meta", {})
        if meta.get("sourceFile") != source["source_file"] or str(meta.get("month")) + "-" + str(meta.get("snapshotDay")).zfill(2) != cutoff:
            raise ValueError("RANK_PROTECTED_SOURCE_MISMATCH")
        stores = {str(s.get("code")): s.get("name") for s in protected.get("stores", [])}
        protected_rows = index_rows(protected.get("persons", []), stores)
        if expected.keys() != protected_rows.keys():
            raise ValueError("RANK_PROTECTED_IDENTITY_MISMATCH")
        if any(number(protected_rows[k].get("official")) != number(expected[k].get("overall_rate")) for k in expected):
            raise ValueError("RANK_PROTECTED_RATE_MISMATCH")
    prior = {}
    if previous is not None:
        if date.fromisoformat(previous["data_as_of_date"]) != date.fromisoformat(cutoff) - timedelta(days=1):
            raise ValueError("RANK_PREVIOUS_DATE_MISMATCH")
        prior = {r["employee_id"]: r for r in previous["records"]}
        if len(prior) != len(previous["records"]):
            raise ValueError("RANK_PREVIOUS_IDENTITY_AMBIGUOUS")
    result = copy.deepcopy(component)
    for row in result["personal"]:
        original = expected[person_key(row)]
        # The component writer requires the protected display identity verbatim.
        # Preserve its literal '?' rather than guessing a missing character.
        if protected is not None and "［來源缺字］" in str(row.get("name") or ""):
            protected_name = protected_rows[person_key(row)].get("pname")
            if "?" not in str(protected_name) or mask_name(protected_name) != mask_name(row["name"]):
                raise ValueError("RANK_PROTECTED_NAME_MISMATCH")
            row["name"] = protected_name
        rank = number(original.get("rank"), rank=True)
        before = prior.get(original["employee_id"])
        if before and mask_name(before.get("name")) != mask_name(original.get("name")):
            raise ValueError("RANK_PREVIOUS_IDENTITY_MISMATCH")
        prior_rank = number(before.get("rank"), rank=True) if before else None
        row["rank"] = rank
        row["rank_dod"] = prior_rank - rank if rank is not None and prior_rank is not None else None
    result["personal_rank_semantics"] = SEMANTICS
    result["personal_rank_source"] = {k: source[k] for k in ("source_file", "data_as_of_date", "sha256")}
    result["personal_rank_source"].update({"sheet": SHEET, "column": "I"})
    if previous is not None:
        result["personal_rank_source"]["previous_sha256"] = previous["sha256"]
    return result


def repair_component(component, source_path, protected=None, previous_path=None):
    return verified_ranks(component, read_source(source_path), protected,
                          read_source(previous_path) if previous_path else None)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--protected", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--previous-source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    inputs = {args.snapshot.resolve(), args.protected.resolve(), args.source.resolve()}
    if args.previous_source:
        inputs.add(args.previous_source.resolve())
    if args.output.resolve() in inputs:
        raise SystemExit("RANK_OUTPUT_MUST_BE_NEW")
    snapshot = json.loads(args.snapshot.read_text())
    snapshot["kpiBattle"] = repair_component(snapshot["kpiBattle"], args.source,
        json.loads(args.protected.read_text()), args.previous_source)
    with args.output.open("x") as output:
        output.write(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")))
    args.output.chmod(0o600)
    print(json.dumps({"status": "candidate-only", "people": len(snapshot["kpiBattle"]["personal"])}))
