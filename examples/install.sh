#!/bin/bash
# Claude Code 安装/更新脚本 (macOS/Linux)
# 使用代理服务加速下载

set -e

# 配置
BASE_URL="${BASE_URL:-https://claude-code-proxy.linchuan.workers.dev}"
VERSION_TYPE="${VERSION_TYPE:-latest}"  # 'latest' or 'stable'
INSTALL_DIR="$HOME/.local/bin"
VERSION_FILE="$INSTALL_DIR/.claude-version"

# 解析参数
FORCE=false
CHECK_ONLY=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --force|-f)
            FORCE=true
            shift
            ;;
        --check|-c)
            CHECK_ONLY=true
            shift
            ;;
        --stable|-s)
            VERSION_TYPE="stable"
            shift
            ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --force, -f      强制重新安装，即使版本相同"
            echo "  --check, -c      仅检查版本，不安装"
            echo "  --stable, -s     安装稳定版而非最新版"
            echo "  --help, -h       显示此帮助信息"
            echo ""
            echo "环境变量:"
            echo "  BASE_URL         代理服务 URL (默认: https://your-worker.workers.dev)"
            echo ""
            echo "示例:"
            echo "  $0                # 安装或更新到最新版"
            echo "  $0 --check        # 检查是否有新版本"
            echo "  $0 --stable       # 安装稳定版"
            echo "  BASE_URL=https://proxy.example.com $0"
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# 版本比较
# 返回: 0=相等, 1=ver1 > ver2, 2=ver1 < ver2
compare_versions() {
    if [[ "$1" == "$2" ]]; then
        return 0
    fi
    local IFS=.
    local i ver1=($1) ver2=($2)
    for ((i=${#ver1[@]}; i<${#ver2[@]}; i++)); do
        ver1[i]=0
    done
    for ((i=0; i<${#ver1[@]}; i++)); do
        if [[ -z ${ver2[i]} ]]; then
            ver2[i]=0
        fi
        if ((10#${ver1[i]} > 10#${ver2[i]})); then
            return 1
        fi
        if ((10#${ver1[i]} < 10#${ver2[i]})); then
            return 2
        fi
    done
    return 0
}

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

# 获取当前安装的版本
get_current_version() {
    if [ -f "$VERSION_FILE" ]; then
        cat "$VERSION_FILE"
    elif [ -f "$INSTALL_DIR/claude" ]; then
        # 尝试从二进制文件获取版本（如果支持）
        local version=$("$INSTALL_DIR/claude" --version 2>/dev/null || echo "")
        if [ -n "$version" ]; then
            echo "$version"
        fi
    fi
}

# 获取远程版本
get_remote_version() {
    local url="$BASE_URL/$VERSION_TYPE"
    log_info "正在获取远程版本信息..."

    # 处理重定向
    local version=$(curl -sL -o /dev/null -w '%{url_effective}' "$url" 2>/dev/null | xargs basename)

    if [ -z "$version" ] || [[ "$version" == "latest" ]] || [[ "$version" == "stable" ]]; then
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

    log_info "正在下载 Claude Code ${BOLD}$version${NC}..."
    log_info "下载地址: $download_url"

    if curl -fSL --progress-bar "$download_url" -o "$output_path"; then
        log_success "下载完成"
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

    if curl -sSL "$manifest_url" -o "$temp_manifest" 2>/dev/null; then
        # 计算本地文件 SHA256
        local file_hash=$(sha256sum "$file_path" 2>/dev/null | awk '{print $1}')

        # 从 manifest 中提取校验和
        local expected_hash=$(grep -o "\"claude\":{[^}]*\"sha256\":\"[^\"]*\"" "$temp_manifest" 2>/dev/null | grep -o '"sha256":"[^"]*"' | cut -d'"' -f4)

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
    local version=$2

    log_step "安装 Claude Code..."

    # 创建安装目录
    mkdir -p "$INSTALL_DIR"

    # 备份现有文件
    if [ -f "$INSTALL_DIR/claude" ]; then
        local backup_path="$INSTALL_DIR/.claude.backup"
        cp "$INSTALL_DIR/claude" "$backup_path"
        log_info "已备份现有版本到: $backup_path"
    fi

    # 复制新文件
    cp "$source_path" "$INSTALL_DIR/claude"
    chmod +x "$INSTALL_DIR/claude"

    # 保存版本信息
    echo "$version" > "$VERSION_FILE"

    log_success "安装完成: ${BOLD}$INSTALL_DIR/claude${NC}"
    log_info "版本: ${BOLD}$version${NC}"

    # 检查 PATH
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo ""
        log_warn "警告: $INSTALL_DIR 不在 PATH 中"
        echo ""
        echo "请将以下行添加到你的 shell 配置文件 (~/.bashrc, ~/.zshrc, ~/.config/fish/config.fish 等):"
        echo ""
        echo "    ${BASH:+export PATH=\"\$HOME/.local/bin:\$PATH\"}"
        echo "    ${ZSH_VERSION:+export PATH=\"\$HOME/.local/bin:\$PATH\"}"
        echo "    ${FISH_VERSION:+fish_add_path ~/.local/bin}"
        echo ""
        echo "然后运行: ${BOLD}source ~/.bashrc${NC} (或 ${BOLD}source ~/.zshrc${NC})"
    fi
}

# 主函数
main() {
    echo "======================================"
    echo "  Claude Code 安装/更新程序"
    echo "======================================"
    echo ""

    # 检测平台
    PLATFORM=$(detect_platform)
    log_info "检测到平台: ${BOLD}$PLATFORM${NC}"
    echo ""

    # 获取远程版本
    REMOTE_VERSION=$(get_remote_version)
    log_success "远程版本: ${BOLD}$REMOTE_VERSION${NC}"

    # 检查当前安装
    CURRENT_VERSION=$(get_current_version)
    if [ -n "$CURRENT_VERSION" ]; then
        log_info "当前版本: ${BOLD}$CURRENT_VERSION${NC}"

        # 比较版本
        compare_versions "$REMOTE_VERSION" "$CURRENT_VERSION"
        case $? in
            0)
                if [ "$FORCE" = false ]; then
                    log_success "已是最新版本，无需更新"
                    if [ "$CHECK_ONLY" = true ]; then
                        exit 0
                    fi
                    echo ""
                    read -p "是否重新安装? (y/N) " -n 1 -r
                    echo
                    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                        log_info "操作已取消"
                        exit 0
                    fi
                fi
                ;;
            1)
                log_success "发现新版本!"
                ;;
            2)
                if [ "$FORCE" = false ]; then
                    log_warn "当前版本比远程版本更新"
                    if [ "$CHECK_ONLY" = true ]; then
                        exit 0
                    fi
                    echo ""
                    read -p "是否降级到 $REMOTE_VERSION? (y/N) " -n 1 -r
                    echo
                    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                        log_info "操作已取消"
                        exit 0
                    fi
                fi
                ;;
        esac
    else
        log_info "未检测到已安装的版本，将执行新安装"
    fi

    # 仅检查模式
    if [ "$CHECK_ONLY" = true ]; then
        if [ -n "$CURRENT_VERSION" ]; then
            compare_versions "$REMOTE_VERSION" "$CURRENT_VERSION"
            if [ $? -eq 1 ]; then
                log_info "有新版本可用"
                exit 0
            else
                log_info "已是最新版本"
                exit 1
            fi
        else
            log_info "未安装"
            exit 1
        fi
    fi

    echo ""
    # 确认安装
    if [ "$FORCE" = false ]; then
        read -p "是否继续安装? (Y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            log_info "操作已取消"
            exit 0
        fi
    fi

    # 下载
    echo ""
    DOWNLOAD_PATH=$(download_file "$REMOTE_VERSION" "$PLATFORM")

    # 验证
    echo ""
    verify_checksum "$DOWNLOAD_PATH" "$REMOTE_VERSION" || true

    # 安装
    echo ""
    install_file "$DOWNLOAD_PATH" "$REMOTE_VERSION"

    # 清理
    rm -f "$DOWNLOAD_PATH"
    rmdir "$(dirname "$DOWNLOAD_PATH")" 2>/dev/null || true

    echo ""
    echo "======================================"
    log_success "安装完成!"
    echo "======================================"
    echo ""
    echo "运行以下命令开始使用:"
    echo "  ${BOLD}claude --help${NC}"
    echo ""
    echo "检查更新:"
    echo "  ${BOLD}$0 --check${NC}"
}

# 运行
main "$@"
