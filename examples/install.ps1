# Claude Code Installation Script (Windows)
# 使用代理服务加速下载

param(
    [string]$BaseUrl = "https://your-worker.workers.dev",
    [switch]$Stable
)

$ErrorActionPreference = "Stop"

function Get-LatestVersion {
    $url = if ($Stable) {
        "$BaseUrl/stable"
    } else {
        "$BaseUrl/latest"
    }

    Write-Host "正在获取版本信息..." -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri $url -MaximumRedirection 0 -ErrorAction SilentlyContinue
    return $response
}

function Download-ClaudeCode {
    param([string]$Version, [string]$Platform = "win32-x64")

    $filename = "claude.exe"
    $downloadUrl = "$BaseUrl/download/$Version/$Platform/$filename"
    $outputPath = Join-Path $env:TEMP $filename

    Write-Host "正在下载 Claude Code $Version..." -ForegroundColor Cyan
    Write-Host "下载地址: $downloadUrl" -ForegroundColor Gray

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $outputPath -UseBasicParsing
        Write-Host "下载完成: $outputPath" -ForegroundColor Green
        return $outputPath
    } catch {
        Write-Error "下载失败: $_"
        throw
    }
}

function Verify-Checksum {
    param([string]$FilePath, [string]$Version)

    Write-Host "正在验证文件完整性..." -ForegroundColor Cyan

    $manifestUrl = "$BaseUrl/manifest/$Version"
    try {
        $manifest = Invoke-RestMethod -Uri $manifestUrl

        # 计算本地文件的 SHA256
        $fileHash = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLower()

        # 从 manifest 中查找对应的校验和
        $filename = Split-Path $FilePath -Leaf
        $expectedHash = $manifest.files.$filename.sha256

        if ($expectedHash -and $fileHash -eq $expectedHash.ToLower()) {
            Write-Host "校验和验证通过!" -ForegroundColor Green
            return $true
        } else {
            Write-Warning "校验和不匹配或未找到校验信息"
            return $false
        }
    } catch {
        Write-Warning "无法验证校验和: $_"
        return $false
    }
}

function Install-ClaudeCode {
    param([string]$SourcePath)

    $installDir = Join-Path $env:LOCALAPPDATA "claude-code"

    if (-not (Test-Path $installDir)) {
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    }

    $destPath = Join-Path $installDir "claude.exe"

    Copy-Item -Path $SourcePath -Destination $destPath -Force

    # 添加到 PATH
    $pathVar = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($pathVar -notlike "*$installDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$pathVar;$installDir", "User")
        Write-Host "已将 Claude Code 添加到用户 PATH" -ForegroundColor Yellow
        Write-Host "请重启终端以使更改生效" -ForegroundColor Yellow
    }

    Write-Host "安装完成: $destPath" -ForegroundColor Green
}

# Main
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Claude Code 安装程序 (代理版)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

try {
    # 获取版本
    $versionInfo = Get-LatestVersion
    $version = $versionInfo.version
    Write-Host "目标版本: $version" -ForegroundColor Green
    Write-Host ""

    # 下载
    $downloadPath = Download-ClaudeCode -Version $version

    # 验证（可选）
    Verify-Checksum -FilePath $downloadPath -Version $version

    # 安装
    Write-Host ""
    $confirm = Read-Host "是否安装到 $env:LOCALAPPDATA\claude-code? (Y/N)"
    if ($confirm -eq 'Y' -or $confirm -eq 'y') {
        Install-ClaudeCode -SourcePath $downloadPath
    } else {
        Write-Host "安装已取消。文件保存在: $downloadPath" -ForegroundColor Yellow
    }

} catch {
    Write-Error "安装失败: $_"
    exit 1
} finally {
    # 清理临时文件
    if (Test-Path $downloadPath) {
        Remove-Item $downloadPath -Force -ErrorAction SilentlyContinue
    }
}
