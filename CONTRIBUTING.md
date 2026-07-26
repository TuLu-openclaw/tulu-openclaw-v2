# 贡献指南与维护手册

感谢你参与星枢OpenClaw。本文档说明当前仓库的开发、验证、发布和安全约定。

- 仓库：https://github.com/TuLu-openclaw/tulu-openclaw-v2
- 问题反馈：https://github.com/TuLu-openclaw/tulu-openclaw-v2/issues
- 正式版本：https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases

## 开发环境

| 依赖 | 要求 | 用途 |
|------|------|------|
| Node.js | 以已安装 OpenClaw 的 `package.json#engines.node` 为准 | 前端、测试和 Web 服务 |
| npm | 与 Node.js 配套的当前版本 | 安装锁定依赖 |
| Rust | stable | Tauri 后端编译和测试 |
| Tauri CLI | v2 | 桌面端开发和打包 |

首次准备：

```bash
git clone https://github.com/TuLu-openclaw/tulu-openclaw-v2.git
cd tulu-openclaw-v2
npm ci
```

常用命令：

```bash
npm run dev          # Web 开发模式
npm run tauri dev    # Tauri 桌面开发模式
npm test             # JavaScript 全量测试
npm run build        # 前端生产构建
```

Windows PowerShell 如果拦截 `npm.ps1`，可使用 `npm.cmd` 执行同名命令。

## 项目结构

- `src/`：前端页面、组件、国际化与领域逻辑
- `src-tauri/`：Tauri/Rust 后端、命令与桌面配置
- `scripts/dev-api.js`：Web 模式本地 API 与认证实现
- `scripts/serve.js`：生产 Web 服务入口
- `scripts/linux-deploy.sh`：Linux 服务部署与 systemd 配置
- `deploy.sh`：正式 Release Web 部署入口
- `tests/`：JavaScript 单元测试和静态政策测试
- `.github/workflows/release.yml`：发布验证与跨平台构建

## 配置文件

### OpenClaw 配置

`~/.openclaw/openclaw.json` 保存 OpenClaw 的模型、Gateway、Agent 等配置。它与面板自己的访问控制配置相互独立。

### 星枢OpenClaw 配置

`~/.openclaw/星枢OpenClaw.json` 保存面板配置。与认证相关的字段只有：

```json
{
  "accessPassword": "用户自己设置的访问密码",
  "ignoreRisk": false
}
```

- `accessPassword`：面板访问密码。不得写入固定默认密码，也不得通过认证状态 API 返回给浏览器。
- `ignoreRisk`：显式开启免密码访问。只适合受信任网络，关闭后必须重新完成密码初始化。
- 新安装应写入空对象 `{}` 或保持文件不存在，由用户首次访问时自己设置密码。
- 历史强制改密字段和预设密码流程已经废弃，不得重新引入。

配置文件包含敏感信息。Unix 系统应使用目录权限 `0700`、文件权限 `0600`，并通过临时文件和原子替换写入。

## 认证流程

Web 和 Tauri 共用相同的产品状态：

```text
首次启动且没有密码
  -> 只显示“设置访问密码”
  -> 用户输入新密码并确认
  -> 初始化成功后进入面板

已有密码且会话未认证
  -> 显示正常登录
  -> 验证成功后进入面板

已认证
  -> 可在“安全设置”中修改密码或显式开启免密码访问
```

必须保持以下边界：

- 初始化、登录和后续修改密码是三个独立任务，不共用预设凭据或强制改密状态。
- 未初始化时，普通 Web API 必须返回 `SETUP_REQUIRED`，不能因为密码为空而放行。
- 初始化接口只允许调用一次；并发或重复初始化应返回冲突状态。
- Web 会话 Cookie 必须为 HttpOnly；登录失败必须有限速保护。
- 错误提示要说明用户下一步能做什么，不直接暴露密码或内部状态。

## Node.js 兼容策略

不要写死“Node.js 18+”之类的长期规则。兼容判断应优先读取已安装 OpenClaw 的 `package.json#engines.node`；无法读取时，再使用仓库内已验证的版本回退规则。

修改 Setup、OpenClaw 安装、Gateway 启动或部署脚本时，必须同时运行 Node 兼容政策测试。

## 代码约定

- 沿用现有 Vanilla JS、Tauri v2 和 Rust 模块边界。
- 不为局部需求引入新的前端框架或重复抽象。
- 用户可见文案必须进入 locale 模块，不在页面中散落硬编码文本。
- 认证、配置写入、发布来源和版本兼容变更必须补回归测试。
- 不提交 API Key、Token、密码、Cookie、真实用户配置或本机绝对路径。
- 不回退或覆盖工作区中与当前任务无关的修改。

## 提交前验证

至少执行：

```bash
node --check src/main.js
node --check scripts/dev-api.js
npm test
npm run build
```

涉及 Rust 时还要执行：

```bash
cd src-tauri
cargo fmt --all -- --check
cargo check --all-targets
cargo test --all-targets
```

涉及 shell 部署脚本时执行 `bash -n deploy.sh scripts/linux-deploy.sh`，并检查正式 Release 来源、暂存解压、失败回滚和权限设置。

如果本机缺少 Cargo、真实 OpenClaw/Hermes 环境或目标操作系统，必须把相应项目标记为“受阻”或“仅静态验证”，不能写成已验证。

## 发布流程

1. 更新 `package.json` 中的版本，并运行 `npm run version:sync`。
2. 完成 JavaScript 测试、前端构建、Rust 格式/编译/测试。
3. 确认工作树中没有密钥、构建缓存或无关文件。
4. 创建与应用版本完全一致的 `v*` Tag。
5. 由 `.github/workflows/release.yml` 构建并发布安装包。
6. 下载并验收各平台产物后再向用户宣布发布完成。

部署脚本只能安装能够从 GitHub API 确认的正式 Release。API 不可用或 Release 不存在时应停止，不能回退安装 `main`。

未经维护者明确授权，不要推送、打 Tag 或创建 Release。

## Pull Request

PR 请包含：

- 问题背景和用户影响
- 具体改动及关键权衡
- 实际执行的测试和结果
- 未验证项、环境限制与剩余风险
- 涉及界面时的桌面/移动端截图或可复现说明

优先提交范围清晰、可独立验证的改动。发现安全漏洞时不要公开提交复现细节，请使用 [GitHub Security Advisories](https://github.com/TuLu-openclaw/tulu-openclaw-v2/security/advisories/new) 私下报告。
