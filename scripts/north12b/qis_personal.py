"""Personal QIS: source-backed reported-score scenarios, never inferred raw totals."""
from decimal import Decimal, InvalidOperation, ROUND_CEILING
from pathlib import Path
from datetime import date
from collections import Counter
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import hashlib, re, unicodedata
from openpyxl import load_workbook

def text(value):return unicodedata.normalize('NFKC',str('' if value is None else value)).strip()

def number(value):
    if value is None or isinstance(value,bool) or text(value)=='':return None
    try:
        n=Decimal(str(value))
        return n if n.is_finite() else None
    except InvalidOperation:return None

def estimate_100_cases(count,score):
    n,s=number(count),number(score)
    result={'status':'pending','case_count':None,'current_score':None,'additional_100':None,'projected_report_average':None}
    if n is None or n<0 or n!=n.to_integral_value():return result
    result['case_count']=int(n)
    if n==0:return {**result,'status':'no_data','additional_100':1,'projected_report_average':100.0}
    if s is None or s<0 or s>100:return result
    result['current_score']=float(s)
    if s>=98:return {**result,'status':'at_least_98','additional_100':0,'projected_report_average':float(s)}
    k=int((n*(Decimal(98)-s)/2).to_integral_value(rounding=ROUND_CEILING))
    # This is a reported-average scenario, not the employee's original total score.
    simulated=(n*s+100*k)/(n+k)
    prior=(n*s+100*(k-1))/(n+k-1)
    if simulated<98 or prior>=98:raise ValueError('QIS_100_CASE_SCENARIO_RECONCILIATION_FAILED')
    return {**result,'status':'below_98','additional_100':k,'projected_report_average':float(simulated)}

def choose_column(hits,label):
    if not hits:raise ValueError('QIS_PERSONAL_IDENTITY_COLUMN_MISSING:'+label)
    best=max(hits.values());cols=[col for col,n in hits.items() if n==best]
    if len(cols)!=1:raise ValueError('QIS_PERSONAL_IDENTITY_COLUMN_AMBIGUOUS:'+label)
    return cols[0]

def raw_cells(path,sheet):
    ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with ZipFile(path) as z:
        wb=ET.fromstring(z.read('xl/workbook.xml'))
        rid=next(x.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            for x in wb.find('m:sheets',ns) if x.attrib['name']==sheet)
        rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target=next(x.attrib['Target'] for x in rels if x.attrib['Id']==rid)
        member=target.lstrip('/') if target.startswith('/') else 'xl/'+target
        tree=ET.fromstring(z.read(member));out={}
        for cell in tree.findall('.//m:c',ns):
            v=cell.find('m:v',ns);f=cell.find('m:f',ns)
            numeric=cell.attrib.get('t') in (None,'n')
            out[cell.attrib['r']]={'raw':v.text if v is not None and numeric else None,'has_formula':f is not None,
                'kind':'formula-cached' if f is not None else 'numeric-xml-value' if v is not None and numeric
                    else 'non-numeric-xml-value' if v is not None else 'missing'}
        return out

def extract_personal_qis(path,roster,report_date,scope='北一二B'):
    path=Path(path);wb=load_workbook(path,data_only=True,read_only=True)
    if 'QIS個績' not in wb.sheetnames:raise ValueError('QIS_PERSONAL_SHEET_MISSING')
    ws=wb['QIS個績'];values=list(ws.iter_rows(values_only=True));wb.close()
    headers=[]
    for rn,row in enumerate(values[:30],1):
        counts=[i for i,x in enumerate(row) if text(x)=='計件數']
        scores=[i for i,x in enumerate(row) if text(x)=='原始分數']
        if counts:
            if len(counts)!=1 or len(scores)!=1:raise ValueError('QIS_PERSONAL_HEADER_MISMATCH')
            headers.append((rn,counts[0],scores[0]))
    if len(headers)!=1:raise ValueError('QIS_PERSONAL_HEADER_MISMATCH')
    header,count_col,score_col=headers[0]
    periods=[]
    for row in values[:header]:
        for value in row:
            match=re.fullmatch(r'(\d{4})/(\d{1,2})/(\d{1,2})\s*[~～]\s*(?:(\d{4})/)?(\d{1,2})/(\d{1,2})',text(value))
            if match:
                periods.append(date(int(match[4] or match[1]),int(match[5]),int(match[6])).isoformat())
    if len(set(periods))!=1 or periods[0]>report_date:raise ValueError('QIS_PERSONAL_CUTOFF_MISSING_OR_INVALID')
    source=[(rn,row) for rn,row in enumerate(values,1) if rn>header and text(scope) in map(text,row)]
    people={text(p['employee_id']):p for p in roster['persons']}
    stores={text(s['code']):s['name'] for s in roster['stores']}
    employee_hits,store_hits,name_hits=Counter(),Counter(),Counter()
    for _,row in source:
        matched=[people[text(v)] for v in row if text(v) in people]
        for i,v in enumerate(row):
            if text(v) in people:employee_hits[i]+=1
            if text(v) in stores:store_hits[i]+=1
            if any(text(v)==text(p['pname']) for p in matched):name_hits[i]+=1
    employee_col=choose_column(employee_hits,'employee');store_col=choose_column(store_hits,'store-code');name_col=choose_column(name_hits,'name')
    if len({employee_col,store_col,name_col,count_col,score_col})!=5:raise ValueError('QIS_PERSONAL_IDENTITY_COLUMN_OVERLAP')
    raw=raw_cells(path,'QIS個績');rows=[];seen=set()
    from openpyxl.utils import get_column_letter
    for rn,row in source:
        emp,name,store_code=text(row[employee_col]),text(row[name_col]),text(row[store_col])
        if not emp and not name:continue # formatted/summary rows are not employees
        if emp and emp in seen:raise ValueError('QIS_PERSONAL_DUPLICATE_EMPLOYEE')
        seen.add(emp)
        score_cell=f'{get_column_letter(score_col+1)}{rn}';count_cell=f'{get_column_letter(count_col+1)}{rn}'
        score_info=raw.get(score_cell,{})
        estimate=estimate_100_cases(raw.get(count_cell,{}).get('raw'),score_info.get('raw'))
        if not emp or not name or store_code not in stores:estimate['status']='pending';estimate['additional_100']=None
        store=stores.get(store_code,'待核店點');store='台北三創' if '三創' in store else store
        rows.append({**estimate,'store':store,'name':name or '待核姓名','employee_id':emp,'source_row':rn,
            'score_cell':score_cell,'count_cell':count_cell,'source_score_raw':score_info.get('raw'),
            'source_count_raw':raw.get(count_cell,{}).get('raw'),'score_value_kind':score_info.get('kind','missing')})
    below=sorted([r for r in rows if r['status']=='below_98'],key=lambda r:(-r['additional_100'],r['current_score'],r['source_row']))
    return {'schema':'north12b-personal-qis/v1','sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'cutoffDate':periods[0],'scope':scope,'header':{'row':header,'countColumn':count_col+1,'scoreColumn':score_col+1},
        'identityColumns':{'employee':employee_col+1,'storeCode':store_col+1,'name':name_col+1},'rows':rows,'below98':below,
        'noData':[r for r in rows if r['status']=='no_data'],'pending':[r for r in rows if r['status']=='pending'],
        'precisionNote':'依報表分數等權試算；臨界可能差1筆，實際以公司更新為準；未反推原始總分。'}
