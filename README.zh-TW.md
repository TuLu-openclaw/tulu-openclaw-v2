<p align="center">
  <img src="public/images/logo-brand.png" width="360" alt="星枢OpenClaw">
</p>

<p align="center">
  內建 AI 助手的 OpenClaw 管理面板 — 一鍵安裝、設定、診斷、修復
</p>

<p align="center">
  <a href="README.md">🇨🇳 中文</a> | <a href="README.en.md">🇺🇸 English</a> | <strong>🇹🇼 繁體中文</strong> | <a href="README.ja.md">🇯🇵 日本語</a> | <a href="README.ko.md">🇰🇷 한국어</a> | <a href="README.vi.md">🇻🇳 Tiếng Việt</a> | <a href="README.es.md">🇪🇸 Español</a> | <a href="README.pt.md">🇧🇷 Português</a> | <a href="README.ru.md">🇷🇺 Русский</a> | <a href="README.fr.md">🇫🇷 Français</a> | <a href="README.de.md">🇩🇪 Deutsch</a>
</p>

<p align="center">
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest">
    <img src="https://img.shields.io/github/v/release/TuLu-openclaw/tulu-openclaw-v2?style=flat-square&color=6366f1" alt="Release">
  </a>
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest">
    <img src="https://img.shields.io/github/downloads/TuLu-openclaw/tulu-openclaw-v2/total?style=flat-square&color=8b5cf6" alt="Downloads">
  </a>
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square" alt="License">
  </a>
</p>

---

<p align="center">
  <img src="docs/feature-showcase.gif" width="800" alt="星枢OpenClaw 功能展示">
</p>

星枢OpenClaw 是 [OpenClaw](https://github.com/openclaw/openclaw) AI Agent 框架的視覺化管理面板。**內建智慧 AI 助手**，幫你一鍵安裝 OpenClaw、自動診斷設定、排查問題、修復錯誤。8 大工具 + 4 種模式 + 互動式問答，從新手到老手都能輕鬆管理。

> 🌐 **官網**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) | 📦 **下載**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest)

### 🔥 開發板 / 嵌入式裝置支援

- **Orange Pi / 樹莓派 / RK3588** — `npm run serve` 即可執行
- **Armbian / Debian / Ubuntu Server** — 自動偵測架構

## 社群

一群對 AI Agent 充滿熱情的開發者和玩家，歡迎加入交流。

<p align="center">
  <a href="https://discord.gg/U9AttmsNHh"><strong>Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/discussions"><strong>Discussions</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/issues/new"><strong>回報 Issue</strong></a>
</p>

## 功能特性

- **🤖 AI 助手（全新）** — 內建 AI 助手，4 種模式 + 8 大工具 + 互動式問答
- **🖼️ 圖片辨識** — 貼上截圖或拖曳圖片，AI 自動辨識分析
- **儀表板** — 系統概覽，即時服務狀態監控，快捷操作
- **服務管理** — OpenClaw 啟停控制、版本偵測與一鍵升級
- **模型設定** — 多服務商管理、批次連通性測試、拖曳排序、自動儲存
- **閘道設定** — 埠口、存取權限、認證 Token、Tailscale
- **訊息頻道** — 統一管理 Telegram、Discord、飛書、釘釘、QQ
- **通訊與自動化** — 訊息設定、廣播策略、Webhook、執行審批
- **使用情況** — Token 用量、API 費用、模型/服務商排行
- **Agent 管理** — Agent 增刪改查、身分編輯、工作區管理
- **聊天** — 串流回應、Markdown 渲染、對話管理
- **定時任務** — Cron 定時執行，多頻道投遞
- **日誌檢視** — 多來源即時日誌與關鍵字搜尋
- **記憶管理** — 記憶檔案檢視/編輯、ZIP 匯出、Agent 切換
- **擴充工具** — cftunnel 隧道管理、ClawApp 狀態監控
- **關於** — 版本資訊、社群入口、相關專案連結

## 下載安裝

前往 [Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) 下載最新版本：

| 平台 | 安裝檔 |
|------|--------|
| **macOS Apple Silicon** | `.dmg` (aarch64) |
| **macOS Intel** | `.dmg` (x64) |

### Linux 伺服器（Web 版）

```bash
curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh
```

## 快速上手

1. **初始設定** — 首次啟動自動偵測 Node.js、Git、OpenClaw。未安裝則一鍵安裝
2. **設定模型** — 新增 AI 服務商（DeepSeek、OpenAI、Ollama 等），測試連線
3. **啟動 Gateway** — 前往服務管理，點擊「啟動」。綠色狀態 = 就緒
4. **開始聊天** — 前往即時聊天，選擇模型後開始對話

## 🤖 AI 助手亮點

可**直接操作系統**的 AI 助手 — 診斷、修復、甚至提交 PR。

### 四種模式

| 模式 | 工具 | 寫入檔案 | 確認 | 適用場景 |
|------|------|---------|------|---------|
| **聊天** 💬 | ❌ | ❌ | — | 純問答 |
| **規劃** 📋 | ✅ | ❌ | ✅ | 讀取設定/日誌，輸出方案 |
| **執行** ⚡ | ✅ | ✅ | ✅ | 正常作業，危險操作需確認 |
| **無限** ∞ | ✅ | ✅ | ❌ | 全自動 |

## 技術架構

| 層級 | 技術 | 說明 |
|------|------|------|
| 前端 | Vanilla JS + Vite | 零框架依賴，輕量 |
| 後端 | Rust + Tauri v2 | 原生效能，跨平台 |
| 通訊 | Tauri IPC + Shell Plugin | 前後端橋接 |
| 樣式 | Pure CSS (CSS Variables) | 暗色/亮色主題 |

## 從原始碼建置

```bash
git clone https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
cd tulu-openclaw-v2 && npm install

# 桌面版（需要 Rust + Tauri v2）
npm run tauri dev        # 開發
npm run tauri build      # 正式版

# 僅 Web（無需 Rust）
npm run dev              # 熱更新開發
npm run build && npm run serve  # 正式版
```

## 相關專案

| 專案 | 說明 |
|------|------|
| [OpenClaw](https://github.com/openclaw/openclaw) | AI Agent 框架 |
| [ClawApp](https://github.com/TuLu-openclaw/clawapp) | 跨平台行動聊天客戶端 |
| [cftunnel](https://github.com/TuLu-openclaw/cftunnel) | Cloudflare Tunnel 工具 |

## 貢獻

歡迎提交 Issue 和 Pull Request。詳見 [CONTRIBUTING.md](CONTRIBUTING.md)。


## Sponsor

If you find this project useful, consider supporting us via USDT (BNB Smart Chain):

<img src="public/images/bnbqr.jpg" alt="Sponsor QR" width="180">

```
0xbdd7ebdf2b30d873e556799711021c6671ffe88f
```

## Contact

- **Email**: [support@qctx.net](mailto:support@qctx.net)
- **Product**: [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)

## 授權條款

[AGPL-3.0](LICENSE) 開源授權。商用需求請聯繫取得商業授權。

© 2026 QingchenCloud | [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)
