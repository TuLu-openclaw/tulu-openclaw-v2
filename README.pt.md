<p align="center">
  <img src="public/images/logo-brand.png" width="360" alt="星枢OpenClaw">
</p>

<p align="center">
  Painel de gestão OpenClaw com Assistente IA integrado — Instalação, Configuração, Diagnóstico e Correção com um clique
</p>

<p align="center">
  <a href="README.md">🇨🇳 中文</a> | <a href="README.en.md">🇺🇸 English</a> | <a href="README.zh-TW.md">🇹🇼 繁體中文</a> | <a href="README.ja.md">🇯🇵 日本語</a> | <a href="README.ko.md">🇰🇷 한국어</a> | <a href="README.vi.md">🇻🇳 Tiếng Việt</a> | <a href="README.es.md">🇪🇸 Español</a> | <strong>🇧🇷 Português</strong> | <a href="README.ru.md">🇷🇺 Русский</a> | <a href="README.fr.md">🇫🇷 Français</a> | <a href="README.de.md">🇩🇪 Deutsch</a>
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

星枢OpenClaw é um painel de gestão visual para o framework de AI Agent [OpenClaw](https://github.com/openclaw/openclaw). Possui um **assistente IA inteligente integrado** que ajuda a instalar o OpenClaw com um clique, diagnosticar configurações automaticamente, resolver problemas e corrigir erros. 8 ferramentas + 4 modos + Q&A interativo — fácil de gerenciar para iniciantes e especialistas.

> 🌐 **Website**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) | 📦 **Download**: [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest)

### 🔥 Suporte a placas de desenvolvimento / Dispositivos embarcados

- **Orange Pi / Raspberry Pi / RK3588** — `npm run serve` para executar
- **Armbian / Debian / Ubuntu Server** — Detecção automática de arquitetura

## Comunidade

Uma comunidade de desenvolvedores e entusiastas apaixonados por AI Agents — junte-se!

<p align="center">
  <a href="https://discord.gg/U9AttmsNHh"><strong>Discord</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/discussions"><strong>Discussions</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/issues/new"><strong>Reportar Issue</strong></a>
</p>

## Funcionalidades

- **🤖 Assistente IA (Novo)** — Assistente IA integrado, 4 modos + 8 ferramentas + Q&A interativo
- **🖼️ Reconhecimento de imagens** — Cole capturas ou arraste imagens, IA analisa automaticamente
- **Painel** — Visão geral do sistema, monitoramento de serviços em tempo real
- **Gestão de serviços** — Iniciar/parar OpenClaw, detecção de versão e atualização com um clique
- **Configuração de modelos** — Gestão multi-provedor, testes de conectividade em lote, ordenação por arrasto
- **Configuração de Gateway** — Porta, escopo de acesso, Token de autenticação, Tailscale
- **Canais de mensagens** — Gestão unificada de Telegram, Discord, Feishu, DingTalk, QQ
- **Comunicação e automação** — Configurações de mensagens, broadcast, Webhooks, aprovação de execução
- **Análise de uso** — Uso de tokens, custos de API, rankings de modelos/provedores
- **Gestão de Agents** — CRUD de Agents, edição de identidade, gestão de workspace
- **Chat** — Streaming, renderização Markdown, gestão de sessões
- **Tarefas agendadas** — Execução agendada com Cron, entrega multicanal
- **Visualizador de logs** — Logs em tempo real multi-fonte e busca por palavras-chave
- **Gestão de memória** — Ver/editar arquivos de memória, exportar ZIP, trocar Agent
- **Ferramentas de extensão** — Gestão de túneis cftunnel, monitoramento do ClawApp
- **Sobre** — Informações de versão, links da comunidade, projetos relacionados

## Download e instalação

Acesse [Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest) para a versão mais recente:

| Plataforma | Instalador |
|-----------|-----------|
| **macOS Apple Silicon** | `.dmg` (aarch64) |
| **macOS Intel** | `.dmg` (x64) |

### Servidor Linux (Versão Web)

```bash
curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh
```

## Início rápido

1. **Configuração inicial** — Primeira execução detecta automaticamente Node.js, Git, OpenClaw. Instalação com um clique se necessário
2. **Configurar modelos** — Adicionar provedores de IA (DeepSeek, OpenAI, Ollama, etc.) e testar conectividade
3. **Iniciar Gateway** — Ir para Gestão de serviços, clicar em "Iniciar". Status verde = pronto
4. **Começar a conversar** — Ir para Chat ao vivo, selecionar modelo e iniciar conversa

## Arquitetura técnica

| Camada | Tecnologia | Descrição |
|--------|-----------|-----------|
| Frontend | Vanilla JS + Vite | Sem framework, leve |
| Backend | Rust + Tauri v2 | Performance nativa, multiplataforma |
| Comunicação | Tauri IPC + Shell Plugin | Ponte frontend-backend |
| Estilos | Pure CSS (CSS Variables) | Temas escuro/claro |

## Compilar a partir do código-fonte

```bash
git clone https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
cd tulu-openclaw-v2 && npm install

# Desktop (requer Rust + Tauri v2)
npm run tauri dev        # Desenvolvimento
npm run tauri build      # Produção

# Apenas Web (sem Rust)
npm run dev              # Hot reload
npm run build && npm run serve  # Produção
```

## Projetos relacionados

| Projeto | Descrição |
|---------|-----------|
| [OpenClaw](https://github.com/openclaw/openclaw) | Framework AI Agent |
| [ClawApp](https://github.com/TuLu-openclaw/clawapp) | Cliente móvel multiplataforma |
| [cftunnel](https://github.com/TuLu-openclaw/cftunnel) | Ferramenta Cloudflare Tunnel |

## Contribuir

Issues e Pull Requests são bem-vindos. Veja [CONTRIBUTING.md](CONTRIBUTING.md).


## Sponsor

If you find this project useful, consider supporting us via USDT (BNB Smart Chain):

<img src="public/images/bnbqr.jpg" alt="Sponsor QR" width="180">

```
0xbdd7ebdf2b30d873e556799711021c6671ffe88f
```

## Contact

- **Email**: [support@qctx.net](mailto:support@qctx.net)
- **Product**: [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)

## Licença

[AGPL-3.0](LICENSE). Contate-nos para licença comercial.

© 2026 QingchenCloud | [GitHub Repository](https://github.com/TuLu-openclaw/tulu-openclaw-v2)
