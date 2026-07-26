# 安全政策

## 支持的版本

安全修复面向 GitHub Releases 中的最新正式版本发布。旧版本不单独维护安全补丁；发现安全问题或准备部署到联网环境时，请先升级到最新正式版。

当前源码版本可在 `package.json` 中查看，实际可安装版本以 [GitHub Releases](https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases) 为准。

## 报告安全漏洞

如果你发现了安全漏洞，**请不要**在公开的 Issue 中提交。

请通过以下方式私下报告：

1. 发送邮件至项目维护者（在 GitHub 个人主页查看联系方式）
2. 或使用 [GitHub Security Advisories](https://github.com/TuLu-openclaw/tulu-openclaw-v2/security/advisories/new) 私下报告

### 报告内容应包含

- 漏洞的详细描述
- 复现步骤
- 受影响的版本
- 可能的影响范围
- 如果有的话，建议的修复方案

### 响应时间

- **确认收到**：48 小时内
- **初步评估**：7 个工作日内
- **修复发布**：根据严重程度，通常在 30 天内

## 安全最佳实践

使用 星枢OpenClaw 时，建议注意以下安全事项：

- **Gateway Token**：如果开启局域网共享，务必设置访问密钥
- **访问密码**：Web 面板首次访问时请立即完成初始化并设置你自己的访问密码，不要在公网暴露未初始化面板
- **网络访问**：默认仅监听本机（loopback），如无必要不要开启局域网模式
- **API Key**：模型服务商的 API Key 存储在本地 `openclaw.json` 中，请确保文件权限安全
