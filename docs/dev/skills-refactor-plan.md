# Skills 页面重构规划

> 目标：**完全去掉 CLI 依赖**，用 Rust `reqwest` 内置 SkillHub API 调用 + zip 解压，用户无需安装任何额外工具即可搜索/安装/管理 Skills。

---

## 一、现状分析

### 现有架构（问题）

```
┌─────────────┐      ┌───────────────────┐      ┌──────────────┐
│  skills.js  │ ───→ │  skills.rs / dev-  │ ───→ │ 外部 CLI 进程 │
│  (前端 UI)   │      │  api.js (后端)     │      │              │
└─────────────┘      └───────────────────┘      └──────┬───────┘
                                                       │
                                          ┌────────────┼────────────┐
                                          ▼            ▼            ▼
                                    openclaw CLI   skillhub CLI  clawhub CLI
                                    (skills list)  (search/install) (npx)
```

**痛点清单：**

| # | 问题 | 影响 |
|---|------|------|
| 1 | **必须安装 OpenClaw CLI** 才能查看已安装 Skills 列表 | 新用户看到空白页或报错 |
| 2 | **必须安装 SkillHub CLI** 才能从国内源搜索/安装 | 额外安装步骤，需要 npm |
| 3 | **ClawHub 用 `npx -y clawhub`** 每次冷启动 ~10s | 体验差，且海外源限流 |
| 4 | CLI 输出是人类可读文本，需要**正则解析** | 脆弱，CLI 版本更新就可能坏 |
| 5 | 前端有两个安装源下拉 + CLI 检测状态 UI | 复杂且令人困惑 |
| 6 | `skills_list` 依赖 CLI，超时/失败才 fallback 本地扫描 | 不可靠，延迟高 |

### 可保留的部分

| 模块 | 保留？ | 说明 |
|------|--------|------|
| `scan_local_skills()` / 本地扫描逻辑 | ✅ 保留 | 扫描 `~/.openclaw/skills/` 等目录，不依赖 CLI |
| `scan_single_skill()` | ✅ 保留 | 解析 SKILL.md frontmatter + package.json |
| `skills_uninstall()` | ✅ 保留 | 简单的 `rm -rf`，无 CLI 依赖 |
| `skills_validate()` | ✅ 保留 | 纯本地文件检查 |
| `skills_install_dep()` | ✅ 保留 | brew/npm/go/uv 本地包管理器 |
| 前端已安装 Tab 的分组渲染 | ✅ 保留 | eligible/missing/disabled/blocked 分组 |
| 前端过滤搜索 | ✅ 保留 | 实时 filter |

---

## 二、SkillHub API 协议

从 CLI 源码逆向得到的接口（腾讯云 COS + API 后端）：

| 功能 | URL | 返回 |
|------|-----|------|
| **搜索** | `GET https://lightmake.site/api/v1/search?q={query}&limit={limit}` | `{ results: [{ slug, displayName, summary, version }] }` |
| **主下载** | `GET https://lightmake.site/api/v1/download?slug={slug}` | zip 二进制 |
| **COS 镜像下载** | `GET https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills/{slug}.zip` | zip 二进制（国内加速） |
| **全量索引** | `GET https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills.json` | JSON 数组 |

### 安装流程（内置化）

```
搜索 → 选择 Skill → 下载 zip → 解压到 ~/.openclaw/skills/{slug}/ → 完成
```

不需要任何 CLI 工具。

---

## 三、新架构设计（SDK 模式 + 双平台）

关键设计：**抽出独立 SDK 层**，Tauri 桌面端和 Web/Docker 端各实现一份，上层 API 接口一致，后续调整只改 SDK 即可。

```
┌──────────────────┐
│  skills.js (前端)  │  统一 UI，不关心后端是 Rust 还是 Node
└────────┬─────────┘
         │ invoke / fetch
         ▼
┌──────────────────────────────────────────────────────────┐
│              Tauri 命令层 / dev-api 路由层                  │
│  skills.rs (Tauri)          dev-api.js (Web/Docker)      │
│  ↓ 调用                      ↓ 调用                       │
│  skillhub.rs (Rust SDK)     skillhub-sdk.js (Node SDK)   │
└──────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│                    SkillHub API + COS                      │
│  搜索: lightmake.site/api/v1/search                       │
│  索引: cos.ap-guangzhou.myqcloud.com/skills.json           │
│  下载: cos.ap-guangzhou.myqcloud.com/skills/{slug}.zip     │
│  回退: lightmake.site/api/v1/download                      │
└──────────────────────────────────────────────────────────┘
```

### 为什么用 SDK 模式？

| 优势 | 说明 |
|------|------|
| **解耦** | SDK 只管 HTTP + zip，不涉及 Tauri/Express 框架 |
| **双平台** | Rust SDK 给 Tauri 桌面端用，Node SDK 给 Web/Docker 端用 |
| **易调整** | API 域名/路径/认证变了，只改 SDK 一个文件 |
| **可测试** | SDK 函数可单独写单元测试 |
| **可复用** | 未来其他模块要调 SkillHub 也直接引 SDK |

---

## 四、Rust SDK（`src-tauri/src/commands/skillhub.rs`）

独立模块，不依赖 Tauri 框架，纯 `reqwest` + `zip` + `serde`。

### 4.1 数据结构

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillHubItem {
    pub slug: String,
    #[serde(alias = "displayName")]
    pub display_name: Option<String>,
    pub summary: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    results: Vec<SkillHubItem>,
}
```

### 4.2 SDK 公开接口

```rust
/// 搜索 SkillHub
pub async fn search(query: &str, limit: u32) -> Result<Vec<SkillHubItem>, String>

/// 拉取全量索引（带 10 分钟内存缓存）
pub async fn fetch_index() -> Result<Vec<SkillHubItem>, String>

/// 下载并安装 Skill（zip → 解压到 target_dir）
pub async fn install(slug: &str, skills_dir: &Path) -> Result<PathBuf, String>

/// 仅下载 zip 字节（COS 优先，回退主站）
pub async fn download_zip(slug: &str) -> Result<Vec<u8>, String>
```

### 4.3 下载策略

```rust
const COS_BASE: &str = "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com";
const API_BASE: &str = "https://lightmake.site/api/v1";

pub async fn download_zip(slug: &str) -> Result<Vec<u8>, String> {
    // 1. 优先 COS 镜像（国内 CDN，毫秒级）
    let cos_url = format!("{}/skills/{}.zip", COS_BASE, slug);
    if let Ok(resp) = client().get(&cos_url).send().await {
        if resp.status().is_success() {
            return resp.bytes().await
                .map(|b| b.to_vec())
                .map_err(|e| format!("COS 下载失败: {e}"));
        }
    }
    // 2. 回退主站 API
    let api_url = format!("{}/download?slug={}", API_BASE, slug);
    let resp = client().get(&api_url).send().await
        .map_err(|e| format!("主站下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载失败: HTTP {}", resp.status()));
    }
    resp.bytes().await
        .map(|b| b.to_vec())
        .map_err(|e| format!("读取下载内容失败: {e}"))
}
```

### 4.4 全量索引缓存

```rust
use std::sync::Mutex;
use std::time::{Duration, Instant};
use once_cell::sync::Lazy;

static INDEX_CACHE: Lazy<Mutex<Option<(Instant, Vec<SkillHubItem>)>>> =
    Lazy::new(|| Mutex::new(None));

pub async fn fetch_index() -> Result<Vec<SkillHubItem>, String> {
    // 命中缓存（10 分钟有效）
    if let Ok(guard) = INDEX_CACHE.lock() {
        if let Some((ts, ref items)) = *guard {
            if ts.elapsed() < Duration::from_secs(600) {
                return Ok(items.clone());
            }
        }
    }
    // 拉取远程索引
    let url = format!("{}/skills.json", COS_BASE);
    let items: Vec<SkillHubItem> = client().get(&url).send().await
        .map_err(|e| format!("拉取索引失败: {e}"))?
        .json().await
        .map_err(|e| format!("解析索引失败: {e}"))?;
    // 写入缓存
    if let Ok(mut guard) = INDEX_CACHE.lock() {
        *guard = Some((Instant::now(), items.clone()));
    }
    Ok(items)
}
```

### 4.5 zip 解压

```rust
pub fn extract_zip(zip_bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    use std::io::Cursor;
    use zip::ZipArchive;

    if target_dir.exists() {
        std::fs::remove_dir_all(target_dir)
            .map_err(|e| format!("清理旧目录失败: {e}"))?;
    }
    std::fs::create_dir_all(target_dir)
        .map_err(|e| format!("创建目录失败: {e}"))?;

    let reader = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| format!("打开 zip 失败: {e}"))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("读取 zip 条目失败: {e}"))?;
        let name = file.name().to_string();
        // 安全检查：防止路径穿越
        if name.contains("..") { continue; }

        let out_path = target_dir.join(&name);
        if file.is_dir() {
            std::fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("创建文件失败 {name}: {e}"))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("写入文件失败 {name}: {e}"))?;
        }
    }
    Ok(())
}
```

---

## 五、Node.js SDK（`scripts/lib/skillhub-sdk.js`）

给 Web/Docker 端用，API 接口与 Rust SDK **完全对齐**。

### 5.1 模块结构

```javascript
// scripts/lib/skillhub-sdk.js
const COS_BASE = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com'
const API_BASE = 'https://lightmake.site/api/v1'

let _indexCache = null  // { ts: Date.now(), items: [] }
const INDEX_TTL = 10 * 60 * 1000 // 10 分钟

module.exports = { search, fetchIndex, install, downloadZip }
```

### 5.2 SDK 公开接口

```javascript
/**
 * 搜索 SkillHub
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {Promise<Array<{slug, displayName, summary, version}>>}
 */
async function search(query, limit = 20) {
  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`搜索失败: HTTP ${resp.status}`)
  const data = await resp.json()
  return data.results || []
}

/**
 * 拉取全量索引（带缓存）
 * @returns {Promise<Array<{slug, displayName, summary, version}>>}
 */
async function fetchIndex() {
  if (_indexCache && Date.now() - _indexCache.ts < INDEX_TTL) {
    return _indexCache.items
  }
  const resp = await fetch(`${COS_BASE}/skills.json`)
  if (!resp.ok) throw new Error(`拉取索引失败: HTTP ${resp.status}`)
  const items = await resp.json()
  _indexCache = { ts: Date.now(), items }
  return items
}

/**
 * 下载 zip（COS 优先，回退主站）
 * @param {string} slug
 * @returns {Promise<Buffer>}
 */
async function downloadZip(slug) {
  // COS 优先
  try {
    const resp = await fetch(`${COS_BASE}/skills/${slug}.zip`)
    if (resp.ok) return Buffer.from(await resp.arrayBuffer())
  } catch {}
  // 回退主站
  const resp = await fetch(`${API_BASE}/download?slug=${encodeURIComponent(slug)}`)
  if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}

/**
 * 下载并安装 Skill
 * @param {string} slug
 * @param {string} skillsDir - ~/.openclaw/skills/
 * @returns {Promise<string>} 安装路径
 */
async function install(slug, skillsDir) {
  const zipBuf = await downloadZip(slug)
  const targetDir = path.join(skillsDir, slug)
  // 清理旧目录
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  // 解压（用 Node.js 内置或 adm-zip）
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(zipBuf)
  zip.extractAllTo(targetDir, true)
  return targetDir
}
```

### 5.3 dev-api.js 集成

```javascript
const skillhub = require('./lib/skillhub-sdk')

// 路由处理器中直接调用 SDK
handlers = {
  skillhub_search({ query, limit }) { return skillhub.search(query, limit) },
  skillhub_index()                  { return skillhub.fetchIndex() },
  skillhub_install({ slug })        { return skillhub.install(slug, SKILLS_DIR) },
  // skills_list → 纯本地扫描（已有 scanLocalSkillsFallback）
  skills_list()                     { return scanLocalSkillsFallback() },
}
```

---

## 六、命令层改造

### 6.1 skills.rs — Tauri 命令层（薄包装）

改造后 `skills.rs` 只是 SDK 的 Tauri 命令薄包装：

```rust
mod skillhub; // SDK 模块

#[tauri::command]
pub async fn skillhub_search(query: String, limit: Option<u32>) -> Result<Value, String> {
    let items = skillhub::search(&query, limit.unwrap_or(20)).await?;
    Ok(serde_json::to_value(items).unwrap())
}

#[tauri::command]
pub async fn skillhub_index() -> Result<Value, String> {
    let items = skillhub::fetch_index().await?;
    Ok(serde_json::to_value(items).unwrap())
}

#[tauri::command]
pub async fn skillhub_install(slug: String) -> Result<Value, String> {
    let skills_dir = super::openclaw_dir().join("skills");
    let path = skillhub::install(&slug, &skills_dir).await?;
    Ok(serde_json::json!({ "success": true, "slug": slug, "path": path.to_string_lossy() }))
}

// skills_list → 纯本地扫描（复用已有 scan_local_skills）
#[tauri::command]
pub async fn skills_list() -> Result<Value, String> {
    scan_local_skills(None) // 不再调 CLI
}
```

### 6.2 可删除的命令

| 命令 | 原因 |
|------|------|
| `skills_skillhub_check` | 不再需要检测 CLI |
| `skills_skillhub_setup` | 不再需要安装 CLI |
| `skills_skillhub_search` | 替换为 `skillhub_search`（SDK） |
| `skills_skillhub_install` | 替换为 `skillhub_install`（SDK） |
| `skills_clawhub_search` | 合并到 SkillHub |
| `skills_clawhub_install` | 合并到 SkillHub |

### 6.3 保留的命令

| 命令 | 说明 |
|------|------|
| `skills_list` | 改为纯本地扫描 |
| `skills_info` | 改为纯本地文件解析 |
| `skills_uninstall` | 不变（删目录） |
| `skills_validate` | 不变（本地文件检查） |
| `skills_install_dep` | 不变（brew/npm/go/uv） |

---

## 七、前端改造（`skills.js`）

### 7.1 UI 简化

**删除：**
- 安装源下拉（`<select id="install-source-select">`）— 统一为 SkillHub
- SkillHub CLI 状态检测 / 安装按钮
- ClawHub 源相关 UI
- `checkSkillHubStatus()` / `switchInstallSource()` 等函数

**保留：**
- 两个 Tab："已安装" / "技能商店"
- 已安装 Tab 的分组渲染（eligible/missing/disabled/blocked）
- 实时过滤搜索
- Skill 卡片渲染

**新增：**
- 技能商店 Tab 改为**浏览模式**：默认加载全量索引（热门/推荐），支持搜索过滤
- 安装进度条/状态（下载中 → 解压中 → 完成）
- 已安装 Skill 的**更新检测**（比对本地版本 vs 索引版本）

### 7.2 新的"技能商店"Tab 布局

```
┌──────────────────────────────────────────────────┐
│  🔍 搜索技能...                      [浏览 SkillHub] │
├──────────────────────────────────────────────────┤
│                                                    │
│  📦 weather      ☀️ 天气查询         [安装]          │
│  📦 github       🐙 GitHub 操作      [安装]          │
│  📦 tavily       🔍 网页搜索         [安装]          │
│  📦 feishu-doc   📄 飞书文档         [安装]          │
│  ...                                               │
│                                                    │
└──────────────────────────────────────────────────┘
```

- 页面进入时自动加载全量索引（COS CDN，国内毫秒级）
- 搜索框实时过滤（客户端）+ 回车触发服务端搜索（更精准）
- 已安装的 Skill 显示"已安装"灰色标记，不显示安装按钮

### 7.3 API 调用映射

| 旧 API | 新 API | 说明 |
|--------|--------|------|
| `api.skillsList()` | `api.skillsList()` | 后端改为纯本地扫描 |
| `api.skillsSkillHubCheck()` | ❌ 删除 | 不再需要 |
| `api.skillsSkillHubSetup()` | ❌ 删除 | 不再需要 |
| `api.skillsSkillHubSearch(q)` | `api.skillhubSearch(q)` | 内置 HTTP 调用 |
| `api.skillsSkillHubInstall(slug)` | `api.skillhubInstall(slug)` | 内置下载+解压 |
| `api.skillsClawHubSearch(q)` | ❌ 删除 | 统一到 SkillHub |
| `api.skillsClawHubInstall(slug)` | ❌ 删除 | 统一到 SkillHub |
| — | `api.skillhubIndex()` | 新增：全量索引 |

---

## 八、i18n 改造

### 删除的 key

```
skillhubNeedCLI, skillhubNeedCLIHint, skillhubSetup,
skillhubInstalling, skillhubInstalled, skillhubInstallFailed,
sourceSkillHub, sourceClawHub, installCLI,
rateLimitClawHub, sourceLocalScanTimeout, sourceLocalScanParseFailed,
sourceLocalScanExecFailed, sourceLocalScan, sourceLocalScanNoCli, sourceCLI,
loadFailedHint (不再需要提示安装 OpenClaw)
```

### 新增/修改的 key

```
storeTitle: '技能商店' / 'Skill Store'
storeLoading: '正在加载技能索引...' / 'Loading skill index...'
storeLoadFailed: '加载技能索引失败' / 'Failed to load skill index'
downloading: '下载中...' / 'Downloading...'
extracting: '解压中...' / 'Extracting...'
updateAvailable: '可更新' / 'Update available'
update: '更新' / 'Update'
```

---

## 九、实施步骤

### Phase 1：Rust SDK 模块（`skillhub.rs`）
1. 新建 `src-tauri/src/commands/skillhub.rs`
2. 实现 `SkillHubItem` 数据结构
3. 实现 `search()`、`fetch_index()`、`download_zip()`、`install()`、`extract_zip()`
4. 实现全量索引内存缓存
5. 在 `commands/mod.rs` 中声明 `pub mod skillhub`
6. `cargo check` 验证 SDK 模块编译通过

### Phase 2：Node.js SDK 模块（`skillhub-sdk.js`）
1. 新建 `scripts/lib/skillhub-sdk.js`
2. 实现 `search()`、`fetchIndex()`、`downloadZip()`、`install()`
3. 确认 `adm-zip` 已在 devDependencies（或改用 Node 内置 `zlib` + `tar`）
4. `node --check` 验证

### Phase 3：命令层改造（skills.rs + dev-api.js）
1. `skills.rs`：新增 `skillhub_search`、`skillhub_index`、`skillhub_install` Tauri 命令（薄包装 SDK）
2. `skills.rs`：改造 `skills_list` → 纯本地扫描，改造 `skills_info` → 纯本地解析
3. `skills.rs`：删除 6 个旧 CLI 命令
4. `lib.rs`：更新命令注册
5. `dev-api.js`：路由层接入 `skillhub-sdk.js`，删除旧 CLI 调用
6. `cargo check` + `node --check` 验证

### Phase 4：前端 UI 重写（skills.js + tauri-api.js）
1. 更新 `tauri-api.js` API 映射（新增 3 个，删除 6 个）
2. 重写"技能商店"Tab — 默认加载全量索引，搜索过滤，一键安装
3. 简化已安装 Tab — 删除 CLI 状态提示和诊断信息
4. 删除 `switchInstallSource`、`checkSkillHubStatus`、`handleSkillHubSetup` 等
5. 添加安装进度反馈（下载中 → 解压中 → 完成）

### Phase 5：i18n + 清理 + 验证
1. 更新 `locales/modules/skills.js`（删除旧 key，新增商店 key）
2. 清理 `assistant.js` 中的 skills 工具定义（如有需要）
3. `cargo check` + `npx vite build` 全量验证
4. 手动测试已安装 Tab + 技能商店 Tab

---

## 十、风险与兼容性

| 风险 | 缓解 |
|------|------|
| SkillHub API 不可用 | COS 镜像作为备选；全量索引可离线缓存 |
| zip 解压路径安全 | 校验 slug 无 `..`/`/`/`\`；解压时检查相对路径 |
| 已有用户的 Skills 目录结构不兼容 | 不变 — 仍然解压到 `~/.openclaw/skills/{slug}/` |
| `skills_list` 去掉 CLI 后丢失 bundled skills 信息 | `custom_skill_roots()` 已包含 bundled 路径推导 |
| `skills_install_dep` (brew/npm/go/uv) 仍需本地工具 | 保留 — 这是 Skill 运行时依赖，不是安装工具依赖 |

---

## 十一、预期效果

| 指标 | 改造前 | 改造后 |
|------|--------|--------|
| 首次使用需安装 | OpenClaw CLI + SkillHub CLI | **无需安装** |
| 搜索延迟 | ~3-10s（CLI 冷启动） | **<1s**（HTTP API） |
| 安装延迟 | ~5-15s（CLI 调用） | **~2-5s**（直接下载 zip） |
| 前端代码复杂度 | 492 行（含双源切换/CLI 检测） | ~300 行（统一 UI） |
| 后端 CLI 调用 | 8 个命令依赖外部 CLI | **0 个** |
| 用户认知负担 | 安装源选择 + CLI 状态 | 搜索框 + 安装按钮 |
| Web/Docker 端 | CLI 经常找不到或权限问题 | **内置 HTTP，与桌面端体验一致** |
