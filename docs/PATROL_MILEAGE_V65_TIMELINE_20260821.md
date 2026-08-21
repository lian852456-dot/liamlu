# Patrol mileage v65 timeline — 2026-08-21 14:27 (Asia/Taipei)

## Production evidence

Apps Script execution metadata for formal deployment v65 shows:

- `ptsummary`: 14:27:22, 2.313 s, completed.
- Nine consecutive `ptdetail` requests: 14:27:24–14:27:41, all completed.
- No tenth `ptdetail`, so the mileage flow did not request page 2 in this run.

The store mapping below is inferred from the fixed sequential `STORES` loop in the v65 frontend; Apps Script execution metadata records function, start time, duration and status, but not the request action or store parameter.

| Store | Start | Server duration | Status |
|---|---:|---:|---|
| 台北通化 | 14:27:24 | 1.673 s | completed |
| 台北酒泉 | 14:27:26 | 2.543 s | completed |
| 台北三創 | 14:27:29 | 1.899 s | completed |
| 台北萬大 | 14:27:32 | 1.551 s | completed |
| 台北六張犁 | 14:27:34 | 1.364 s | completed |
| 台北復興南 | 14:27:36 | 2.167 s | completed |
| 台北永吉 | 14:27:39 | 1.839 s | completed |
| 台北大稻埕 | 14:27:40 | 1.180 s | completed |
| 台北杭州南 | 14:27:41 | 1.751 s | completed |

There was no server-side incomplete or timeout store. The last completed store was 台北杭州南. Execution metadata proves the Apps Script execution completed; it cannot prove that Safari received or parsed the final HTTP response.

## Root cause

The v65 frontend loaded mileage as nine sequential store reads. Every page called `readPatrolDetail_()`, which called `readPatrolContractColumns_(getPatrolSheet())` before filtering one store and one month. Therefore every `ptdetail` request re-read the full A:L patrol worksheet.

For the 14:27 run, nine full-sheet scans plus transport overhead consumed about 19 seconds from the first detail request to the final server completion. The UI displayed only a generic loading label and had no 10-second health threshold, page/store progress, or terminal timeout reason.

## Replacement contract

`patrol-mileage-month-v1` uses one month-scoped action, `ptmileage`:

- one A:L Sheet scan on the first page;
- filter by canonical `YYYY-MM`;
- normalize all nine stores by store code/name;
- return only `fillTime`, `arriveTime`, `code`, `store`, `month`;
- paginate the whole month at 500 rows per page;
- cache all page slices from the same snapshot, so later pages do not re-scan the Sheet;
- return `sourceRows`, `matchedRows`, `sheetScans`, `cacheHit`, and `serverDurationMs` diagnostics.

Frontend progress is page-based. At 10 seconds it displays `MILEAGE_LOAD_SLOW` and the current page; at the 30-second hard timeout it displays `MILEAGE_LOAD_TIMEOUT` and leaves the session intact.
