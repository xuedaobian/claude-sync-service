#!/bin/bash
# Claude Code Installation Script (macOS/Linux)
# 使用代理服务加速下载

set -e

# 配置
BASE_URL="${BASE_URL:-https://your-worker.workers.dev}"
VERSION_TYPE="${VERSION_TYPE:-latest}"  # 'latest' or 'stable'
INSTALL_DIR="$HOME/.local/bin"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检测平台
detect_platform() {
    local os=$(uname -s)
    local arch=$(uname -m)

    case "$os" in
        Darwin)
            case "$arch" in
                x86_64) echo "darwin-x64" ;;
                arm64) echo "darwin-arm64" ;;
                *) log_error "不支持的架构: $arch"; exit 1 ;;
            esac
            ;;
        Linux)
            case "$arch" in
                x86_64) echo "linux-x64" ;;
                aarch64) echo "linux-arm64" ;;
                *) log_error "不支持的架构: $arch"; exit 1 ;;
            esac
            ;;
        *)
            log_error "不支持的操作系统: $os"
            exit 1
            ;;
    esac
}

# 获取版本信息
get_version() {
    local url="$BASE_URL/$VERSION_TYPE"
    log_info "正在获取版本信息..."

    # 处理重定向
    local version=$(curl -sL -o /dev/null -w '%{url_effective}' "$url" | xargs basename)

    if [ -z "$version" ]; then
        log_error "无法获取版本信息"
        exit 1
    fi

    echo "$version"
}

# 下载文件
download_file() {
    local version=$1
    local platform=$2
    local filename="claude"
    local download_url="$BASE_URL/download/$version/$platform/$filename"
    local temp_dir=$(mktemp -d)
    local output_path="$temp_dir/$filename"

    log_info "正在下载 Claude Code $version..."
    log_info "下载地址: $download_url"

    if curl -fSL --progress-bar "$download_url" -o "$output_path"; then
        log_success "下载完成: $output_path"
        echo "$output_path"
    else
        log_error "下载失败"
        rm -rf "$temp_dir"
        exit 1
    fi
}

# 验证校验和
verify_checksum() {
    local file_path=$1
    local version=$2

    log_info "正在验证文件完整性..."

    local manifest_url="$BASE_URL/manifest/$version"
    local temp_manifest=$(mktemp)

    if curl -sSL "$manifest_url" -o "$temp_manifest"; then
        # 计算本地文件 SHA256
        local file_hash=$(sha256sum "$file_path" | awk '{print $1}')

        # 从 manifest 中提取校验和（假设 manifest 是 JSON）
        local filename=$(basename "$file_path")
        local expected_hash=$(grep -o "\"$filename\":{[^}]*\"sha256\":\"[^\"]*\"" "$temp_manifest" | grep -o '"sha256":"[^"]*"' | cut -d'"' -f4)

        rm -f "$temp_manifest"

        if [ -n "$expected_hash" ] && [ "$file_hash" = "$expected_hash" ]; then
            log_success "校验和验证通过!"
            return 0
        else
            log_warn "校验和不匹配或未找到校验信息"
            return 1
        fi
    else
        log_warn "无法下载校验清单"
        rm -f "$temp_manifest"
        return 1
    fi
}

# 安装文件
install_file() {
    local source_path=$1

    log_info "正在安装到 $INSTALL_DIR"

    # 创建安装目录
    mkdir -p "$INSTALL_DIR"

    # 复制文件
    cp "$source_path" "$INSTALL_DIR/claude"
    chmod +x "$INSTALL_DIR/claude"

    log_success "安装完成: $INSTALL_DIR/claude"

    # 检查 PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        log_warn "警告: $INSTALL_DIR 不在 PATH 中"
        echo ""
        echo "请将以下行添加到你的 shell 配置文件 (~/.bashrc, ~/.zshrc 等):"
        echo ""
        echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo ""
        echo "然后运行: source ~/.bashrc (或 source ~/.zshrc)"
    fi
}

# 主函数
main() {
    echo "======================================"
    echo "  Claude Code 安装程序 (代理版)"
    echo "======================================"
    echo ""

    # 检测平台
    PLATFORM=$(detect_platform)
    log_info "检测到平台: $PLATFORM"

    # 获取版本
    VERSION=$(get_version)
    log_success "目标版本: $VERSION"
    echo ""

    # 下载
    DOWNLOAD_PATH=$(download_file "$VERSION" "$PLATFORM")

    # 验证
    echo ""
    verify_checksum "$DOWNLOAD_PATH" "$VERSION" || true

    # 安装
    echo ""
    read -p "是否安装到 $INSTALL_DIR? (Y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_file "$DOWNLOAD_PATH"
    else
        log_warn "安装已取消。文件保存在: $DOWNLOAD_PATH"
    fi

    # 清理
    rm -f "$DOWNLOAD_PATH"
    rmdir "$(dirname "$DOWNLOAD_PATH")" 2>/dev/null || true

    echo ""
    log_success "安装完成! 运行 'claude --help' 开始使用"
}

# 运行
main "$@"
