<p align="center">
  <img src="public/images/logo-brand.png" width="360" alt="星枢OpenClaw">
</p>

<p align="center">
  Panel de gestión OpenClaw con Asistente IA integrado — Instalación, Configuración, Diagnóstico y Reparación con un clic
</p>

<p align="center">
  <a href="README.md">🇨🇳 中文</a> | <a href="README.en.md">🇺🇸 English</a> | <a href="README.zh-TW.md">🇹🇼 繁體中文</a> | <a href="README.ja.md">🇯🇵 日本語</a> | <a href="README.ko.md">🇰🇷 한국어</a> | <a href="README.vi.md">🇻🇳 Tiếng Việt</a> | <strong>🇪🇸 Español</strong> | <a href="README.pt.md">🇧🇷 Português</a> | <a href="README.ru.md">🇷🇺 Русский</a> | <a href="README.fr.md">🇫🇷 Français</a> | <a href="README.de.md">🇩🇪 Deutsch</a>
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

星枢OpenClaw es un panel de gestión visual para el framework de AI Agent [OpenClaw](https://github.com/openclaw/openclaw). Cuenta con un **asistente IA inteligente integrado** que te ayuda a instalar OpenClaw con un clic, diagnosticar configuraciones automáticamente, solucionar problemas y corregir errores. 8 herramientas + 4 modos + Q&A interactivo — fácil de gestionar para principiantes y expertos.

> 🌐 **Sitio web**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) | 📦 **Descargar**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest)

### 🔥 Soporte para placas de desarrollo / Dispositivos embebidos

- **Orange Pi / Raspberry Pi / RK3588** — `npm run serve` para ejecutar
- **Armbian / Debian / Ubuntu Server** — Detección automática de arquitectura

## Comunidad

Una comunidad de desarrolladores y entusiastas apasionados por los AI Agents — ¡únete!

<p align="center">
  <a href="https://discord.gg/U9AttmsNHh"><strong>Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/discussions"><strong>Discussions</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/issues/new"><strong>Reportar Issue</strong></a>
</p>

## Características

- **🤖 Asistente IA (Nuevo)** — Asistente IA integrado, 4 modos + 8 herramientas + Q&A interactivo
- **🖼️ Reconocimiento de imágenes** — Pega capturas o arrastra imágenes, IA analiza automáticamente
- **Panel** — Vista general del sistema, monitoreo de servicios en tiempo real
- **Gestión de servicios** — Inicio/parada de OpenClaw, detección de versión y actualización con un clic
- **Configuración de modelos** — Gestión multi-proveedor, pruebas de conectividad por lotes, ordenar arrastrando
- **Configuración de Gateway** — Puerto, alcance de acceso, Token de autenticación, Tailscale
- **Canales de mensajería** — Gestión unificada de Telegram, Discord, Feishu, DingTalk, QQ
- **Comunicación y automatización** — Configuración de mensajes, difusión, Webhooks, aprobación de ejecución
- **Análisis de uso** — Uso de tokens, costos API, rankings de modelos/proveedores
- **Gestión de Agents** — CRUD de Agents, edición de identidad, gestión de workspace
- **Chat** — Streaming, renderizado Markdown, gestión de sesiones
- **Tareas programadas** — Ejecución programada con Cron, entrega multicanal
- **Visor de logs** — Logs en tiempo real multi-fuente y búsqueda por palabras clave
- **Gestión de memoria** — Ver/editar archivos de memoria, exportar ZIP, cambiar Agent
- **Herramientas de extensión** — Gestión de túneles cftunnel, monitoreo de ClawApp
- **Acerca de** — Información de versión, enlaces de comunidad, proyectos relacionados

## Descargar e instalar

Visita [Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) para la última versión:

| Plataforma | Instalador |
|-----------|-----------|
| **macOS Apple Silicon** | `.dmg` (aarch64) |
| **macOS Intel** | `.dmg` (x64) |

### Servidor Linux (Versión Web)

```bash
curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh
```

## Inicio rápido

1. **Configuración inicial** — Primera ejecución detecta automáticamente Node.js, Git, OpenClaw. Instalación con un clic si falta
2. **Configurar modelos** — Añadir proveedores de IA (DeepSeek, OpenAI, Ollama, etc.) y probar conectividad
3. **Iniciar Gateway** — Ir a Gestión de servicios, clic en "Iniciar". Estado verde = listo
4. **Empezar a chatear** — Ir a Chat en vivo, seleccionar modelo y comenzar conversación

## Arquitectura técnica

| Capa | Tecnología | Descripción |
|------|-----------|-------------|
| Frontend | Vanilla JS + Vite | Sin framework, ligero |
| Backend | Rust + Tauri v2 | Rendimiento nativo, multiplataforma |
| Comunicación | Tauri IPC + Shell Plugin | Puente frontend-backend |
| Estilos | Pure CSS (CSS Variables) | Temas oscuro/claro |

## Compilar desde código fuente

```bash
git clone https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
cd tulu-openclaw-v2 && npm install

# Escritorio (requiere Rust + Tauri v2)
npm run tauri dev        # Desarrollo
npm run tauri build      # Producción

# Solo Web (sin Rust)
npm run dev              # Hot reload
npm run build && npm run serve  # Producción
```

## Proyectos relacionados

| Proyecto | Descripción |
|----------|-------------|
| [OpenClaw](https://github.com/openclaw/openclaw) | Framework AI Agent |
| [ClawApp](https://github.com/TuLu-openclaw/clawapp) | Cliente móvil multiplataforma |
| [cftunnel](https://github.com/TuLu-openclaw/cftunnel) | Herramienta Cloudflare Tunnel |

## Contribuir

Issues y Pull Requests son bienvenidos. Ver [CONTRIBUTING.md](CONTRIBUTING.md).


## Sponsor

If you find this project useful, consider supporting us via USDT (BNB Smart Chain):

<img src="public/images/bnbqr.jpg" alt="Sponsor QR" width="180">

```
0xbdd7ebdf2b30d873e556799711021c6671ffe88f
```

## Contact

- **Email**: [support@qctx.net](mailto:support@qctx.net)
- **Product**: [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)

## Licencia

[AGPL-3.0](LICENSE). Contactar para licencia comercial.

© 2026 QingchenCloud | [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)
