import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/north12b'))
from sales_metrics import build_sales_metrics


class SalesMetricsTests(unittest.TestCase):
    def setUp(self):
        self.stores = [{'code':'A','name':'台北酒泉'},{'code':'B','name':'台北萬大'}]
        self.book = {'上線數KPI_每日上線': {'values': [
            ['北一二B'], ['', '合計', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
            ['配件及其他營收', 90000, 10000, 40000, 40000, None],
            ['包膜與保貼營收', 90, 20, 30, 40, None],
            ['台北酒泉'], ['', '合計', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
            ['配件及其他營收', 50000, 10000, None, 40000, None],
            ['包膜與保貼營收', 60, 20, None, 40, None],
            ['台北萬大'], ['', '合計', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
            ['配件及其他營收', 40000, None, 40000, None, None],
            ['包膜與保貼營收', 30, None, 30, None, None],
        ]}, 'AQ其他-包膜與保貼營收': {'values': [
            ['業務分區','營業店點代碼','統計日期','商品名稱','銷售筆數'],
            ['北一二B','A','2026-10-01','保護貼(自動保貼機適用款)',3],
            ['北一二B','A','2026-10-02','保護貼（自動保貼機適用款）',-1],
            ['北一二B','B','2026-10-03','一般包膜',5],
            ['北一二B','B','2026-09-30','保護貼(自動保貼機適用款)',7],
            ['北一二B','B','2026-10-04','保護貼(自動保貼機適用款)',9],
        ]}}

    def vk(self, rows):
        self.book['VK明細']={'values':[
            ['業務分區','營業店點代碼','統計日期','KPI項目','合約編號','CATCH_BB資費分類','Biz_Group']
        ]+rows}

    def build(self):
        return build_sales_metrics(self.book,self.stores,'2026-10-03')

    def test_latest_day_and_sparse_zero_with_high_revenue(self):
        m=self.build()
        self.assertEqual(m['data_as_of_date'],'2026-10-03')
        self.assertEqual([r['accessory_amount'] for r in m['rows']],[40000,40000,0])
        self.assertEqual([r['film_amount'] for r in m['rows']],[40,40,0])

    def test_month_quantity_returns_and_period(self):
        self.assertEqual([r['auto_film_month_count'] for r in self.build()['rows']],[2,2,0])

    def test_union_dedup_and_exclusions(self):
        self.vk([
            ['北一二B','A','2026-10-03','MyVideo','same','5G 299','CBG'],
            ['北一二B','A','2026-10-03','KKBOX','same','5G 299','CBG'],
            ['北一二B','B','2026-10-03','MyVideo','other','5G 599','CBG'],
            ['北一二B','B','2026-10-03','MyVideo','corp','5G 599','EBG'],
            ['北一二B','B','2026-10-03','KKBOX','four','4G 999','CBG'],
            ['北一二B','B','2026-10-02','KKBOX','old','5G 599','CBG'],
        ])
        m=self.build()
        self.assertEqual([r['vk_contracts'] for r in m['rows']],[2,1,1])
        self.assertEqual(m['vk_audit']['duplicate_rows'],1)
        self.assertEqual(m['vk_audit']['excluded_rows'],2)

    def test_missing_details_never_become_kpi_points(self):
        m=self.build()
        self.assertEqual(m['status']['vk'],'no_data')
        self.assertTrue(all(r['vk_contracts'] is None for r in m['rows']))

    def test_prior_day_details_are_not_todays_zero(self):
        self.vk([['北一二B','A','2026-10-02','MyVideo','old','5G 599','CBG']])
        self.assertEqual(self.build()['status']['vk'],'no_data')
        self.assertIsNone(self.build()['rows'][0]['vk_contracts'])

    def test_cross_workbook_services_deduplicate_together(self):
        self.vk([['北一二B','A','2026-10-03','MyVideo','same','5G 599','CBG']])
        self.book['AQ.xlsx/MyVideo']=self.book.pop('VK明細')
        extra=copy.deepcopy(self.book['AQ.xlsx/MyVideo'])
        extra['values'][1][3]='KKBOX'
        self.book['RT.xlsx/KKBOX']=extra
        self.assertEqual(self.build()['rows'][0]['vk_contracts'],1)

    def test_blank_contract_and_unknown_eligibility_remain_pending(self):
        for cid, customer in [('', 'CBG'),('known','unknown')]:
            self.vk([['北一二B','A','2026-10-03','MyVideo',cid,'5G 599',customer]])
            self.assertEqual(self.build()['status']['vk'],'partial')
            self.assertIsNone(self.build()['rows'][0]['vk_contracts'])

    def test_cross_store_duplicate_is_not_assigned_arbitrarily(self):
        self.vk([['北一二B',c,'2026-10-03','KKBOX','same','5G 599','CBG'] for c in ['A','B']])
        self.assertEqual(self.build()['status']['vk'],'partial')

    def test_missing_month_total_is_not_zero(self):
        self.book['上線數KPI_每日上線']['values'][-2][1]=None
        self.assertIsNone(self.build()['rows'][2]['accessory_amount'])

    def test_money_mismatch_fails(self):
        self.book['上線數KPI_每日上線']['values'][2][4]=999
        with self.assertRaisesRegex(ValueError,'SALES_MONEY_RECONCILIATION_FAILED'):
            self.build()

    def test_missing_quantity_does_not_silently_understate_total(self):
        self.book['AQ其他-包膜與保貼營收']['values'][1][-1]=None
        m=self.build()
        self.assertEqual(m['status']['auto_film'],'partial')
        self.assertIsNone(m['rows'][0]['auto_film_month_count'])

if __name__=='__main__':
    unittest.main()
