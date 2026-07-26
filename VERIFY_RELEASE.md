# Release 下载与校验

只从项目正式 GitHub Releases 下载安装包、源码归档和同一 Release 中的 `SHA256SUMS`。不要从 `main` 分支、裸 IP 镜像、聊天附件或第三方网盘获取发布文件。

## 1. 核对版本与文件名

确认 Release tag、页面版本和下载文件匹配你的系统与架构。当前正式格式见 `SUPPORT.md`。未列出的 MSI、RPM 或其他格式不属于当前 Release 契约。

## 2. 校验 SHA-256

把目标文件和 `SHA256SUMS` 放在同一目录。`SHA256SUMS` 必须包含目标文件名的精确记录；找不到记录时停止安装。

Linux：

```bash
grep '  <exact-file-name>$' SHA256SUMS | sha256sum -c -
```

macOS：

```bash
grep '  <exact-file-name>$' SHA256SUMS | shasum -a 256 -c -
```

Windows PowerShell：

```powershell
$expected = (Select-String -Path .\SHA256SUMS -Pattern '^[a-fA-F0-9]{64}  <exact-file-name>$').Line.Split(' ')[0]
$actual = (Get-FileHash .\<exact-file-name> -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not $expected -or $actual -ne $expected.ToLowerInvariant()) { throw 'SHA-256 verification failed' }
```

将 `<exact-file-name>` 替换为实际下载文件名。不要复制另一个文件的摘要，也不要忽略大小写以外的差异。

## 3. 核对平台信任信息

- Windows：检查文件属性中的发布者和数字签名；签名缺失或发布者异常时停止安装。
- macOS：检查 Gatekeeper/签名结果；不要通过关闭系统安全机制绕过未知发布者。
- Linux：SHA-256 是当前基础校验；发行版安装还应检查包元数据和权限。

只有 Release 实际提供并验证签名时，发布说明才可以声明“已签名”。SHA-256 能检测内容变化，但不能单独证明发布者身份。

## 4. 失败处理

摘要不匹配、记录缺失、浏览器提示来源异常或系统签名检查失败时：删除下载文件，从正式 Release 重新下载，并通过 `SECURITY.md` 的私下渠道报告可疑发布资产。不要继续执行或解压。

## 源码对应关系

每个正式版本应提供确定性源码归档及其 `SHA256SUMS` 记录。源码归档必须对应不可变 tag；不要把当前 `main` 分支视为已安装二进制的精确源码。
