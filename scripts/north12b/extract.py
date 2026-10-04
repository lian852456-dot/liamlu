import hashlib, json, os, re, sys
from collections import Counter, defaultdict
from datetime import datetime, date
from pathlib import Path
from openpyxl import load_workbook
from openpyxl.utils.datetime import to_excel

ROOT = Path(os.environ.get("RUN_ROOT", Path(__file__).resolve().parent))
CUR = Path(sys.argv[1])
PREV = Path(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != "-" else None
PREV_KPI = Path(sys.argv[3]) if len(sys.argv) > 3 else None
OUT = ROOT
REPORT_DATE = os.environ["REPORT_DATE"]
SOURCE_FILE = os.environ["SOURCE_FILE"]
SOURCE_SHA = hashlib.sha256(CUR.read_bytes()).hexdigest()
BATCH_ID = os.environ["BATCH_ID"]

ITEMS = [
    "5G銷售數", "HBO Max&Disney+&Prime Video銷售數", "Netflix多享組銷售數",
    "TTL AQ上線點數", "自退數", "解約後NP OUT", "解約後NP OUT(督導績)",
    "AQ V+D 999 (含)以上", "AQ V+D 1399 (含)以上", "預付卡開卡面額",
    "RT上線點數", "特殊維繫用戶續約數", "高高特維用戶續約數",
    "RT V+D 999 (含)以上", "RT V+D 1399 (含)以上", "Device專案銷售數",
    "重點Device銷售量", "好速案銷售點數", "換約淨新增金額",
    "空機、3C、物聯網及門市購營收", "配件及其他營收", "包膜與保貼營收",
    "手機保險服務點數", "MyVideo&KKBOX", "Apple&Google服務及雜誌週刊開通數",
]
ADDON = [
    "Device專案銷售數", "重點Device銷售量", "換約淨新增金額",
    "空機、3C、物聯網及門市購營收", "配件及其他營收", "包膜與保貼營收",
    "手機保險服務點數", "MyVideo&KKBOX", "Apple&Google服務及雜誌週刊開通數",
    "HBO Max&Disney+&Prime Video銷售數", "Netflix多享組銷售數",
]

def serial(v):
    if isinstance(v, (datetime, date)):
        return to_excel(v)
    return v

def values_book(path):
    wb = load_workbook(path, read_only=True, data_only=True)
    out = {}
    for ws in wb.worksheets:
        vals = []
        for row in ws.iter_rows(values_only=True):
            vals.append([serial(v) for v in row])
        out[ws.title] = {"values": vals}
    return out

def pct(v):
    if v in (None, ""):
        return None
    if isinstance(v, str) and v.endswith("%"):
        return float(v[:-1]) / 100
    return float(v)

def n(v):
    if v in (None, ""):
        return None
    return float(v)

def parse_sheet(path, sheet, header_row, aggregate_row, detail_start, detail_end, person=False, aggregate_header_row=None):
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    h = [c.value for c in ws[header_row]]
    item_cols = {}
    for i, v in enumerate(h):
        if v in ITEMS:
            item_cols[v] = i
    missing = [x for x in ITEMS if x not in item_cols]
    if missing and path == PREV:
        empty = {k:{"a":None,"t":None,"w":None,"reportRate":None} for k in ITEMS}
        return [] if person else (empty, [], None, None)
    if missing:
        raise SystemExit(f"missing KPI item columns in {sheet}: {missing}")
    def item_obj(row, key, cols=item_cols):
        i = cols[key]
        return {"a": n(row[i]), "t": n(row[i+1]), "w": pct(row[i+2]), "reportRate": n(row[i+3])}
    if person:
        people=[]
        for rn in range(detail_start, ws.max_row+1):
            row=[c.value for c in ws[rn]]
            if row[0] != "北一二區" or row[1] != "北一二B" or not row[5]:
                continue
            people.append({"store": str(row[2]), "store_name": str(row[3]), "role": str(row[4]),
                           "employee_id": str(row[5]), "pname": str(row[6]), "official": n(row[9]),
                           "items": {k:item_obj(row,k) for k in ITEMS}})
        return people
    agg=[c.value for c in ws[aggregate_row]]
    ah=[c.value for c in ws[aggregate_header_row or header_row]]
    acols={v:i for i,v in enumerate(ah) if v in ITEMS}
    aggregate={k:(item_obj(agg,k,acols) if k in acols else {"a":None,"t":None,"w":None,"reportRate":None}) for k in ITEMS}
    stores=[]
    for rn in range(detail_start, ws.max_row+1):
        row=[c.value for c in ws[rn]]
        if row[2] != "北一二B" or not str(row[3] or "").startswith("DNB"):
            continue
        stores.append({"code":str(row[3]), "name":str(row[4]), "rank":int(row[6]) if row[6] is not None else None, "official":n(row[7]),
                       "items":{k:item_obj(row,k) for k in ITEMS}})
    return aggregate, stores, int(agg[6]) if agg[6] is not None else None, n(agg[7])

def parse_person_store_sheet(path, prior_people, store_code_by_name):
    """Parse the repeated store-section personal KPI report."""
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb['上線數KPI_個人達成率_店點']
    prior = {p['employee_id']: p for p in prior_people}
    people = []
    current_store = None
    current_header = None
    current_item_cols = None
    for rn in range(1, ws.max_row + 1):
        row = [c.value for c in ws[rn]]
        first = row[0] if row else None
        if isinstance(first, str) and first.startswith('北一二區 / 北一二B / '):
            current_store = first.split('/')[-1].strip()
            current_header = None
            current_item_cols = None
            continue
        if current_store and any(v in ITEMS for v in row):
            current_header = row
            continue
        if current_header and any(str(v or '').replace('\n', '') == '進度達成率' for v in row):
            starts = [(i, v) for i, v in enumerate(current_header) if v in ITEMS]
            current_item_cols = {}
            for pos, (start, key) in enumerate(starts):
                end = starts[pos + 1][0] if pos + 1 < len(starts) else len(row)
                semantic = {}
                for i in range(start, end):
                    label = str(row[i] or '').replace('\n', '').strip()
                    if label == '實際數': semantic['a'] = i
                    elif label == '目標數': semantic['t'] = i
                    elif label == '權重': semantic['w'] = i
                    elif label == '進度達成率': semantic['reportRate'] = i
                if set(semantic) == {'a', 't', 'w', 'reportRate'}:
                    current_item_cols[key] = semantic
            missing = [k for k in ITEMS if k not in current_item_cols]
            if missing:
                raise SystemExit(f'missing personal KPI groups for {current_store}: {missing}')
            continue
        employee_id = str(first or '').strip()
        name = str(row[1] or '').strip() if len(row) > 1 else ''
        if not (current_store and current_item_cols and employee_id and name and employee_id in prior):
            continue
        prior_rec = prior[employee_id]
        # The formal roster in today's workbook is authoritative.  Store moves
        # are valid roster changes and must not be rejected merely because the
        # previous-day record still carries the former store.
        items = {}
        for key, cols in current_item_cols.items():
            items[key] = {
                'a': n(row[cols['a']]),
                't': n(row[cols['t']]),
                'w': pct(row[cols['w']]),
                'reportRate': n(row[cols['reportRate']]),
            }
        # Preserve the prior verified masked name when the month-start source
        # contains a literal replacement question mark for an unsupported
        # glyph.  Matching is by the unique formal employee key; no raw key is
        # written to the output presentation.
        display_name = prior_rec['pname'] if '?' in name else name
        people.append({
            'store': store_code_by_name[current_store],
            'store_name': current_store,
            'role': prior_rec['role'],
            'employee_id': employee_id,
            'pname': display_name,
            'official': float(row[2] or 0),
            'items': items,
        })
    return people

def addon_score(items):
    return round(sum((items[k]["reportRate"] or 0) * (items[k]["w"] or 0) * 100 for k in ADDON), 4)

cur_book=values_book(CUR)
prev_book=values_book(PREV) if PREV and PREV.exists() else {}
json.dump(cur_book, open(OUT/f'{Path(SOURCE_FILE).stem}-source-values.json','w'), ensure_ascii=False)

cur_agg, cur_stores, cur_rank, cur_official = parse_sheet(CUR,'上線數KPI_店點達成率_明細',13,10,15,23,aggregate_header_row=8)
prev_agg, prev_stores, prev_rank, prev_official = parse_sheet(PREV,'上線數KPI_店點達成率_明細',13,10,15,23,aggregate_header_row=8) if '上線數KPI_店點達成率_明細' in prev_book else ({k:{'reportRate':None,'w':None} for k in ITEMS}, [], None, None)
if PREV_KPI and PREV_KPI.exists():
    prev_people=json.load(open(PREV_KPI))['persons']
elif '上線數KPI_個人達成率_明細' in prev_book:
    prev_people=parse_sheet(PREV,'上線數KPI_個人達成率_明細',8,None,10,51,person=True)
else:
    prev_people=[]
if '上線數KPI_個人達成率_明細' in cur_book:
    people=parse_sheet(CUR,'上線數KPI_個人達成率_明細',8,None,10,51,person=True)
else:
    people=parse_person_store_sheet(CUR, prev_people, {s['name']: s['code'] for s in cur_stores})
if len(ITEMS)!=25 or len(cur_stores)!=9:
    raise SystemExit(f"KPI gate failed items={len(ITEMS)} stores={len(cur_stores)}")
ids=[p['employee_id'] for p in people]
if len(ids)!=len(set(ids)):
    raise SystemExit("duplicate roster employee IDs")
if not people:
    raise SystemExit("dynamic roster is empty")

period=str(cur_book['上線數KPI_店點達成率_明細']['values'][3][4])
previous_period=str(prev_book.get('上線數KPI_店點達成率_明細',{}).get('values',[[None]*5]*4)[3][4] or '')
def parse_asof(text):
    text=str(text or '').strip()
    m=re.search(r'(\d{1,2})/(\d{1,2})(?!.*\d)', text)
    if not m:
        return None
    year=int(re.search(r'(20\d{2})/', text).group(1)) if re.search(r'(20\d{2})/',text) else int(REPORT_DATE[:4])
    result=f'{year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}'
    return result if result <= REPORT_DATE else None
asof=parse_asof(period)
if not asof:
    raise SystemExit(f'core KPI source date unreadable: {period}')
previous_asof=parse_asof(previous_period)
same_month=bool(previous_asof and asof[:7] == previous_asof[:7])
# A month-start export with no valid targets has no achievement baseline.
# Explicit zero achievements with positive targets remain a valid zero.
previous_baseline_valid=any(isinstance(v.get('t'),(int,float)) and v['t']>0 for v in prev_agg.values())
same_month=same_month and previous_baseline_valid
qis_values=cur_book.get('QIS店績',{}).get('values',[])
qis_period=qis_values[2][4] if len(qis_values)>2 and len(qis_values[2])>4 else None
qis_asof=parse_asof(qis_period)
ins_person_key='搭售達成率 (手機保險) _個人'
ins_values=cur_book.get(ins_person_key,{}).get('values',[])
ins_period=ins_values[2][3] if len(ins_values)>2 and len(ins_values[2])>3 else None
ins_asof=parse_asof(ins_period)
prev_ins_values=prev_book.get(ins_person_key,{}).get('values',[])
prev_ins_period=prev_ins_values[2][3] if len(prev_ins_values)>2 and len(prev_ins_values[2])>3 else None
prev_ins_asof=parse_asof(prev_ins_period)

goods=cur_book['好速案銷售點數']['values']
good_rows=[r for r in goods[1:] if len(r)>30 and r[1]=='北一二B']
company_actual=sum(float(r[30] or 0) for r in good_rows if '剔除' not in str(r[4] or ''))
excluded=[r for r in good_rows if '剔除' in str(r[4] or '')]
company_target=cur_agg['好速案銷售點數']['t']
company_rate=cur_agg['好速案銷售點數']['reportRate']
if abs(company_actual-float(cur_agg['好速案銷售點數']['a']))>1e-6:
    raise SystemExit(f"Goodspeed reconcile failed detail={company_actual} source={cur_agg['好速案銷售點數']['a']}")

from calendar import monthrange
asof_dt=datetime.strptime(asof,'%Y-%m-%d')
meta={"period":period,"snapshotDay":asof_dt.day,"monthDays":monthrange(asof_dt.year,asof_dt.month)[1],"month":asof_dt.strftime('%Y-%m'),"sourceFile":SOURCE_FILE,
      "sourceSha256":SOURCE_SHA,"reportDate":REPORT_DATE,"processingRunId":BATCH_ID,
      "aggregateOfficialRaw":cur_official,"aggregateOfficialCorrected":cur_official,
      "goodspeedReconciliation":{"rawTotal":company_actual,"sourceExcludedCount":len(excluded),"excludedCount":len(excluded),
      "excludedPoints":sum(float(r[30] or 0) for r in excluded),"validTotal":company_actual,"companyActual":company_actual,
      "companyTarget":company_target,"companyRate":company_rate,
      "rule":"公司正式好速欄位；企客、4G與BB加掛可認列；僅來源標記降轉／剔除不認列；戰報加碼另列不回灌KPI"},
      "report_run_date":REPORT_DATE,"report_date":asof,"data_as_of_date":asof,"source_file":SOURCE_FILE,"processing_run_id":BATCH_ID,
      "qis_data_as_of_date":qis_asof,"insurance_data_as_of_date":ins_asof,
      "component_completeness":{"qis":"ok" if any(r[2:3]==["北一二B"] for r in qis_values) else "no_data","insurance":"partial" if any(r[:1]==["北一二B"] for r in cur_book.get("搭售達成率 (手機保險)",{}).get("values",[])) else "no_data"}}
prior_by_code={s['code']:s for s in prev_stores}
prior_person_by_id={p['employee_id']:p for p in prev_people}
current_kpi={"meta":meta,
    "items":[{"key":k,"short":k,"step":1} for k in ITEMS],
    "aggregateRates":{k:cur_agg[k]['reportRate'] for k in ITEMS},
    "stores":cur_stores,"persons":people}
previous_kpi={"meta":{"period":previous_period,"report_date":previous_asof,"month":previous_asof[:7] if previous_asof else None},"items":current_kpi['items'],"aggregateRates":{k:prev_agg[k]['reportRate'] for k in ITEMS},"stores":prev_stores,"persons":prev_people}
json.dump(current_kpi,open(OUT/f'kpicalc-{Path(SOURCE_FILE).stem}-corrected.json','w'),ensure_ascii=False)
json.dump(previous_kpi,open(OUT/f'previous-kpicalc-{PREV.stem if PREV else "unavailable"}.json','w'),ensure_ascii=False)

summary=[{"store":"北一二B整體","rank":cur_rank,"overall":cur_official,
          "rank_dod":prev_rank-cur_rank if same_month and prev_rank is not None and cur_rank is not None else None,
          "overall_dod":cur_official-prev_official if same_month and prev_official is not None and cur_official is not None else None,
          "addon":addon_score(cur_agg),
          "addon_dod":addon_score(cur_agg)-addon_score(prev_agg) if same_month else None}]
for s in cur_stores:
    p=prior_by_code.get(s['code'])
    summary.append({"store":s['name'],"rank":s['rank'],"overall":s['official'],
                    "rank_dod":p['rank']-s['rank'] if same_month and p and p['rank'] is not None and s['rank'] is not None else None,
                    "overall_dod":s['official']-p['official'] if same_month and p and p['official'] is not None and s['official'] is not None else None,
                    "addon":addon_score(s['items']),
                    "addon_dod":addon_score(s['items'])-addon_score(p['items']) if same_month and p else None})
daily={"summary":summary,
       "stores":[{"store":s['name'],"items":[{"key":k,"reportRate":s['items'][k]['reportRate']} for k in ITEMS]} for s in cur_stores],
       "items":[{"key":k,"rate":cur_agg[k]['reportRate']} for k in ITEMS],
       "persons":[{"name":p['pname'],"store":p['store_name'],"employee_id":p['employee_id']} for p in people],
       "meta":{"period":period,"reportDate":REPORT_DATE,"sourceFile":SOURCE_FILE,
               "qisCutoff":qis_asof,"insuranceCutoff":ins_asof,"previousInsuranceCutoff":prev_ins_asof,
               "previousCoreAsOf":previous_asof,"sameMonthDod":same_month,"previousBaselineValid":previous_baseline_valid,"dodNote":"同月且兩次都有有效來源才比較；前日無資料時暫不比較",
               "goodspeed":{"companyActual":company_actual,"companyTarget":company_target,"companyRate":company_rate,
                            "sourceExcludedCount":len(excluded),"excludedCount":len(excluded),"excludedPoints":sum(float(r[30] or 0) for r in excluded)}}}
from sales_metrics import build_sales_metrics
sales_book=dict(cur_book)
vk_sources=[]
for vk_path in json.loads(os.environ.get('VK_SOURCE_PATHS','[]')):
    vk_path=Path(vk_path)
    vk_sources.append({'file':vk_path.name,'sha256':hashlib.sha256(vk_path.read_bytes()).hexdigest()})
    for sheet,data in values_book(vk_path).items():
        sales_book[f'{vk_path.name}/{sheet}']=data
sales_metrics = build_sales_metrics(sales_book, cur_stores, asof)
sales_metrics['additional_sources']=vk_sources
daily['salesMetrics'] = sales_metrics
json.dump(daily,open(OUT/'daily-kpi-data.json','w'),ensure_ascii=False)

# Closure audit.
den=cur_book['續約率(分母)']['values']; num=cur_book['續約率(分子)']['values']
dh=den[0]; nh=num[0]
denrows=[r for r in den[1:] if r[1]=='北一二B']
numrows=[r for r in num[1:] if r[1]=='北一二B']
def keyd(r): return f"{r[6]}|{r[2]}|{r[7]}"
def keyn(r): return f"{r[6]}|{r[2]}|{r[11]}"
if any(not r[6] or not r[2] or not r[7] for r in denrows) or len({keyd(r) for r in denrows})!=len(denrows):
    raise SystemExit("closure denominator blank/duplicate canonical key")
if any(not r[6] or not r[2] or not r[11] for r in numrows) or len({keyn(r) for r in numrows})!=len(numrows):
    raise SystemExit("closure numerator blank/duplicate canonical key")
dmap={keyd(r):r for r in denrows}; nmap={keyn(r):r for r in numrows}
missing_num=[k for k in nmap if k not in dmap]
if missing_num: raise SystemExit(f"closure numerator not subset: {len(missing_num)}")
actual_dates=sorted({r[6] for r in denrows})[-3:]
if not actual_dates:
    raise SystemExit('closure source has no actual statistical date')
# Month-start sources may contain fewer than three actual dates.  Preserve the
# missing dates as nulls (rendered as 尚未有資料) instead of borrowing the
# previous month or manufacturing calendar dates.
dates=[None] * (3-len(actual_dates)) + actual_dates
store_names={s['code']:s['name'] for s in cur_stores}
order=['北一二B整體']+[s['name'] for s in cur_stores]
daily_cl=[]
for label in order:
    code=None if label=='北一二B整體' else next(k for k,v in store_names.items() if v==label)
    cells=[]
    for dt in dates:
        if dt is None:
            cells.append({"numerator":None,"denominator":None,"rate":None})
            continue
        dr=[r for r in denrows if r[6]==dt and (code is None or r[2]==code)]
        nr=[r for r in numrows if r[6]==dt and (code is None or r[2]==code)]
        dv=sum(float(r[17] or 0) for r in dr); nv=sum(float(r[19] or 0) for r in nr)
        cells.append({"numerator":nv,"denominator":dv,"rate":nv/dv if dv else None})
    dod=None if not cells[-1]['denominator'] or not cells[-2]['denominator'] else round((cells[-1]['rate']-cells[-2]['rate'])*100,10)
    daily_cl.append({"store":label,"cells":cells,"dod_pp":dod})
latest=actual_dates[-1]; latest_den=[r for r in denrows if r[6]==latest]; latest_num_keys={keyn(r) for r in numrows if r[6]==latest}
roster_by_store_name={(p['store'],p['pname']):p for p in people}
formal=Counter(); unassigned=0; anomalies=0
for r in latest_den:
    if keyd(r) in latest_num_keys: continue
    qty=int(float(r[17] or 0))
    status=str(r[9] or '').strip()
    if status in {'Y','已續約'}:
        anomalies+=qty; continue
    name=str(r[19] or '').strip(); rec=roster_by_store_name.get((str(r[2]),name))
    if rec:
        formal[(store_names.get(str(r[2]),str(r[3])),rec['pname'])]+=qty
    else:
        unassigned+=qty
formal_rows=[{"store":k[0],"name":k[1],"count":v} for k,v in sorted(formal.items())]
latest_den_total=sum(float(r[17] or 0) for r in latest_den)
latest_num_total=sum(float(r[19] or 0) for r in numrows if r[6]==latest)
gap=int(latest_den_total-latest_num_total)
formal_cases=sum(formal.values())
if formal_cases+unassigned+anomalies!=gap:
    raise SystemExit(f"closure gap mismatch {formal_cases}+{unassigned}+{anomalies}!={gap}")
fmtdate=lambda s:(datetime(1899,12,30)+__import__('datetime').timedelta(days=float(s))).date().isoformat()
closure={"dates":[fmtdate(x) if x is not None else None for x in dates],"daily":daily_cl,
         "latest":{"date":fmtdate(latest),"numerator":int(latest_num_total),"denominator":int(latest_den_total),"gap":gap,
                   "formal_staff_count":len(formal_rows),"formal_cases":formal_cases,"formal_unclosed":formal_rows,
                   "unassigned_cases":unassigned,"anomaly_cases":anomalies}}
json.dump(closure,open(OUT/f'closure-audit-{Path(SOURCE_FILE).stem}.json','w'),ensure_ascii=False)

id_hash=lambda value: hashlib.sha256(str(value).encode('utf-8')).hexdigest()[:16]
audit={"source_file":SOURCE_FILE,"source_sha256":SOURCE_SHA,"source_bytes":CUR.stat().st_size,"period":period,
       "core_as_of":asof,"qis_as_of":qis_asof,"insurance_as_of":ins_asof,"previous_insurance_as_of":prev_ins_asof,
       "previous_core_as_of":previous_asof,"same_month_dod":same_month,
       "kpi_items":len(ITEMS),"stores":len(cur_stores),"roster":len(people),
       "new_id_hashes":[id_hash(x) for x in sorted(set(ids)-{p['employee_id'] for p in prev_people})],
       "removed_id_hashes":[id_hash(x) for x in sorted({p['employee_id'] for p in prev_people}-set(ids))],"goodspeed_actual":company_actual,
       "goodspeed_target":company_target,"goodspeed_rate":company_rate,"goodspeed_source_excluded":len(excluded),
       "closure_dates":closure['dates'],"closure_latest":closure['latest']}
json.dump(audit,open(OUT/f'source-audit-{Path(SOURCE_FILE).stem}.json','w'),ensure_ascii=False,indent=2)
print(json.dumps(audit,ensure_ascii=False,indent=2))
