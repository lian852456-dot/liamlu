---
name: deploy
description: 完成 liamlu 專案的修改、測試、commit 並推送到 GitHub。在修改 index.html 或測試檔後使用。
---

# liamlu Deploy Skill

完成修改後，執行以下標準流程：

## 1. 執行測試

```bash
npm test
```

所有測試必須全部通過（目前 21 項）。若有失敗，先修正再繼續。

## 2. Commit

```bash
git config user.email noreply@anthropic.com
git config user.name Claude
git add index.html tests/app.spec.js
git commit -m "<描述這次修改的內容>"
```

## 3. 推送（需要 PAT token）

若使用者尚未提供 PAT token，請向使用者索取：
> 請到 GitHub → 右上角頭像 → Settings → Developer settings → Personal access tokens → Tokens (classic) → 點「claude push」或 Generate new token，複製貼給我。

取得 token 後執行推送，**推送完立即清除 token**：

```bash
git remote set-url origin https://<TOKEN>@github.com/lian852456-dot/liamlu.git
git push -u origin main
git remote set-url origin https://github.com/lian852456-dot/liamlu.git
```

## 安全規則

- **絕對不能**把 token 留在 remote URL 超過一次推送
- 推送後立即執行 `git remote set-url origin https://github.com/lian852456-dot/liamlu.git` 清除
- 提醒使用者可到 GitHub Settings 刪除已用過的 token

## 網址確認

推送成功後，使用者可至以下網址確認：
`https://lian852456-dot.github.io/liamlu/`

> 注意：GitHub Pages 部署約需 1-2 分鐘才會生效。本機可用 `file:///home/user/liamlu/index.html` 立即測試。
