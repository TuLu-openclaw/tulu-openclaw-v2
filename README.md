# 星枢OpenClaw

星枢OpenClaw 是一个面向 OpenClaw 与 Hermes 的可视化管理面板，基于 Tauri v2 构建，提供桌面端管理界面、安装/升级引导、诊断入口、运行状态查看，以及面向新手更友好的配置流程。

## 当前状态

- 当前仓库：https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
- 项目主页：https://github.com/TuLu-openclaw/tulu-openclaw-v2
- 问题反馈：https://github.com/TuLu-openclaw/tulu-openclaw-v2/issues
- 当前版本：4.4.8
- 桌面应用标识：ai.openclaw.tulu-openclaw-v2

## 已验证的发布产物

根据 `.github/workflows/release.yml` 当前配置，Tag 发布会产出以下桌面安装包：

- Windows x64：NSIS 安装包
- Windows ARM64：NSIS 安装包
- macOS Apple Silicon：DMG
- macOS Intel：DMG
- Linux x64：AppImage
- Linux x64：DEB

说明：当前仓库的发布工作流会先执行 JavaScript 测试、前端构建、`cargo fmt --check`、`cargo check --all-targets` 与 `cargo test --all-targets`，验证通过后才进入各平台构建。

## 核心能力

- OpenClaw 安装、升级、版本检测与来源识别
- Gateway 启停、状态查看、日志与常见错误诊断
- 模型、Agent、记忆、Cron、Skills 等常见管理入口
- Hermes 模式下的 Dashboard、Profiles、Gateways、OAuth、Files、Kanban、Channels、Extensions 等页面
- 内置 AI 助手与问题诊断辅助
- 面向中文用户的引导、镜像与部署辅助

## Node.js 兼容说明

星枢OpenClaw 不再使用“Node.js 18+”这种固定规则。

当前策略是：

- 优先读取已安装 OpenClaw 包自身的 `package.json#engines.node`
- 当本地无法读取该元数据时，再按已验证的 OpenClaw 版本回退规则判断
- Setup、npm 安装流程与 Gateway 启动前都会拦截不兼容的 Node 版本

当前已验证的回退规则：

- OpenClaw `2026.6.5+`：`>=22.19.0`
- OpenClaw `2026.7.1+`：`>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0`

如果你使用 Linux / Docker / 无桌面环境部署 Web 版，也应保证运行时 Node 版本满足所安装 OpenClaw 的要求。

## 安装与获取

### 桌面版

请直接前往 Releases 页面下载与你平台匹配的安装包：

- Releases：https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases

### 源码开发

```bash
git clone https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
cd tulu-openclaw-v2
npm install
npm run build
```

开发模式：

- 前端开发：`npm run dev`
- 桌面开发：`npm run tauri dev`
- 测试：`npm test`

## Linux / 服务器 Web 模式

仓库提供 Web 版部署脚本与 `npm run serve` 入口，适用于 Linux 服务器、开发板、Docker 或远程环境。

快速部署：

```bash
curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh
```

说明：

- Web 模式不需要 Tauri GUI，但仍需要兼容版本的 Node.js
- 如需管理本机 OpenClaw，请先安装 `openclaw` 官方 CLI
- 首次访问 Web 面板时会先进入初始化页面，由你自己设置访问密码
- 部署脚本仅安装 GitHub 正式 release，不会回退到未经验证的 `main` 分支

## 相关文档

- 平台与验收层级：[`SUPPORT.md`](SUPPORT.md)
- 隐私与数据边界：[`PRIVACY.md`](PRIVACY.md)
- 第三方组件与源码交付：[`THIRD_PARTY.md`](THIRD_PARTY.md)
- Release 下载与 SHA-256 校验：[`VERIFY_RELEASE.md`](VERIFY_RELEASE.md)
- 贡献指南：[`CONTRIBUTING.md`](CONTRIBUTING.md)
- 安全政策：[`SECURITY.md`](SECURITY.md)
- 更新日志：[`CHANGELOG.md`](CHANGELOG.md)

## 已知限制

- 本地 Rust 校验依赖 Cargo；若环境缺少 Cargo，则无法在本机完成 Rust 编译与单元测试验证
- README 之外的多语言文档仍有历史品牌与链接遗留，需后续逐份同步
- 实际 Tag 发布、GitHub Actions 运行、分支保护与产物签名仍需要远端环境验证

## 许可证

本项目当前仓库内声明为 AGPL-3.0。若你要对外分发或商用，请同时核对 `LICENSE` 中的附加条款与仓库最新说明。
