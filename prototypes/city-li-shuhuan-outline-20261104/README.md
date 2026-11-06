# V 領局部更新 · p5-vneck.1

本人追加 V 領與自然胸線要求，沿同一樣板修改黑色長袖剪裁與原上胸連續曲面，修掉領緣膚色穿插點。臉、髮型、設定與隔離服務 SHA 未變。

最新圖為 tools/p5-vneck-{front,quarter,side}.png 與 p5-vneck-close-{front,quarter}.png；換裝及零瀏覽器錯誤收據為 tools/p5-vneck-review.json，公開模組讀回 evidence/vneck-public-readback.json。先前 p5-new／p5-hair 圖保留為改 V 領之前的歷史，不代表最新服裝。

# 李舒緩獨立修長造型 · 2026-11-04

使用者接受嘉玲修長風格後，指定下一位先做李舒緩（5514420），沿本人照片的側分深色長髮、黑色紋理長袖、駝色高腰短裙與苗條身形。這是獨立造型樣板；員編只作人工核對，不設真人員編登入，也未綁定或覆寫既有角色。

`node server.mjs` 啟動 127.0.0.1:4798。預設只看新版，可拖曳旋轉，並切正面／45度／側面／背面、走路、坐下、制服及不同光線。選用的左側比較是早期 Q2 試作，不是正式城市快照；採用同鏡頭、同燈光、同尺度與腳底基準。

本樣板使用單獨 `.private-v42-li-shuhuan-outline` 合成資料，沒有開啟共用城市兩份存檔。原 UID、金幣、寵物、物品與位置保持不動，200 金幣沒有重發。新造型未發布到共用城市。

只驗必要造型與動作，未重跑多人全套及 20 次切換。iPhone Safari 實機驗收仍待；桌機渲染檢查不能替代手機驗收。實際截圖、檢查結果與公開資產讀回另存 tools／evidence。

## 最終檢查與版本辨識

最終髮型為 `assets/portrait-hair/p5-outline-receipt.json` 的 SHA，側分斜掃、兩側量感不對稱，髮尾內彎且長短有變化。最新正／45／側／背真圖是 `tools/p5-hair-*.png`，公開入口單人正／45及城市白天圖是 `evidence/p5-new-*.png`、`evidence/p5-city-day.png`。`tools/p5-{front,quarter,side,back,sit,walk,uniform-wave}.png` 是髮型最後局修之前的身形／動作證據，不當成最終髮型圖。

公開入口7個資產 SHA 相符，私有路徑404；真瀏覽器進入公開預覽、建立隔離 p5 會話及城市GLB載入成功，pageerror為0、contextLost為false。桌機單人預覽短取樣 p50 約8.3ms／p95約9.8ms，這不是手機或長時間效能結論。

髮型仍是連續體量加髮流脊線，未達精修CG的細碎髮束；坐裙是手作姿態變形，未做布料物理。外觀以使用者實際審閱為準。
