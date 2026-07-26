<p align="center">
  <img src="public/images/logo-brand.png" width="360" alt="星枢OpenClaw">
</p>

<p align="center">
  OpenClaw-Verwaltungspanel mit integriertem KI-Assistenten — Installation, Konfiguration, Diagnose & Reparatur mit einem Klick
</p>

<p align="center">
  <a href="README.md">🇨🇳 中文</a> | <a href="README.en.md">🇺🇸 English</a> | <a href="README.zh-TW.md">🇹🇼 繁體中文</a> | <a href="README.ja.md">🇯🇵 日本語</a> | <a href="README.ko.md">🇰🇷 한국어</a> | <a href="README.vi.md">🇻🇳 Tiếng Việt</a> | <a href="README.es.md">🇪🇸 Español</a> | <a href="README.pt.md">🇧🇷 Português</a> | <a href="README.ru.md">🇷🇺 Русский</a> | <a href="README.fr.md">🇫🇷 Français</a> | <strong>🇩🇪 Deutsch</strong>
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

星枢OpenClaw ist ein visuelles Verwaltungspanel für das KI-Agenten-Framework [OpenClaw](https://github.com/openclaw/openclaw). Mit einem **integrierten intelligenten KI-Assistenten**, der bei der Ein-Klick-Installation von OpenClaw hilft, Konfigurationen automatisch diagnostiziert, Probleme behebt und Fehler korrigiert. 8 Werkzeuge + 4 Modi + interaktives Q&A — einfache Verwaltung für Anfänger und Experten.

> 🌐 **Website**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) | 📦 **Download**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest)

### 🔥 Entwicklerboard- / Embedded-Geräte-Unterstützung

- **Orange Pi / Raspberry Pi / RK3588** — `npm run serve` zum Ausführen
- **Armbian / Debian / Ubuntu Server** — Automatische Architekturerkennung

## Community

Eine Community leidenschaftlicher KI-Agenten-Entwickler und -Enthusiasten — treten Sie bei!

<p align="center">
  <a href="https://discord.gg/U9AttmsNHh"><strong>Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/discussions"><strong>Discussions</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/issues/new"><strong>Issue melden</strong></a>
</p>

## Funktionen

- **🤖 KI-Assistent (Neu)** — Integrierter KI-Assistent, 4 Modi + 8 Werkzeuge + interaktives Q&A
- **🖼️ Bilderkennung** — Screenshots einfügen oder Bilder ziehen, KI analysiert automatisch
- **Dashboard** — Systemübersicht, Echtzeit-Service-Monitoring
- **Serviceverwaltung** — OpenClaw starten/stoppen, Versionserkennung und Ein-Klick-Upgrade
- **Modellkonfiguration** — Multi-Provider-Verwaltung, Batch-Konnektivitätstests, Drag-Sortierung
- **Gateway-Konfiguration** — Port, Zugriffsbereich, Auth-Token, Tailscale
- **Nachrichtenkanäle** — Einheitliche Verwaltung von Telegram, Discord, Feishu, DingTalk, QQ
- **Kommunikation & Automatisierung** — Nachrichteneinstellungen, Broadcast, Webhooks, Ausführungsgenehmigung
- **Nutzungsanalyse** — Token-Verbrauch, API-Kosten, Modell-/Provider-Rankings
- **Agent-Verwaltung** — Agent-CRUD, Identitätsbearbeitung, Workspace-Verwaltung
- **Chat** — Streaming, Markdown-Rendering, Sitzungsverwaltung
- **Geplante Aufgaben** — Cron-basierte Ausführung, Mehrkanalzustellung
- **Log-Viewer** — Echtzeit-Logs aus mehreren Quellen und Suche
- **Speicherverwaltung** — Speicherdateien ansehen/bearbeiten, ZIP-Export, Agent-Wechsel
- **Erweiterungswerkzeuge** — cftunnel-Tunnelverwaltung, ClawApp-Statusüberwachung
- **Über** — Versionsinformationen, Community-Links, verwandte Projekte

## Download & Installation

Besuchen Sie [Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) für die neueste Version:

| Plattform | Installer |
|----------|----------|
| **macOS Apple Silicon** | `.dmg` (aarch64) |
| **macOS Intel** | `.dmg` (x64) |

### Linux-Server (Web-Version)

```bash
curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh
```

## Schnellstart

1. **Ersteinrichtung** — Beim ersten Start automatische Erkennung von Node.js, Git, OpenClaw. Ein-Klick-Installation bei Bedarf
2. **Modelle konfigurieren** — KI-Anbieter hinzufügen (DeepSeek, OpenAI, Ollama usw.) und Konnektivität testen
3. **Gateway starten** — Zur Serviceverwaltung gehen, „Starten" klicken. Grüner Status = bereit
4. **Chat starten** — Zum Live-Chat gehen, Modell auswählen und Gespräch beginnen

## Technische Architektur

| Schicht | Technologie | Beschreibung |
|---------|-----------|-------------|
| Frontend | Vanilla JS + Vite | Kein Framework, leichtgewichtig |
| Backend | Rust + Tauri v2 | Native Performance, plattformübergreifend |
| Kommunikation | Tauri IPC + Shell Plugin | Frontend-Backend-Brücke |
| Styling | Pure CSS (CSS Variables) | Dunkles/Helles Theme |

## Aus Quellcode bauen

```bash
git clone https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
cd tulu-openclaw-v2 && npm install

# Desktop (erfordert Rust + Tauri v2)
npm run tauri dev        # Entwicklung
npm run tauri build      # Produktion

# Nur Web (kein Rust nötig)
npm run dev              # Hot Reload
npm run build && npm run serve  # Produktion
```

## Verwandte Projekte

| Projekt | Beschreibung |
|---------|-------------|
| [OpenClaw](https://github.com/openclaw/openclaw) | KI-Agenten-Framework |
| [ClawApp](https://github.com/TuLu-openclaw/clawapp) | Plattformübergreifender mobiler Chat |
| [cftunnel](https://github.com/TuLu-openclaw/cftunnel) | Cloudflare Tunnel Tool |

## Beitragen

Issues und Pull Requests sind willkommen. Siehe [CONTRIBUTING.md](CONTRIBUTING.md).


## Sponsor

If you find this project useful, consider supporting us via USDT (BNB Smart Chain):

<img src="public/images/bnbqr.jpg" alt="Sponsor QR" width="180">

```
0xbdd7ebdf2b30d873e556799711021c6671ffe88f
```

## Contact

- **Email**: [support@qctx.net](mailto:support@qctx.net)
- **Product**: [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)

## Lizenz

[AGPL-3.0](LICENSE). Kontaktieren Sie uns für eine kommerzielle Lizenz.

© 2026 QingchenCloud | [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)
