"""Private daily sales view. Company achievement points remain untouched."""
import math
import re
from datetime import date, datetime, timedelta

DAILY_SHEET = '上線數KPI_每日上線'
FILM_SHEET = 'AQ其他-包膜與保貼營收'
MONEY = {'accessory_amount': '配件及其他營收', 'film_amount': '包膜與保貼營收'}


def text(value):
    return str(value or '').strip().replace('（', '(').replace('）', ')')


def short_store(value):
    value = text(value)
    return '三創' if '三創' in value else value.removeprefix('台北')


def number(value):
    if value in (None, '') or isinstance(value, bool):
        return None
    try:
        result = float(str(value).replace(',', ''))
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def day(value):
    if isinstance(value, (datetime, date)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    if isinstance(value, (int, float)) and 20000 < value < 100000:
        return (datetime(1899, 12, 30) + timedelta(days=value)).date().isoformat()
    value = text(value)
    for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%Y%m%d', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def cell(row, index):
    return row[index] if index is not None and index < len(row) else None


def detail_table(values):
    for i, row in enumerate(values[:20]):
        headers = {text(v): j for j, v in enumerate(row) if text(v)}
        if '統計日期' in headers and '營業店點代碼' in headers:
            return headers, values[i + 1:]
    return {}, []


def build_sales_metrics(book, stores, asof):
    order = [{'code': s['code'], 'store': short_store(s['name'])} for s in stores]
    codes = {s['code'] for s in order}
    names = {short_store(s['name']): s['code'] for s in stores}
    sections = {}
    section = None
    columns = {}
    issues = []
    for row in book.get(DAILY_SHEET, {}).get('values', []):
        label = text(cell(row, 0))
        if label == '北一二B' or short_store(label) in names:
            section = 'aggregate' if label == '北一二B' else names[short_store(label)]
            columns = {}
            sections.setdefault(section, {})
        dates = {i: day(v) for i, v in enumerate(row) if day(v)}
        if not label and len(dates) >= 2:
            columns = {i: d for i, d in dates.items() if d[:7] == asof[:7] and d <= asof}
        if section and label in MONEY.values():
            if label in sections[section]:
                raise ValueError('SALES_DUPLICATE_DAILY_ITEM ' + section + ' ' + label)
            sections[section][label] = {'total': number(cell(row, 1)),
                                      'days': {d: number(cell(row, i)) for i, d in columns.items()}}
    actual_days = sorted({d for items in sections.values() for data in items.values()
                          for d, v in data['days'].items() if v is not None})
    latest = actual_days[-1] if actual_days else None

    def amount(code, label):
        item = sections.get(code, {}).get(label)
        if not item or not latest or latest not in item['days']:
            return None
        result = item['days'][latest]
        # The source's sparse daily cells represent no transactions only when
        # the independently supplied month total reconciles with all days.
        total = item['total']
        if result is None and total is not None and abs(total - sum(v or 0 for v in item['days'].values())) < .01:
            result = 0
        return result

    rows = [{**s, **{key: amount(s['code'], label) for key, label in MONEY.items()},
             'vk_contracts': None, 'auto_film_month_count': None} for s in order]
    aggregate = {'code': 'aggregate', 'store': '北一二B整體',
                 **{key: amount('aggregate', label) for key, label in MONEY.items()},
                 'vk_contracts': None, 'auto_film_month_count': None}
    for key in MONEY:
        vals = [r[key] for r in rows]
        if all(v is not None for v in vals) and aggregate[key] is not None:
            if abs(sum(vals) - aggregate[key]) > .01:
                raise ValueError('SALES_MONEY_RECONCILIATION_FAILED ' + key)

    fh, film = detail_table(book.get(FILM_SHEET, {}).get('values', []))
    required = {'業務分區', '營業店點代碼', '統計日期', '商品名稱', '銷售筆數'}
    film_status = 'no_data'
    if required <= set(fh):
        counts = {code: 0 for code in codes}
        month_rows = 0
        bad = False
        for r in film:
            if text(cell(r, fh['業務分區'])) != '北一二B':
                continue
            dt = day(cell(r, fh['統計日期']))
            product = text(cell(r, fh['商品名稱']))
            if dt and (dt[:7] != asof[:7] or dt > asof):
                continue
            if dt:
                month_rows += 1
            if '自動保貼機適用款' not in product:
                continue
            code = text(cell(r, fh['營業店點代碼']))
            qty = number(cell(r, fh['銷售筆數']))
            if not dt or code not in codes or qty is None or not qty.is_integer():
                bad = True
                continue
            # Signed source quantities preserve return offsets. Count source
            # sales quantity, never rows, receipts or revenue / unit price.
            counts[code] += int(qty)
        if bad:
            film_status = 'partial'
            issues.append('AUTO_FILM_DETAIL_INVALID')
        elif month_rows:
            film_status = 'ok'
            for r in rows:
                r['auto_film_month_count'] = counts[r['code']]
            aggregate['auto_film_month_count'] = sum(counts.values())

    # Only transaction tables with an explicit contract ID can supply counts.
    # Never reinterpret MyVideo&KKBOX KPI points or Subscr_Id as contracts.
    tables = []
    for name, data in book.items():
        h, body = detail_table(data.get('values', []))
        contract = next((h[k] for k in ('合約編號', '合約號碼', 'Contract_Id', 'Contract_ID') if k in h), None)
        plan = [h[k] for k in ('世代', '網路世代', 'CATCH_BB資費分類', '資費分類', '用戶群組', '用戶群組名稱', '用戶群組分類', '群組分類', '方案名稱') if k in h]
        customer = [h[k] for k in ('Biz_Group', '用戶別', '客戶類型', '用戶類型', '用戶群組分類', '群組分類') if k in h]
        service = [h[k] for k in ('KPI項目', '商品名稱', '服務名稱', '加掛項目') if k in h]
        if contract is not None and plan and customer and ('MyVideo' in name or 'KKBOX' in name or service):
            tables.append((name, h, body, contract, plan, customer, service))
    vk_status = 'no_data'
    vk_audit = {'source_sheets': [t[0] for t in tables], 'eligible_rows': 0,
                'excluded_rows': 0, 'invalid_rows': 0, 'duplicate_rows': 0}
    if tables and latest:
        grouped = {}
        latest_rows = 0
        for name, h, body, contract, plan, customer, service in tables:
            for r in body:
                code = text(cell(r, h['營業店點代碼']))
                region = text(cell(r, h.get('業務分區')))
                if region and region != '北一二B':
                    continue
                if not region and code not in codes:
                    continue
                if not any(re.search(r'myvideo|kkbox', text(cell(r, i)), re.I) for i in service) and not re.search(r'myvideo|kkbox', name, re.I):
                    continue
                dt = day(cell(r, h['統計日期']))
                if dt and dt != latest:
                    continue
                if not dt or code not in codes:
                    vk_audit['invalid_rows'] += 1
                    continue
                latest_rows += 1
                customer_values = [text(cell(r, i)) for i in customer]
                if any(re.search(r'企客|企業|EBG|B2B|CORPORATE', v, re.I) for v in customer_values):
                    vk_audit['excluded_rows'] += 1
                    continue
                plan_values = [text(cell(r, i)) for i in plan]
                is_5g = any(re.search(r'(?<![A-Z0-9])5G(?![A-Z0-9])|5G', v, re.I) for v in plan_values)
                is_person = any(re.search(r'^CBG$|個人|一般|消費', v, re.I) for v in customer_values)
                if any(re.search(r'4G', v, re.I) for v in plan_values) and is_5g:
                    vk_audit['invalid_rows'] += 1
                    continue
                if not is_5g:
                    vk_audit['excluded_rows'] += 1
                    continue
                cid = text(cell(r, contract))
                if not is_person or not cid:
                    vk_audit['invalid_rows'] += 1
                    continue
                vk_audit['eligible_rows'] += 1
                grouped.setdefault(cid, set()).add(code)
        if not latest_rows and not vk_audit['invalid_rows']:
            vk_status = 'no_data'
            issues.append('VK_SOURCE_DATE_NOT_VERIFIED')
        elif vk_audit['invalid_rows'] or any(len(v) != 1 for v in grouped.values()):
            vk_status = 'partial'
            issues.append('VK_CONTRACT_DETAIL_INVALID')
        else:
            vk_status = 'ok'
            counts = {code: 0 for code in codes}
            for owners in grouped.values():
                counts[next(iter(owners))] += 1
            vk_audit['duplicate_rows'] = vk_audit['eligible_rows'] - len(grouped)
            for r in rows:
                r['vk_contracts'] = counts[r['code']]
            aggregate['vk_contracts'] = len(grouped)
    if vk_status == 'no_data':
        issues.append('VK_CONTRACT_DETAIL_PENDING')
    return {'schema': 'north12b-sales-metrics/v1', 'data_as_of_date': latest,
            'month': asof[:7], 'month_as_of_date': asof, 'rows': [aggregate] + rows,
            'status': {'money': 'ok' if latest and all(r[k] is not None for r in [aggregate]+rows for k in MONEY) else 'partial',
                       'vk': vk_status, 'auto_film': film_status},
            'vk_audit': vk_audit, 'issues': issues,
            'source_sheets': [DAILY_SHEET, FILM_SHEET] + vk_audit['source_sheets']}
