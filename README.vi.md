<p align="center">
  <img src="public/images/logo-brand.png" width="360" alt="星枢OpenClaw">
</p>

<p align="center">
  Bảng quản lý OpenClaw với Trợ lý AI tích hợp — Cài đặt, Cấu hình, Chẩn đoán & Sửa lỗi một cú nhấp
</p>

<p align="center">
  <a href="README.md">🇨🇳 中文</a> | <a href="README.en.md">🇺🇸 English</a> | <a href="README.zh-TW.md">🇹🇼 繁體中文</a> | <a href="README.ja.md">🇯🇵 日本語</a> | <a href="README.ko.md">🇰🇷 한국어</a> | <strong>🇻🇳 Tiếng Việt</strong> | <a href="README.es.md">🇪🇸 Español</a> | <a href="README.pt.md">🇧🇷 Português</a> | <a href="README.ru.md">🇷🇺 Русский</a> | <a href="README.fr.md">🇫🇷 Français</a> | <a href="README.de.md">🇩🇪 Deutsch</a>
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
  <img src="docs/feature-showcase.gif" width="800" alt="星枢OpenClaw Showcase">
</p>

星枢OpenClaw là bảng quản lý trực quan cho framework AI Agent [OpenClaw](https://github.com/openclaw/openclaw). Tích hợp **trợ lý AI thông minh**, giúp bạn cài đặt OpenClaw một cú nhấp, tự động chẩn đoán cấu hình, xử lý sự cố và sửa lỗi. 8 công cụ + 4 chế độ + hỏi đáp tương tác — dễ dàng quản lý cho cả người mới và chuyên gia.

> 🌐 **Website**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) | 📦 **Tải xuống**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest)

### 🔥 Hỗ trợ Bo mạch phát triển / Thiết bị nhúng

- **Orange Pi / Raspberry Pi / RK3588** — `npm run serve` để chạy
- **Armbian / Debian / Ubuntu Server** — Tự động phát hiện kiến trúc

## Cộng đồng

Cộng đồng các nhà phát triển và người dùng đam mê AI Agent — hãy tham gia!

<p align="center">
  <a href="https://discord.gg/U9AttmsNHh"><strong>Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/discussions"><strong>Discussions</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/issues/new"><strong>Báo cáo Issue</strong></a>
</p>

## Tính năng

- **🤖 Trợ lý AI (Mới)** — Trợ lý AI tích hợp, 4 chế độ + 8 công cụ + hỏi đáp tương tác
- **🖼️ Nhận dạng hình ảnh** — Dán ảnh chụp màn hình hoặc kéo thả hình ảnh, AI tự động phân tích
- **Bảng điều khiển** — Tổng quan hệ thống, giám sát dịch vụ thời gian thực
- **Quản lý dịch vụ** — Khởi động/dừng OpenClaw, phát hiện phiên bản & nâng cấp một cú nhấp
- **Cấu hình mô hình** — Quản lý nhiều nhà cung cấp, kiểm tra kết nối hàng loạt, kéo sắp xếp
- **Cấu hình Gateway** — Cổng, phạm vi truy cập, Token xác thực, Tailscale
- **Kênh nhắn tin** — Quản lý thống nhất Telegram, Discord, Feishu, DingTalk, QQ
- **Truyền thông & Tự động hóa** — Cài đặt tin nhắn, phát sóng, Webhook, phê duyệt
- **Phân tích sử dụng** — Sử dụng Token, chi phí API, xếp hạng mô hình/nhà cung cấp
- **Quản lý Agent** — CRUD Agent, chỉnh sửa danh tính, quản lý workspace
- **Trò chuyện** — Streaming, hiển thị Markdown, quản lý phiên
- **Tác vụ định kỳ** — Thực thi theo lịch Cron, gửi đa kênh
- **Xem nhật ký** — Nhật ký thời gian thực đa nguồn và tìm kiếm
- **Quản lý bộ nhớ** — Xem/sửa tệp bộ nhớ, xuất ZIP, chuyển Agent
- **Công cụ mở rộng** — Quản lý tunnel cftunnel, giám sát ClawApp
- **Giới thiệu** — Thông tin phiên bản, liên kết cộng đồng, dự án liên quan

## Tải xuống & Cài đặt

Truy cập [Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) để tải phiên bản mới nhất:

| Nền tảng | Trình cài đặt |
|----------|--------------|
| **macOS Apple Silicon** | `.dmg` (aarch64) |
| **macOS Intel** | `.dmg` (x64) |

### Linux Server (Phiên bản Web)

```bash
curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh
```

## Bắt đầu nhanh

1. **Thiết lập ban đầu** — Lần chạy đầu tự động phát hiện Node.js, Git, OpenClaw. Cài đặt một cú nhấp nếu thiếu
2. **Cấu hình mô hình** — Thêm nhà cung cấp AI (DeepSeek, OpenAI, Ollama, v.v.) và kiểm tra kết nối
3. **Khởi động Gateway** — Vào Quản lý dịch vụ, nhấp "Khởi động". Trạng thái xanh = sẵn sàng
4. **Bắt đầu trò chuyện** — Vào Chat trực tiếp, chọn mô hình và bắt đầu cuộc trò chuyện

## Kiến trúc kỹ thuật

| Lớp | Công nghệ | Mô tả |
|-----|-----------|-------|
| Frontend | Vanilla JS + Vite | Không framework, nhẹ |
| Backend | Rust + Tauri v2 | Hiệu năng native, đa nền tảng |
| Giao tiếp | Tauri IPC + Shell Plugin | Cầu nối frontend-backend |
| Style | Pure CSS (CSS Variables) | Theme tối/sáng |

## Build từ mã nguồn

```bash
git clone https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
cd tulu-openclaw-v2 && npm install

# Desktop (cần Rust + Tauri v2)
npm run tauri dev        # Phát triển
npm run tauri build      # Production

# Chỉ Web (không cần Rust)
npm run dev              # Hot reload
npm run build && npm run serve  # Production
```

## Dự án liên quan

| Dự án | Mô tả |
|-------|-------|
| [OpenClaw](https://github.com/openclaw/openclaw) | Framework AI Agent |
| [ClawApp](https://github.com/TuLu-openclaw/clawapp) | Ứng dụng chat di động đa nền tảng |
| [cftunnel](https://github.com/TuLu-openclaw/cftunnel) | Công cụ Cloudflare Tunnel |

## Đóng góp

Chào đón Issue và Pull Request. Xem [CONTRIBUTING.md](CONTRIBUTING.md).


## Sponsor

If you find this project useful, consider supporting us via USDT (BNB Smart Chain):

<img src="public/images/bnbqr.jpg" alt="Sponsor QR" width="180">

```
0xbdd7ebdf2b30d873e556799711021c6671ffe88f
```

## Contact

- **Email**: [support@qctx.net](mailto:support@qctx.net)
- **Product**: [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)

## Giấy phép

[AGPL-3.0](LICENSE). Liên hệ để được cấp phép thương mại.

© 2026 QingchenCloud | [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)
