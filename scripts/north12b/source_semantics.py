"""Source selection gates independent of delivery completeness and render reviews."""
VERSION='north12b-source-contract/v2'
PERSONAL_METRICS=['TTL AQ上線點數','AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上',
    'RT上線點數','RT V+D 999 (含)以上','RT V+D 1399 (含)以上','好速案銷售點數',
    '特殊維繫用戶續約數','配件及其他營收','包膜與保貼營收']

def same(actual,expected,label):
    if expected is None:
        assert actual=='尚未有資料',label
    else:
        assert isinstance(actual,(int,float)) and abs(actual-expected)<1e-8,label

def verify(book,kpi,source,daily,report_date):
    if report_date>='2026-09-01':
        managers=sorted([p for p in kpi['persons'] if p['role'] in {'店長','代理店長'}],key=lambda p:-(p['official'] or 0))
        assert managers,'MANAGER_PERSONAL_SOURCE_EMPTY'
        sheet=book['店長（含代理）']
        for rn,p in enumerate(managers,5):
            same(sheet.cell(rn,4).value,p['official'],'MANAGER_PERSONAL_OVERALL_MISMATCH')
            for i,key in enumerate(PERSONAL_METRICS):
                item=p['items'][key]
                same(sheet.cell(rn,6+i*3).value,item['a'],'MANAGER_PERSONAL_ACTUAL_MISMATCH')
                same(sheet.cell(rn,7+i*3).value,item['reportRate'],'MANAGER_PERSONAL_RATE_MISMATCH')
    for rn,row in enumerate(daily['summary'],3):
        same(book['加掛得分'].cell(rn,3).value,row['rank'],'ADDON_COMPANY_RANK_MISMATCH')
        expected=kpi['aggregateRates']['預付卡開卡面額'] if rn==3 else next(s for s in kpi['stores'] if s['name']==row['store'])['items']['預付卡開卡面額']['reportRate']
        same(book['主力KPI'].cell(rn,16).value,expected,'MAIN_PREPAID_SOURCE_MISMATCH')
    assert book['加掛得分'].cell(2,16).value=='Apple/Google服務及雜誌週刊開通數','ADDON_SERVICE_LABEL_MISMATCH'
    qis=source.get('QIS店績',{}).get('values',[])
    aggregate=next((r for r in qis if r[0]=='北一二區' and r[2]=='北一二B' and r[3]==9),None)
    if aggregate:
        same(book['QIS店績'].cell(3,6).value,aggregate[5],'QIS_SOURCE_AGGREGATE_MISMATCH')
    return VERSION
