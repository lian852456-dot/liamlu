# 北一二B 21:45 LINE 最終收官

正常戰報只輸出門市正式 21:00 回報的下列內容：

- ⭐ A999
- 👑 A1399
- ⚡ 好速
- 📶 R999
- 🌐 R1399
- ☂️ 保險搭售分子／分母
- 🎯 管理重點
  - OP 上線／累積／目標
  - ⚡ MyCharge EBM 系統貼標點選：已點選／今日貼標數＝點選率

不再輸出台獎、設備案、KPI 達成率、公司排名、掛蛋清單、低標清單或其他提醒。

資料來源仍保留既有主要來源重試與 Sheets 備援，並保留同店最新提交判定。已提交但單欄空白顯示「資料未取得」，整店沒有 21:00 正式列則顯示「未回報」。

管理重點使用每日回報欄位 `management_focus_json`。2026-10 目前包含：
`op_online`、`op_accum`、`op_target`、`mycharge_clicked`、`mycharge_tagged`、`mycharge_pct`。

正式 Mac runner 仍沿用既有 LINE sender、收件者、token、ledger 與 LaunchAgent `com.liam.north12b.evening-line`，只替換資料契約與組字內容。
