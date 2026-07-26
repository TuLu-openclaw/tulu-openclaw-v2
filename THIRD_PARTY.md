# 第三方组件与来源

本文提供面向发布审查的高层清单，不替代 `package-lock.json`、`src-tauri/Cargo.lock`、各依赖许可证文本或法律审查。正式发布前应从锁文件生成完整 SBOM/许可证报告，并随对应版本保存。

## JavaScript 直接生产依赖

| 组件 | 用途 | 许可证声明来源 |
| --- | --- | --- |
| `@tauri-apps/api` | Tauri 前端 API | 包元数据：MIT 或 Apache-2.0 |
| `@tauri-apps/plugin-autostart` | 开机启动 | 包元数据：MIT 或 Apache-2.0 |
| `@tauri-apps/plugin-dialog` | 系统对话框 | 包元数据：MIT 或 Apache-2.0 |
| `@tauri-apps/plugin-shell` | 受控系统命令接口 | 包元数据：MIT 或 Apache-2.0 |
| `yaml` | YAML 解析 | 包元数据：ISC |

精确版本以 `package-lock.json` 为准。Vite、Tauri CLI、Playwright、esbuild 和 terser 属于开发/构建依赖，也必须纳入发布 SBOM。

## Rust 组件

桌面端直接使用 Tauri、Serde、Tokio、Reqwest、加密与归档相关 crates。精确传递依赖和版本以 `src-tauri/Cargo.lock` 为准。不要只根据 `Cargo.toml` 的宽版本范围制作许可证清单。

## 捆绑运行时

`_vendor/runtime/manifest.v2.json` 是捆绑运行时的版本化源码清单。当前非系统归档只能来自清单批准的官方 HTTPS 主机，并必须包含 64 位 SHA-256：

- Node.js：`nodejs.org` 官方分发；
- MinGit：Git for Windows 的 GitHub Releases 资产；
- macOS/Linux 的 Git：当前清单使用系统 Git，不下载归档。

平台目录下的 `manifest.json` 是构建生成物，不是可信来源配置。

## OpenClaw 与 Hermes

面板管理外部 OpenClaw/Hermes 安装和配置。OpenClaw 的活跃安装、升级、回滚和修复路径只应使用官方 npm 包 `openclaw`，并验证解析到的可执行文件属于该包。外部项目的许可证、服务条款和数据处理规则仍独立适用。

## 本项目许可证与源码交付

本仓库声明为 AGPL-3.0，并在 `LICENSE` 中保留 “Additional Terms for ClawPanel”。对外分发、托管或提供网络服务前，必须同时核对完整许可证正文、附加条款和对应版本完整源码的提供方式。Release 应包含确定性的源码归档及其 SHA-256，不得用可变 `main` 分支替代版本源码。
