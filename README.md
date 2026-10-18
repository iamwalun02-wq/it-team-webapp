# 侯中 IT Team 助手

青松侯寶垣中學 IT Team 用嘅簡易手機版一覽頁：今日器材借用、場地借用、未完成維修。

## 點樣開

**方法一（建議）：本機靜態伺服器**

```bash
cd intranet-webapp
python3 -m http.server 8080
```

之後用瀏覽器開：http://localhost:8080/

（直接雙擊 `index.html` 可能因瀏覽器保安限制讀唔到 JSON，所以建議用伺服器。）

**手機 PWA：** 用手機瀏覽器開上述網址 →「加到主畫面」。

## 更新資料

改 `data/latest.json` 即可。欄位說明：

| 欄位 | 意思 |
|------|------|
| `updatedAt` | ISO8601 更新時間 |
| `isExample` | `true` = 示範資料（頁面會顯示標籤） |
| `equipment` | 今日器材借用 |
| `venues` | 今日場地借用 |
| `maintenance` | 跟進中維修 |

之後可由 agent 登入內聯自動寫入真實資料，並將 `isExample` 設為 `false`。

## 檔案

- `index.html` — 主頁
- `styles.css` — 樣式
- `app.js` — 讀 JSON 並顯示
- `data/latest.json` — 資料
- `manifest.webmanifest` — PWA 設定
