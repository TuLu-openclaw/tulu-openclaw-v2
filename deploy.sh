#!/bin/bash
# 星枢OpenClaw Web 版一键部署脚本
# 适用于 WSL / Docker / 远程服务器
# 用法: curl -fsSL -o deploy.sh https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases/latest/download/deploy.sh && bash deploy.sh

set -euo pipefail

REPO="TuLu-openclaw/tulu-openclaw-v2"
INSTALL_DIR="$HOME/.tulu-openclaw-web"
PORT="${XINGSHU_OPENCLAW_PORT:-9099}"

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$1"
  else
    echo "[error] 需要 curl 或 wget，请先安装"
    exit 1
  fi
}

download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  fi
}

verify_sha256() {
  expected="$1"
  file="$2"
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$file" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$file" | awk '{print $1}')
  else
    echo "[error] 需要 sha256sum 或 shasum 才能验证发布归档"
    exit 1
  fi
  if [ "$actual" != "$expected" ]; then
    echo "[error] 发布归档 SHA-256 校验失败"
    exit 1
  fi
}

echo ""
echo "  星枢OpenClaw Web 版 一键部署脚本"
echo "  ================================="
echo ""

echo "[1/5] 检查依赖..."
command -v node >/dev/null 2>&1 || { echo "[error] 需要 Node.js，请先安装兼容版本。"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "[error] 需要 npm"; exit 1; }
node -e "const v=process.version; const ok=/^v(22\.(2[2-9]|[3-9][0-9])\.|24\.(1[5-9]|[2-9][0-9])\.|25\.(9|[1-9][0-9])\.)/.test(v); if(!ok){console.error('[error] 当前 Node.js '+v+' 不满足已验证的 OpenClaw 新版兼容范围。请升级到兼容版本后重试。'); process.exit(1)}"
echo "  node $(node -v) / npm $(npm -v)"

echo "[2/5] 获取最新版本..."
LATEST=$(fetch "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/' || echo "")
if [ -z "$LATEST" ]; then
  echo "[error] 无法确认 GitHub 最新正式版本；为避免部署未经验证的 main 分支，安装已停止。"
  exit 1
fi
echo "  最新版本: v$LATEST"
SOURCE_NAME="XingShuOpenClaw-v$LATEST-source.tar.gz"
RELEASE_BASE="https://github.com/$REPO/releases/download/v$LATEST"
DOWNLOAD_URL="$RELEASE_BASE/$SOURCE_NAME"

echo "[3/5] 下载并验证源码..."
TMP_FILE=$(mktemp "${TMPDIR:-/tmp}/tulu-openclaw-XXXXXX.tar.gz")
TMP_SUMS=$(mktemp "${TMPDIR:-/tmp}/tulu-openclaw-XXXXXX.SHA256SUMS")
STAGE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/tulu-openclaw-stage-XXXXXX")
trap 'rm -f "$TMP_FILE" "$TMP_SUMS"; if [ -n "${STAGE_DIR:-}" ]; then rm -rf "$STAGE_DIR"; fi' EXIT
download "$DOWNLOAD_URL" "$TMP_FILE"
download "$RELEASE_BASE/SHA256SUMS" "$TMP_SUMS"
if [ ! -s "$TMP_FILE" ] || [ ! -s "$TMP_SUMS" ]; then
  echo "[error] 发布归档或 SHA256SUMS 下载失败"
  exit 1
fi
EXPECTED_SHA=$(awk -v file="$SOURCE_NAME" '$2 == file { print $1 }' "$TMP_SUMS")
if ! printf '%s' "$EXPECTED_SHA" | grep -Eq '^[0-9a-fA-F]{64}$'; then
  echo "[error] SHA256SUMS 缺少当前版本源码归档的唯一有效记录"
  exit 1
fi
verify_sha256 "$EXPECTED_SHA" "$TMP_FILE"
tar tzf "$TMP_FILE" >/dev/null
tar xzf "$TMP_FILE" -C "$STAGE_DIR" --strip-components=1
[ -f "$STAGE_DIR/package-lock.json" ] || { echo "[error] 发布归档缺少 package-lock.json"; exit 1; }
echo "  已校验并解压正式发布源码"

echo "[4/5] 安装依赖..."
cd "$STAGE_DIR"
npm ci --ignore-scripts 2>&1 | tail -1

echo "[5/5] 构建前端..."
npm run build 2>&1 | tail -2
mkdir -p "$(dirname "$INSTALL_DIR")"
BACKUP_DIR="${INSTALL_DIR}.previous"
rm -rf "$BACKUP_DIR"
if [ -d "$INSTALL_DIR" ]; then mv "$INSTALL_DIR" "$BACKUP_DIR"; fi
if ! mv "$STAGE_DIR" "$INSTALL_DIR"; then
  if [ -d "$BACKUP_DIR" ]; then mv "$BACKUP_DIR" "$INSTALL_DIR"; fi
  echo "[error] 安装目录替换失败，已恢复上一版本"
  exit 1
fi
STAGE_DIR=""
rm -rf "$BACKUP_DIR"

echo ""
echo "  ================================="
echo "  星枢OpenClaw Web 版部署完成"
echo "  ================================="
echo ""
echo "  启动: cd $INSTALL_DIR && npm run serve -- --host 0.0.0.0 --port $PORT"
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo "  访问: http://$IP:$PORT"
echo ""
echo "  提示: 如需管理本机 OpenClaw，请先安装 openclaw 官方 CLI"
echo "        当前面板会在运行时继续检查 Node.js 与目标 OpenClaw 版本的精确兼容范围"
echo ""
