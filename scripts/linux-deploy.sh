#!/bin/bash
set -euo pipefail

PRODUCT_NAME="星枢OpenClaw"
SERVICE_NAME="xingshu-openclaw-web"
PANEL_PORT="${PANEL_PORT:-1420}"
PANEL_RELEASE_API="${PANEL_RELEASE_API:-}"
PANEL_RELEASE_BASE="${PANEL_RELEASE_BASE:-}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

log() {
    echo "$@"
}

if [ "$(id -u)" = "0" ]; then
    IS_ROOT=true
    INSTALL_DIR="/opt/xingshu-openclaw"
    SYSTEMD_DIR="/etc/systemd/system"
    SYSTEMD_SCOPE="system"
    log "[info] 以 root 身份运行，安装到 $INSTALL_DIR"
else
    IS_ROOT=false
    INSTALL_DIR="$HOME/.local/share/xingshu-openclaw"
    SYSTEMD_DIR="$HOME/.config/systemd/user"
    SYSTEMD_SCOPE="user"
    log "[info] 以普通用户身份运行，安装到 $INSTALL_DIR"
fi

run_pkg_cmd() {
    if [ "$IS_ROOT" = true ]; then
        "$@"
    else
        sudo "$@"
    fi
}

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_LIKE=${ID_LIKE:-}
    elif [ -f /etc/redhat-release ]; then
        OS="centos"
        OS_LIKE="rhel fedora"
    else
        OS=$(uname -s | tr '[:upper:]' '[:lower:]')
        OS_LIKE=""
    fi
    ARCH=$(uname -m)
    log "[info] 系统: $OS $ARCH"
}

install_node() {
    if command -v node >/dev/null 2>&1; then
        local node_version
        node_version=$(node -v)
        if printf '%s\n' "$node_version" | grep -Eq '^v(22\.(2[2-9]|[3-9][0-9])\.|2[3-9]\.)|^v(24\.(1[5-9]|[2-9][0-9])\.|2[5-9]\.)|^v(25\.(9|[1-9][0-9])\.|2[6-9]\.)'; then
            log "[ok] Node.js $node_version 已安装，可满足当前 OpenClaw 新版要求"
            return 0
        fi
        log "[warn] 检测到 Node.js $node_version，但它未必满足所安装 OpenClaw 的动态兼容范围。"
        log "[warn] 已知安全范围示例：OpenClaw 2026.7.1+ 需要 >=22.22.3 <23 或 >=24.15.0 <25 或 >=25.9.0。"
        log "[info] 将升级到 Node.js 22 最新 LTS，由面板在运行时继续做精确兼容校验。"
    else
        log "[info] 未检测到 Node.js，准备安装 Node.js 22 LTS..."
    fi

    case "$OS" in
        ubuntu|debian|linuxmint|pop)
            curl -fsSL https://deb.nodesource.com/setup_22.x | run_pkg_cmd bash -
            run_pkg_cmd apt-get install -y nodejs git curl
            ;;
        centos|rhel|fedora|rocky|alma)
            curl -fsSL https://rpm.nodesource.com/setup_22.x | run_pkg_cmd bash -
            if command -v dnf >/dev/null 2>&1; then
                run_pkg_cmd dnf install -y nodejs git curl
            else
                run_pkg_cmd yum install -y nodejs git curl
            fi
            ;;
        alpine)
            run_pkg_cmd apk add nodejs npm git curl bash
            ;;
        arch|manjaro)
            run_pkg_cmd pacman -Sy --noconfirm nodejs npm git curl
            ;;
        *)
            log "[error] 不支持自动安装 Node.js，请先手动安装兼容版本后重试。"
            exit 1
            ;;
    esac

    log "[ok] Node.js $(node -v) 安装完成"
}

install_git() {
    if command -v git >/dev/null 2>&1; then
        log "[ok] Git 已安装"
        return 0
    fi
    case "$OS" in
        ubuntu|debian|linuxmint|pop)
            run_pkg_cmd apt-get update && run_pkg_cmd apt-get install -y git
            ;;
        centos|rhel|fedora|rocky|alma)
            if command -v dnf >/dev/null 2>&1; then
                run_pkg_cmd dnf install -y git
            else
                run_pkg_cmd yum install -y git
            fi
            ;;
        alpine)
            run_pkg_cmd apk add git
            ;;
        arch|manjaro)
            run_pkg_cmd pacman -Sy --noconfirm git
            ;;
        *)
            log "[error] 无法自动安装 Git，请先手动安装。"
            exit 1
            ;;
    esac
    log "[ok] Git 安装完成"
}

find_openclaw() {
    local candidates=()
    if command -v openclaw >/dev/null 2>&1; then
        candidates+=("$(command -v openclaw)")
    fi
    candidates+=(
        "/usr/local/bin/openclaw"
        "/usr/bin/openclaw"
        "$HOME/.npm-global/bin/openclaw"
        "$HOME/.local/bin/openclaw"
    )
    local npm_prefix
    npm_prefix=$(npm config get prefix 2>/dev/null || true)
    if [ -n "$npm_prefix" ]; then
        candidates+=("$npm_prefix/bin/openclaw")
    fi
    local p
    for p in "${candidates[@]}"; do
        if [ -x "$p" ]; then
            echo "$p"
            return 0
        fi
    done
    return 1
}

verify_official_openclaw() {
    local cli_path="$1"
    node - "$cli_path" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')

const cliPath = fs.realpathSync(process.argv[2])
let dir = path.dirname(cliPath)
let packageRoot = null
while (true) {
  const manifestPath = path.join(dir, 'package.json')
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (manifest.name === 'openclaw') {
      const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.openclaw
      if (!bin) process.exit(1)
      const expected = fs.realpathSync(path.resolve(dir, bin))
      if (expected !== cliPath) process.exit(1)
      packageRoot = dir
      break
    }
  }
  const parent = path.dirname(dir)
  if (parent === dir) break
  dir = parent
}
if (!packageRoot) process.exit(1)
NODE
}

install_official_openclaw() {
    if [ "$IS_ROOT" = true ]; then
        npm install -g openclaw --registry "$NPM_REGISTRY"
    else
        sudo -E npm install -g openclaw --registry "$NPM_REGISTRY"
    fi
}

install_openclaw() {
    local oc_path=""
    if oc_path=$(find_openclaw); then
        if verify_official_openclaw "$oc_path"; then
            log "[ok] 已验证官方 npm OpenClaw CLI: $oc_path"
            if ! command -v openclaw >/dev/null 2>&1; then
                export PATH="$(dirname "$oc_path"):$PATH"
            fi
            return 0
        fi
        log "[warn] 检测到无法证明来自官方 npm 包的 openclaw: $oc_path"
        log "[info] 将通过 npm 安装官方 openclaw 包，不沿用来源不明的可执行文件。"
    else
        log "[info] 未检测到 OpenClaw CLI，开始安装官方 npm 包..."
    fi

    install_official_openclaw
    oc_path=$(find_openclaw) || {
        log "[error] npm 安装完成后仍找不到 OpenClaw CLI"
        exit 1
    }
    if ! verify_official_openclaw "$oc_path"; then
        log "[error] 无法验证已安装 CLI 属于官方 npm 包 openclaw，安装已停止。"
        exit 1
    fi
    if ! command -v openclaw >/dev/null 2>&1; then
        export PATH="$(dirname "$oc_path"):$PATH"
    fi
    log "[ok] 官方 npm OpenClaw CLI 安装并验证完成: $oc_path"
}

install_panel() {
    if [ -z "$PANEL_RELEASE_API" ] || [ -z "$PANEL_RELEASE_BASE" ]; then
        log "[error] 未配置受管面板发布源，无法下载安装包。"
        exit 1
    fi

    local latest
    latest=$(curl -fsSL "$PANEL_RELEASE_API" \
        | grep '"tag_name"' \
        | sed -E 's/.*"v?([^"]+)".*/\1/' \
        | head -n 1)
    if [ -z "$latest" ]; then
        log "[error] 无法确认 GitHub 最新正式版本；为避免安装未经验证的 main 分支，安装已停止。"
        exit 1
    fi

    local archive sums stage_dir backup_dir source_name release_base expected_sha actual_sha
    archive=$(mktemp "${TMPDIR:-/tmp}/tulu-openclaw-XXXXXX.tar.gz")
    sums=$(mktemp "${TMPDIR:-/tmp}/tulu-openclaw-XXXXXX.SHA256SUMS")
    stage_dir=$(mktemp -d "${TMPDIR:-/tmp}/tulu-openclaw-stage-XXXXXX")
    backup_dir="${INSTALL_DIR}.previous"
    source_name="XingShuOpenClaw-v$latest-source.tar.gz"
    release_base="${PANEL_RELEASE_BASE%/}/v$latest"
    trap 'rm -f "${archive:-}" "${sums:-}"; if [ -n "${stage_dir:-}" ]; then rm -rf "$stage_dir"; fi' RETURN

    log "[info] 下载并验证正式版本 v$latest..."
    curl -fsSL -o "$archive" "$release_base/$source_name"
    curl -fsSL -o "$sums" "$release_base/SHA256SUMS"
    expected_sha=$(awk -v file="$source_name" '$2 == file { print $1 }' "$sums")
    if ! printf '%s' "$expected_sha" | grep -Eq '^[0-9a-fA-F]{64}$'; then
        log "[error] SHA256SUMS 缺少当前版本源码归档的唯一有效记录"
        exit 1
    fi
    if command -v sha256sum >/dev/null 2>&1; then
        actual_sha=$(sha256sum "$archive" | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
        actual_sha=$(shasum -a 256 "$archive" | awk '{print $1}')
    else
        log "[error] 需要 sha256sum 或 shasum 才能验证发布归档"
        exit 1
    fi
    if [ "$actual_sha" != "$expected_sha" ]; then
        log "[error] 发布归档 SHA-256 校验失败"
        exit 1
    fi
    tar tzf "$archive" >/dev/null
    tar xzf "$archive" -C "$stage_dir" --strip-components=1
    [ -f "$stage_dir/package-lock.json" ] || { log "[error] 发布归档缺少 package-lock.json"; exit 1; }

    cd "$stage_dir"
    npm ci --ignore-scripts --registry "$NPM_REGISTRY"
    npm run build

    mkdir -p "$(dirname "$INSTALL_DIR")"
    rm -rf "$backup_dir"
    if [ -d "$INSTALL_DIR" ]; then mv "$INSTALL_DIR" "$backup_dir"; fi
    if ! mv "$stage_dir" "$INSTALL_DIR"; then
        if [ -d "$backup_dir" ]; then mv "$backup_dir" "$INSTALL_DIR"; fi
        log "[error] 安装目录替换失败，已恢复上一版本"
        exit 1
    fi
    stage_dir=""
    rm -rf "$backup_dir"
    rm -f "$archive"
    trap - RETURN
    log "[ok] $PRODUCT_NAME v$latest 已构建完成: $INSTALL_DIR"
}

setup_initial_auth_state() {
    local config_dir="$HOME/.openclaw"
    local config_file="$config_dir/星枢OpenClaw.json"
    mkdir -p "$config_dir"
    chmod 700 "$config_dir" 2>/dev/null || true
    if [ -f "$config_file" ] && grep -q '"accessPassword"' "$config_file"; then
        log "[info] 已存在访问密码配置，跳过首次访问初始化状态写入"
        return 0
    fi
    umask 077
    local config_tmp="$config_file.tmp.$$"
    cat > "$config_tmp" <<EOF
{}
EOF
    chmod 600 "$config_tmp"
    mv -f "$config_tmp" "$config_file"
    log "[ok] 已创建首次访问初始化状态；首次打开面板时将直接设置访问密码。"
}

setup_systemd() {
    if ! command -v systemctl >/dev/null 2>&1; then
        log "[warn] systemd 不可用，请手动启动：cd $INSTALL_DIR && npm run serve -- --port $PANEL_PORT"
        return 0
    fi

    mkdir -p "$SYSTEMD_DIR"
    local service_path="$SYSTEMD_DIR/$SERVICE_NAME.service"
    local node_bin
    node_bin=$(command -v node)

    cat > "$service_path" <<EOF
[Unit]
Description=$PRODUCT_NAME Web Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$node_bin scripts/serve.js --port $PANEL_PORT
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=HOME=$HOME
Environment=PATH=$HOME/.npm-global/bin:$HOME/.local/bin:$HOME/.volta/bin:$(dirname "$node_bin"):/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=$( [ "$SYSTEMD_SCOPE" = "system" ] && echo multi-user.target || echo default.target )
EOF

    if [ "$SYSTEMD_SCOPE" = "system" ]; then
        systemctl daemon-reload
        systemctl enable "$SERVICE_NAME"
        systemctl restart "$SERVICE_NAME"
    else
        systemctl --user daemon-reload
        systemctl --user enable "$SERVICE_NAME"
        systemctl --user restart "$SERVICE_NAME"
        loginctl enable-linger "$(whoami)" >/dev/null 2>&1 || true
    fi

    log "[ok] systemd 服务已创建：$SERVICE_NAME"
}

get_local_ip() {
    ip route get 1 2>/dev/null | awk '{print $7; exit}' || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost"
}

main() {
    detect_os
    install_git
    install_node
    install_openclaw
    install_panel
    setup_initial_auth_state
    setup_systemd

    local ip
    ip=$(get_local_ip)
    local ctl_cmd
    if [ "$SYSTEMD_SCOPE" = "system" ]; then
        ctl_cmd="systemctl"
    else
        ctl_cmd="systemctl --user"
    fi

    log ""
    log "=========================================="
    log "  [ok] $PRODUCT_NAME Web 版部署完成"
    log "=========================================="
    log "访问地址: http://$ip:$PANEL_PORT"
    log "安装目录: $INSTALL_DIR"
    log "配置目录: $HOME/.openclaw/"
    log "首次访问将进入初始化设置密码页面"
    log "状态查看: $ctl_cmd status $SERVICE_NAME"
    log "重启服务: $ctl_cmd restart $SERVICE_NAME"
    if [ "$SYSTEMD_SCOPE" = "system" ]; then
        log "查看日志: journalctl -u $SERVICE_NAME -f"
    else
        log "查看日志: journalctl --user -u $SERVICE_NAME -f"
    fi
}

main "$@"
