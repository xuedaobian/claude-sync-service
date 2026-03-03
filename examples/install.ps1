# Claude Code 安装/更新脚本 (Windows)
# 使用代理服务加速下载

param(
    [string]$BaseUrl = "https://your-worker.workers.dev",
    [switch]$Stable,
    [switch]$Force,
    [switch]$Check,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# 显示帮助
if ($Help) {
    Write-Host "用法: .\install.ps1 [选项]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "选项:"
    Write-Host "  -BaseUrl         代理服务 URL (默认: https://your-worker.workers.dev)"
    Write-Host "  -Stable          安装稳定版而非最新版"
    Write-Host "  -Force           强制重新安装，即使版本相同"
    Write-Host "  -Check           仅检查版本，不安装"
    Write-Host "  -Help            显示此帮助信息"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "  .\install.ps1              # 安装或更新到最新版"
    Write-Host "  .\install.ps1 -Check       # 检查是否有新版本"
    Write-Host "  .\install.ps1 -Stable      # 安装稳定版"
    Write-Host "  .\install.ps1 -BaseUrl https://proxy.example.com"
    exit 0
}

# 配置
$VERSION_TYPE = if ($Stable) { "stable" } else { "latest" }
$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "claude-code"
$VERSION_FILE = Join-Path $INSTALL_DIR ".version"
$FILENAME = "claude.exe"

# 日志函数
function Log-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Log-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Log-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Log-Error {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Log-Step {
    param([string]$Message)
    Write-Host "[STEP] $Message" -ForegroundColor Blue
}

# 版本比较
# 返回: 0=相等, 1=ver1 > ver2, -1=ver1 < ver2
function Compare-Version {
    param([string]$Ver1, [string]$Ver2)

    if ($Ver1 -eq $Ver2) {
        return 0
    }

    $v1Parts = $Ver1.Split('.')
    $v2Parts = $Ver2.Split('.')

    $maxLen = [Math]::Max($v1Parts.Length, $v2Parts.Length)

    for ($i = 0; $i -lt $maxLen; $i++) {
        $v1Part = if ($i -lt $v1Parts.Length) { [int]$v1Parts[$i] } else { 0 }
        $v2Part = if ($i -lt $v2Parts.Length) { [int]$v2Parts[$i] } else { 0 }

        if ($v1Part -gt $v2Part) {
            return 1
        }
        if ($v1Part -lt $v2Part) {
            return -1
        }
    }

    return 0
}

# 获取当前安装的版本
function Get-CurrentVersion {
    if (Test-Path $VERSION_FILE) {
        return Get-Content $VERSION_FILE -Raw
    }

    $installedPath = Join-Path $INSTALL_DIR $FILENAME
    if (Test-Path $installedPath) {
        try {
            $output = & $installedPath --version 2>&1
            if ($LASTEXITCODE -eq 0 -and $output) {
                return $output.ToString().Trim()
            }
        } catch {
            # 忽略错误
        }
    }

    return $null
}

# 获取远程版本
function Get-RemoteVersion {
    $url = "$BaseUrl/$VERSION_TYPE"
    Log-Info "正在获取远程版本信息..."

    try {
        # 处理重定向
        $response = Invoke-WebRequest -Uri $url -Method Head -MaximumRedirection 0 -ErrorAction SilentlyContinue
        $location = $response.Headers.Location

        if ($location) {
            $version = Split-Path $location -Leaf
            if ($version -and $version -notin @("latest", "stable")) {
                return $version
            }
        }

        # 备用方法：直接获取并解析重定向
        $version = (curl -sL -I $url 2>$null | Select-String "Location:" | ForEach-Object { $_.ToString().Split('/')[-1] })

        if ($version -and $version -notin @("latest", "stable")) {
            return $version
        }

        Log-Error "无法获取版本信息"
        exit 1
    } catch {
        Log-Error "获取版本信息失败: $_"
        exit 1
    }
}

# 下载文件
function Download-File {
    param([string]$Version, [string]$Platform = "win32-x64")

    $downloadUrl = "$BaseUrl/download/$Version/$Platform/$FILENAME"
    $tempDir = Join-Path $env:TEMP "claude-code-install"
    $outputPath = Join-Path $tempDir $FILENAME

    # 确保临时目录存在
    if (-not (Test-Path $tempDir)) {
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    }

    Log-Info "正在下载 Claude Code $Version..."
    Log-Info "下载地址: $downloadUrl"

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $outputPath -UseBasicParsing
        Log-Success "下载完成"
        return $outputPath
    } catch {
        Log-Error "下载失败: $_"
        if (Test-Path $tempDir) {
            Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        exit 1
    }
}

# 验证校验和
function Verify-Checksum {
    param([string]$FilePath, [string]$Version)

    Log-Info "正在验证文件完整性..."

    $manifestUrl = "$BaseUrl/manifest/$Version"
    $tempManifest = Join-Path $env:TEMP "claude-manifest.json"

    try {
        Invoke-WebRequest -Uri $manifestUrl -OutFile $tempManifest -UseBasicParsing

        # 计算本地文件的 SHA256
        $fileHash = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLower()

        # 从 manifest 中提取校验和
        $manifest = Get-Content $tempManifest -Raw | ConvertFrom-Json

        $expectedHash = $null
        if ($manifest.files.psobject.Properties.Match("claude.exe")) {
            $expectedHash = $manifest.files.'claude.exe'.sha256
        } elseif ($manifest.files.psobject.Properties.Match("claude")) {
            $expectedHash = $manifest.files.claude.sha256
        }

        Remove-Item $tempManifest -Force -ErrorAction SilentlyContinue

        if ($expectedHash -and $fileHash -eq $expectedHash.ToLower()) {
            Log-Success "校验和验证通过!"
            return $true
        } else {
            Log-Warn "校验和不匹配或未找到校验信息"
            return $false
        }
    } catch {
        Log-Warn "无法下载或解析校验清单: $_"
        Remove-Item $tempManifest -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# 安装文件
function Install-File {
    param([string]$SourcePath, [string]$Version)

    Log-Step "安装 Claude Code..."

    # 创建安装目录
    if (-not (Test-Path $INSTALL_DIR)) {
        New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
    }

    # 备份现有文件
    $installedPath = Join-Path $INSTALL_DIR $FILENAME
    if (Test-Path $installedPath) {
        $backupPath = Join-Path $INSTALL_DIR "claude.backup.exe"
        Copy-Item $installedPath $backupPath -Force
        Log-Info "已备份现有版本到: $backupPath"
    }

    # 复制新文件
    Copy-Item $SourcePath $installedPath -Force

    # 保存版本信息
    $Version | Out-File -FilePath $VERSION_FILE -Encoding UTF8 -NoNewline

    Log-Success "安装完成: $installedPath"
    Log-Info "版本: $Version"

    # 检查 PATH
    $pathVar = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($pathVar -notlike "*$INSTALL_DIR*") {
        Write-Host ""
        Log-Warn "警告: $INSTALL_DIR 不在用户 PATH 中"
        Write-Host ""
        Write-Host "请手动将以下路径添加到系统 PATH:" -ForegroundColor Yellow
        Write-Host "  $INSTALL_DIR" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "或运行以下命令（需要管理员权限）:" -ForegroundColor Yellow
        Write-Host '  [Environment]::SetEnvironmentVariable("Path", "' + $pathVar + ';' + $INSTALL_DIR + '", "User")' -ForegroundColor Cyan
    }
}

# 主函数
function Main {
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "  Claude Code 安装/更新程序" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""

    # 检测平台
    Log-Info "检测到平台: Windows x64"
    Write-Host ""

    # 获取远程版本
    $REMOTE_VERSION = Get-RemoteVersion
    Log-Success "远程版本: $REMOTE_VERSION"

    # 检查当前安装
    $CURRENT_VERSION = Get-CurrentVersion
    if ($CURRENT_VERSION) {
        Log-Info "当前版本: $CURRENT_VERSION"

        # 比较版本
        $cmp = Compare-Version $REMOTE_VERSION $CURRENT_VERSION
        switch ($cmp) {
            0 {
                if (-not $Force) {
                    Log-Success "已是最新版本，无需更新"
                    if ($Check) {
                        exit 0
                    }
                    Write-Host ""
                    $confirm = Read-Host "是否重新安装? (y/N)"
                    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
                        Log-Info "操作已取消"
                        exit 0
                    }
                }
            }
            1 {
                Log-Success "发现新版本!"
            }
            -1 {
                if (-not $Force) {
                    Log-Warn "当前版本比远程版本更新"
                    if ($Check) {
                        exit 0
                    }
                    Write-Host ""
                    $confirm = Read-Host "是否降级到 $REMOTE_VERSION? (y/N)"
                    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
                        Log-Info "操作已取消"
                        exit 0
                    }
                }
            }
        }
    } else {
        Log-Info "未检测到已安装的版本，将执行新安装"
    }

    # 仅检查模式
    if ($Check) {
        if ($CURRENT_VERSION) {
            $cmp = Compare-Version $REMOTE_VERSION $CURRENT_VERSION
            if ($cmp -eq 1) {
                Log-Info "有新版本可用"
                exit 0
            } else {
                Log-Info "已是最新版本"
                exit 1
            }
        } else {
            Log-Info "未安装"
            exit 1
        }
    }

    Write-Host ""
    # 确认安装
    if (-not $Force) {
        $confirm = Read-Host "是否继续安装? (Y/n)"
        if ($confirm -eq 'n' -or $confirm -eq 'N') {
            Log-Info "操作已取消"
            exit 0
        }
    }

    # 下载
    Write-Host ""
    $DOWNLOAD_PATH = Download-File -Version $REMOTE_VERSION

    # 验证
    Write-Host ""
    Verify-Checksum -FilePath $DOWNLOAD_PATH -Version $REMOTE_VERSION

    # 安装
    Write-Host ""
    Install-File -SourcePath $DOWNLOAD_PATH -Version $REMOTE_VERSION

    # 清理
    Remove-Item $DOWNLOAD_PATH -Force -ErrorAction SilentlyContinue
    $tempDir = Split-Path $DOWNLOAD_PATH
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Log-Success "安装完成!"
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "运行以下命令开始使用:"
    Write-Host "  claude --help" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "检查更新:"
    Write-Host "  .\install.ps1 -Check" -ForegroundColor Cyan
}

# 运行
Main
