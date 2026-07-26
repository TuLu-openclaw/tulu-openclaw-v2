<p align="center">
  <img src="public/images/logo-brand.png" width="360" alt="星枢OpenClaw">
</p>

<p align="center">
  Панель управления OpenClaw со встроенным ИИ-ассистентом — Установка, Настройка, Диагностика и Исправление в один клик
</p>

<p align="center">
  <a href="README.md">🇨🇳 中文</a> | <a href="README.en.md">🇺🇸 English</a> | <a href="README.zh-TW.md">🇹🇼 繁體中文</a> | <a href="README.ja.md">🇯🇵 日本語</a> | <a href="README.ko.md">🇰🇷 한국어</a> | <a href="README.vi.md">🇻🇳 Tiếng Việt</a> | <a href="README.es.md">🇪🇸 Español</a> | <a href="README.pt.md">🇧🇷 Português</a> | <strong>🇷🇺 Русский</strong> | <a href="README.fr.md">🇫🇷 Français</a> | <a href="README.de.md">🇩🇪 Deutsch</a>
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

星枢OpenClaw — это визуальная панель управления для фреймворка AI-агентов [OpenClaw](https://github.com/openclaw/openclaw). Со **встроенным интеллектуальным ИИ-ассистентом**, который помогает установить OpenClaw одним кликом, автоматически диагностировать конфигурации, устранять неполадки и исправлять ошибки. 8 инструментов + 4 режима + интерактивный Q&A — удобное управление для новичков и экспертов.

> 🌐 **Сайт**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) | 📦 **Скачать**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest)

### 🔥 Поддержка плат разработки / Встраиваемых устройств

- **Orange Pi / Raspberry Pi / RK3588** — `npm run serve` для запуска
- **Armbian / Debian / Ubuntu Server** — Автоопределение архитектуры

## Сообщество

Сообщество увлечённых разработчиков и пользователей AI-агентов — присоединяйтесь!

<p align="center">
  <a href="https://discord.gg/U9AttmsNHh"><strong>Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/discussions"><strong>Discussions</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/issues/new"><strong>Сообщить об Issue</strong></a>
</p>

## Возможности

- **🤖 ИИ-ассистент (Новый)** — Встроенный ИИ-ассистент, 4 режима + 8 инструментов + интерактивный Q&A
- **🖼️ Распознавание изображений** — Вставьте скриншот или перетащите изображение, ИИ автоматически анализирует
- **Панель мониторинга** — Обзор системы, мониторинг сервисов в реальном времени
- **Управление сервисами** — Запуск/остановка OpenClaw, обнаружение версии и обновление одним кликом
- **Настройка моделей** — Управление несколькими провайдерами, пакетное тестирование подключения, сортировка перетаскиванием
- **Настройка Gateway** — Порт, область доступа, токен аутентификации, Tailscale
- **Каналы сообщений** — Единое управление Telegram, Discord, Feishu, DingTalk, QQ
- **Коммуникация и автоматизация** — Настройки сообщений, рассылка, Webhooks, утверждение выполнения
- **Аналитика использования** — Использование токенов, расходы API, рейтинги моделей/провайдеров
- **Управление агентами** — CRUD агентов, редактирование идентичности, управление workspace
- **Чат** — Потоковая передача, рендеринг Markdown, управление сессиями
- **Запланированные задачи** — Выполнение по расписанию Cron, многоканальная доставка
- **Просмотр логов** — Логи в реальном времени из нескольких источников и поиск
- **Управление памятью** — Просмотр/редактирование файлов памяти, экспорт ZIP, переключение агентов
- **Расширения** — Управление туннелями cftunnel, мониторинг ClawApp
- **О программе** — Информация о версии, ссылки сообщества, связанные проекты

## Скачать и установить

Перейдите на [Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) для последней версии:

| Платформа | Установщик |
|----------|-----------|
| **macOS Apple Silicon** | `.dmg` (aarch64) |
| **macOS Intel** | `.dmg` (x64) |

### Linux сервер (Web-версия)

```bash
curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh
```

## Быстрый старт

1. **Начальная настройка** — При первом запуске автоопределение Node.js, Git, OpenClaw. Установка одним кликом при необходимости
2. **Настройка моделей** — Добавить провайдеров ИИ (DeepSeek, OpenAI, Ollama и др.) и протестировать подключение
3. **Запуск Gateway** — Перейти в Управление сервисами, нажать «Запустить». Зелёный статус = готово
4. **Начать чат** — Перейти в Чат, выбрать модель и начать разговор

## Техническая архитектура

| Уровень | Технология | Описание |
|---------|-----------|----------|
| Frontend | Vanilla JS + Vite | Без фреймворков, лёгкий |
| Backend | Rust + Tauri v2 | Нативная производительность, кроссплатформенность |
| Коммуникация | Tauri IPC + Shell Plugin | Мост frontend-backend |
| Стили | Pure CSS (CSS Variables) | Тёмная/светлая темы |

## Сборка из исходного кода

```bash
git clone https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
cd tulu-openclaw-v2 && npm install

# Десктоп (требуется Rust + Tauri v2)
npm run tauri dev        # Разработка
npm run tauri build      # Продакшн

# Только Web (без Rust)
npm run dev              # Hot reload
npm run build && npm run serve  # Продакшн
```

## Связанные проекты

| Проект | Описание |
|--------|----------|
| [OpenClaw](https://github.com/openclaw/openclaw) | Фреймворк AI-агентов |
| [ClawApp](https://github.com/TuLu-openclaw/clawapp) | Кроссплатформенный мобильный чат |
| [cftunnel](https://github.com/TuLu-openclaw/cftunnel) | Инструмент Cloudflare Tunnel |

## Вклад

Issues и Pull Requests приветствуются. См. [CONTRIBUTING.md](CONTRIBUTING.md).


## Sponsor

If you find this project useful, consider supporting us via USDT (BNB Smart Chain):

<img src="public/images/bnbqr.jpg" alt="Sponsor QR" width="180">

```
0xbdd7ebdf2b30d873e556799711021c6671ffe88f
```

## Contact

- **Email**: [support@qctx.net](mailto:support@qctx.net)
- **Product**: [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)

## Лицензия

[AGPL-3.0](LICENSE). Для коммерческого использования обращайтесь за коммерческой лицензией.

© 2026 QingchenCloud | [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)
