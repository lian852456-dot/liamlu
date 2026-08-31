'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Questions = require('../patrol-question-versions.js');

const root = path.resolve(__dirname, '..');
const patrol = fs.readFileSync(path.join(root, 'patrol.html'), 'utf8');

test('新版題目依圖片固定為 25 項與三個頻率群組', () => {
  assert.equal(Questions.EFFECTIVE_DATE, '2026-09-01');
  assert.equal(Questions.SEP25_ITEMS.length, 25);
  assert.deepEqual(Questions.SEP25_ITEMS.map(item => item.no), Array.from({ length:25 }, (_, index) => index + 1));
  assert.deepEqual(Questions.SEP25_GROUPS.monthly, [1,2,3,4,5,6,7,8,9]);
  assert.deepEqual(Questions.SEP25_GROUPS.bimonthly, [10]);
  assert.deepEqual(Questions.SEP25_GROUPS.ncc, [11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]);
  assert.ok(Questions.SEP25_GROUPS.monthly.every(no => Questions.SEP25_BY_NO[no].rule === 'monthly'));
  assert.equal(Questions.SEP25_BY_NO[10].rule, 'bimonthly');
  assert.ok(Questions.SEP25_GROUPS.ncc.every(no => Questions.SEP25_BY_NO[no].rule === 'monthly'));
});

test('圖片權威文字逐題鎖定且不覆蓋舊 ITEM_TEXT', () => {
  const expected = [
    '督導打卡',
    '(第一次巡檢)，1.檢查店格陳列(含招牌、布旗、中島、電視是否有聲音…等)2.展機、配件防盜功能皆正常 3.確認門市前後場環境整潔且無非公司商品',
    '(第二次巡檢)，1.檢查店格陳列(含招牌、布旗、中島、電視是否有聲音…等)2.展機、配件防盜功能皆正常 3.確認門市前後場環境整潔且無非公司商品',
    '每月1次，1.觀察同仁服裝儀容及服務過程是否熱情並符合規範2.人員出勤與班表一致並詳載休息時間',
    '每月1次，人員面談及輔導（營業績管理重點指導、帳務缺失、客訴案件關懷輔導、遠端祕客查核常見缺失輔導、QIS…等）',
    '每月1次，1.門市安全檢查:所有同仁不可於門市承租範圍抽菸及進行任何有火源的私人活動2.檢查門市現場/回放監控設備運作正常(須清晰不可模糊/麥克風須正常收音)',
    '每月1次，抽查前台一台電腦及後場店長桌電腦是否含有個資並立即刪除；檢查紙本文件與電腦各資料夾及mail，含個資資料需加密；否則一律刪除；且上傳系統之文件，無須紙本回送，就地銷毀無須保留',
    '每月1次，1.確認門市落實填寫店務日誌及安全衛生檢查表2.確認待銷毀文件以信封袋或紙袋打包歸檔(不可使用塑膠袋提醒迴紋針需移除)，上鎖於監視器可涵蓋範圍的文件櫃，並符合保存期限 3.檢查放置手機、平板、配件…等有價商品的櫃子是否有鑰匙',
    '每月1次，保全金、零找金、當日營收現金盤點、查核金庫登記表',
    '2個月1次，督導到店全盤作業（含手機、配件、卡類…等POS所有庫存）並落實商品盤差登載',
    '(以下15項NCC宣導每月1次) 請確認同仁知悉：國家通訊傳播委員會業於114年9月26日公布「電信事業提供電信服務風險管理機制指引」。',
    '請確認同仁知悉：受理電信服務申請時，需檢核之證件包含申請人（法人及自然人）及其委託代理人，均應納入KYC審核。',
    '請確認同仁知悉：申請人或其委託代理人拒絕提供相關資料、不配合者應拒絕其辦理。',
    '請確認同仁知悉：公司已成立查核部門，並將每月辦理抽測查核。',
    '請確認同仁知悉：自然人申請電信服務時，應出示雙證件正本供業者核對及留存影本或影像檔。雙證件規範須依行動寬頻服務契約辦理。',
    '請確認同仁知悉：法人、團體或商號申請電信服務時，應出示法人代表人、團體代表人或商號負責人之身分證明文件正本、政府主管機關核發之法人證明文件、商業登記證明文件供業者核對及留存影本或影像檔。雙證件規範須依行動寬頻服務契約辦理。',
    '請確認同仁知悉：法人、團體或商號申請以不得逾員工人數為原則。企業客戶應說明使用用途、製作使用清冊，以備查證，應實地查看經營業務與其申請門號及用途是否相符，相關實地查訪紀錄應以書面留存。',
    '請確認同仁知悉：委託代理人申請辦理時，該代理人並應出示身分證正本及已得合法授權之資料或文件供核對及留存影本或影像檔。',
    '請確認同仁知悉：初次申辦行動電信門號者，須臨櫃辦理，或以符合電子簽章法之數位簽章方式簽署，或派員親訪申辦。',
    '請確認同仁知悉：對於初次申辦行動通信門號者應即時拍照留存。受理電信服務所保留的影本、照片或影像檔，應至少保存至服務契約終止後一年，以供查核。',
    '請確認同仁知悉：非本國籍人士申辦30天內短效期預付卡，於採取相當風險管控措施下，始得不須現場拍照留存。',
    '請確認同仁知悉：非本國籍人士申辦門號以1門為原則，申請逾1門者應說明使用目的並提出相關證明文件或切結書，應依KYC實質審核其用途及目的並予以酌核。',
    '請確認同仁知悉：非本國籍人士提出簽證期日資料，倘申請人簽證期日少於1個月，僅能申辦提供30天內之短效期預付卡。',
    '請確認同仁知悉：曾因使用或提供電信服務進行詐欺，受司法警察機關通知限制或停止電信服務之法人、非法人團體、商號，其代表人再以不同法人、非法人團體、商號之名義向同一電信事業申請電信服務時，該電信事業應於受限制或停止通知之日起三年內限制其至多申請一門用戶號碼或一項電信服務。但法人、非法人團體、商號仍有該電信事業提供之其他用戶號碼或電信服務時，電信事業於受限制或停止通知之日起三年內不得受理其申請。',
    '請確認同仁知悉：受電信事業限制或停止電信服務之用戶，向同一電信事業再度申請電信服務時，該電信事業應於受限制或停止通知之日起三年內限制其至多申請一門用戶號碼或一項電信服務。但用戶仍有該電信事業提供之其他用戶號碼或電信服務時，電信事業於受限制或停止通知之日起三年內不得受理其申請。'
  ];
  assert.deepEqual(Questions.SEP25_ITEMS.map(item => item.text), expected);
  assert.match(patrol, /const ITEM_TEXT = \{[\s\S]*33:"知悉：受限用戶3年再申辦限制"[\s\S]*\};/);
});

test('每筆日期決定題目版本，8月第33題保留、9月第26題拒絕', () => {
  assert.equal(Questions.totalForRow({ fillTime:'2026/8/31 23:59' }), 33);
  assert.equal(Questions.totalForRow({ fillTime:'2026/9/1 00:00' }), 25);
  assert.equal(Questions.itemAllowedForRow({ fillTime:'2026/8/31 23:59' }, 33), true);
  assert.equal(Questions.itemAllowedForRow({ fillTime:'2026/9/1 00:00' }, 25), true);
  assert.equal(Questions.itemAllowedForRow({ fillTime:'2026/9/1 00:00' }, 26), false);
});

test('9–10月共用第10題雙月進度，月檢與NCC仍各自按月', () => {
  const store = { code:'DNB10082', name:'台北永吉' };
  const september = [
    ...[1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25].map(item => ({ fillTime:'2026/9/8 10:00', month:'2026-09', code:store.code, store:store.name, item, result:'v' })),
    { fillTime:'2026/10/3 10:00', month:'2026-10', code:store.code, store:store.name, item:10, result:'v' }
  ];
  const sep = Questions.overview(september, [store], '2026-09').stores[0];
  assert.equal(sep.done, 25);
  assert.equal(sep.monthly.completed, 9);
  assert.equal(sep.bimonthly.completed, 1);
  assert.equal(sep.ncc.completed, 15);

  const october = Questions.overview(september, [store], '2026-10').stores[0];
  assert.equal(october.bimonthly.completed, 1);
  assert.equal(october.monthly.completed, 0);
  assert.equal(october.ncc.completed, 0);
  assert.equal(october.missingItems, 24);
});

test('新版正式明細延續 v、result na、reason na 均視為已勾核', () => {
  const base = {fillTime:'2026/9/2 10:00', month:'2026-09', code:'DNB10082', store:'台北永吉'};
  const rows = [
    {...base, item:1, result:'v', reason:''},
    {...base, item:2, result:'na', reason:''},
    {...base, item:3, result:'', reason:'NA'},
  ];
  assert.equal(Questions.itemStatus(rows, '2026-09', 1).status, 'done');
  assert.equal(Questions.itemStatus(rows, '2026-09', 2).status, 'done');
  assert.equal(Questions.itemStatus(rows, '2026-09', 3).status, 'done');
});

test('9月完成率與缺項只採新版25題，不要求26–33', () => {
  const store = { code:'DNB10082', name:'台北永吉' };
  const rows = Array.from({ length:25 }, (_, index) => ({
    fillTime:'2026/9/8 10:00', month:'2026-09', code:store.code, store:store.name,
    item:index + 1, result:index === 24 ? '' : 'v'
  }));
  const summary = Questions.overview(rows, [store], '2026-09').stores[0];
  assert.equal(summary.done, 24);
  assert.equal(summary.missingItems, 1);
  assert.deepEqual(summary.missingItemNumbers, [25]);
  assert.equal(summary.pct, 96);
});
