"""Private insurance sources; store and personal periods are verified independently."""
import hashlib
import json
import re
from datetime import date

SHEET = '搭售達成率 (手機保險)'

def canonical_store(value):
    return re.sub(r'^(台灣大哥大數位生活台北|台灣大哥大台北|台北)', '', re.sub(r'\s+', '', str(value or '')))

def rate(value):
    if isinstance(value, bool) or value is None or value == '': return None
    try:
        result = float(value[:-1]) / 100 if isinstance(value, str) and value.endswith('%') else float(value)
        return result if 0 <= result <= 1 else None
    except (ValueError, TypeError): return None

def extract_progress(book, stores, source_file, source_sha, publication_date):
    rows = book.get(SHEET, {}).get('values', [])
    # Both title and the detail header must match: G is achievement, H is attach rate.
    title_ok = bool(rows and rows[0] and rows[0][0] == '手機保險 KPI 進度達成率')
    header_ok = len(rows) > 12 and len(rows[12]) > 7 and rows[12][7] == '手機保險搭售率'
    out = {'schema':'store-insurance-progress/v1', 'sourceFile':source_file, 'sourceSha256':source_sha,
           'publicationDate':publication_date, 'sheet':SHEET, 'column':'H', 'status':'pending',
           'periodStart':None, 'cutoff':None, 'periodEvidence':None, 'rows':[]}
    # Only an explicit statistical period on THIS store worksheet is evidence.
    periods = []
    for i, row in enumerate(rows):
        for j, value in enumerate(row):
            if not isinstance(value, str): continue
            m = re.fullmatch(r'\s*統計期間\s*[：:]\s*(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\s*[~～至—－]\s*(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\s*', value)
            if not m: continue
            try:
                start, end = date(*map(int,m.groups()[:3])), date(*map(int,m.groups()[3:]))
                if start.day != 1 or start.strftime('%Y-%m') != end.strftime('%Y-%m') or not start <= end <= date.fromisoformat(publication_date): continue
                # Excel column label, not a human-supplied path.
                col = ''; n = j + 1
                while n: n, k = divmod(n-1,26); col = chr(65+k) + col
                periods.append((str(start),str(end),{'sheet':SHEET,'cell':f'{col}{i+1}','text':value}))
            except ValueError: continue
    if len(periods) == 1 and title_ok and header_ok:
        out['periodStart'], out['cutoff'], out['periodEvidence'] = periods[0]; out['status'] = 'verified'
    for store in stores:
        matches = [r for r in rows[13:] if len(r)>7 and r[0] == store['code']]
        valid = title_ok and header_ok and len(matches)==1 and canonical_store(matches[0][1])==canonical_store(store['name'])
        out['rows'].append({'code':store['code'], 'store':store['name'], 'rate':rate(matches[0][7]) if valid else None})
    # Stable across retries; a same-day correction changes the input SHA/version.
    out['version'] = hashlib.sha256(json.dumps(out,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return out


PERSONAL_SHEET = SHEET + ' _個人'

def extract_consultation_source(book, stores, people, source_file, source_sha, publication_date):
    store = extract_progress(book, stores, source_file, source_sha, publication_date)
    rows = book.get(PERSONAL_SHEET, {}).get('values', [])
    personal = {'sheet':PERSONAL_SHEET,'column':'M','status':'pending','periodStart':None,'cutoff':None,'periodEvidence':None,'rows':[]}
    title_ok = bool(rows and rows[0] and rows[0][0] == '手機保險 KPI 進度達成率')
    header_ok = len(rows)>4 and len(rows[4])>12 and rows[4][12]=='手機保險搭售率'
    text = str(rows[2][3] or '') if len(rows)>2 and len(rows[2])>3 else ''
    m = re.fullmatch(r'(20\d{2})/(\d{1,2})/(\d{1,2})\s*[~～至]\s*(?:(20\d{2})/)?(\d{1,2})/(\d{1,2})',text.strip())
    if m and title_ok and header_ok:
        try:
            y,mo,da,ey,em,ed=m.groups(); start=date(int(y),int(mo),int(da)); end=date(int(ey or y),int(em),int(ed))
            if start.day==1 and start.strftime('%Y-%m')==end.strftime('%Y-%m') and start<=end<=date.fromisoformat(publication_date):
                personal.update(status='verified',periodStart=str(start),cutoff=str(end),periodEvidence={'sheet':PERSONAL_SHEET,'cell':'D3','text':text})
        except ValueError: pass
    store_names={x['code']:x['name'] for x in stores}
    for person in people:
        pid=str(person.get('employee_id') or '').strip(); code=str(person.get('store') or '')
        matches=[r for r in rows[6:] if len(r)>12 and str(r[5] or '').strip()==pid and r[1]=='北一二B']
        roster_unique=sum(str(x.get('employee_id') or '').strip()==pid for x in people)==1
        valid=bool(pid and roster_unique and code in store_names and title_ok and header_ok and len(matches)==1 and str(matches[0][2])==code and canonical_store(matches[0][3])==canonical_store(store_names[code]) and str(matches[0][6] or '').strip()==str(person.get('pname') or '').strip())
        masked=str(person.get('pname') or '')
        personal['rows'].append({'subjectId':pid,'storeCode':code,'store':store_names.get(code,''),'maskedName':masked if '*' in masked or '＊' in masked else '同仁','identityStatus':'verified' if valid else 'pending','rate':rate(matches[0][12]) if valid else None})
    out={'schema':'insurance-consultation-source/v2','sourceFile':source_file,'sourceSha256':source_sha,'publicationDate':publication_date,'stores':store,'personal':personal}
    out['version']=hashlib.sha256(json.dumps(out,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return out
