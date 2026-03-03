# Claude Code Proxy Service

<div align="center">

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)
![License](https://img.shields.io/badge/license-MIT-blue)
![GitHub Stars](https://img.shields.io/github/stars/xuedaobian/claude-sync-service?style=social)

**Cloudflare Worker 代理服务 - 加速 Claude Code 国内下载**

[功能特性](#功能特性) • [快速开始](#快速开始) • [使用说明](#使用说明) • [API 文档](#api-端点)

</div>

---

## 简介

Claude Code 安装包托管在 Google Cloud Storage (GCS) 上，在国内地区访问速度较慢或无法访问。本项目创建了一个基于 Cloudflare Workers 的代理服务，通过 Cloudflare 的全球 CDN 网络加速下载。

### 原理

```
┌─────────────┐        ┌──────────────────┐        ┌─────────────────┐
│   用户请求   │ ────→  │ Cloudflare Worker│ ────→  │ Google Cloud    │
│  (国内地区)  │        │   (代理服务)      │        │   Storage       │
└─────────────┘        └──────────────────┘        └─────────────────┘
                              │                             │
                              ←─────────────────────────────┘
                              响应通过 CF CDN 加速返回
```

## 功能特性

- ✅ **加速下载** - 利用 Cloudflare 全球 CDN 网络
- ✅ **跨域支持** - 完整的 CORS 配置
- ✅ **版本查询** - 支持 latest/stable 版本获取
- ✅ **断点续传** - 支持 Range 请求
- ✅ **完整性校验** - 支持 manifest.json 校验
- ✅ **零成本部署** - 使用 Cloudflare Workers 免费额度

## 快速开始

### 前置要求

- [Cloudflare 账户](https://dash.cloudflare.com/sign-up)（免费即可）
- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

### 一键部署

```bash
# 1. 克隆项目
git clone https://github.com/xuedaobian/claude-sync-service.git
cd claude-sync-service

# 2. 安装 Wrangler
npm install -g wrangler

# 3. 登录 Cloudflare
wrangler login

# 4. 部署
npm run deploy
```

部署成功后，你会得到一个类似 `https://claude-code-proxy.your-subdomain.workers.dev` 的 URL。

> 💡 **演示实例**: `https://claude-code-proxy.linchuan.workers.dev` (由作者维护)

### 快速验证

```bash
# 健康检查
curl https://your-worker.workers.dev/health

# 获取最新版本
curl https://your-worker.workers.dev/latest
```

## 使用说明

### 方式一：直接使用 API

#### 下载 Claude Code

```bash
# 使用演示实例
export BASE_URL="https://claude-code-proxy.linchuan.workers.dev"

# 1. 获取最新版本号
VERSION=$(curl -sL $BASE_URL/latest | xargs basename)

# 2. 根据你的平台下载
# macOS ARM64 (Apple Silicon)
curl -O $BASE_URL/download/${VERSION}/darwin-arm64/claude

# macOS Intel
curl -O $BASE_URL/download/${VERSION}/darwin-x64/claude

# Linux x64
curl -O $BASE_URL/download/${VERSION}/linux-x64/claude

# 3. 添加执行权限
chmod +x claude

# 4. 移动到 PATH
sudo mv claude /usr/local/bin/
```

### 方式二：使用安装脚本

项目提供了现成的安装脚本：

```bash
# macOS/Linux
curl -fsSL https://raw.githubusercontent.com/xuedaobian/claude-sync-service/main/examples/install.sh | bash

# 指定代理 URL
BASE_URL=https://your-worker.workers.dev bash install.sh
```

```powershell
# Windows PowerShell
Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/xuedaobian/claude-sync-service/main/examples/install.ps1").Content
```

### 方式三：修改 Claude Code 官方安装脚本

如果你使用 Claude Code 的官方安装脚本，只需修改一处：

```bash
# 原始脚本
BASE_URL="https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases"

# 改为你的代理 URL
BASE_URL="https://your-worker.workers.dev"
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/latest` | GET | 重定向到最新版本 |
| `/stable` | GET | 重定向到稳定版本 |
| `/manifest/{version}` | GET | 获取版本校验清单 |
| `/download/{version}/{platform}/{file}` | GET | 下载文件 |

### 支持的平台

| 平台 | Platform 参数 |
|------|--------------|
| Windows x64 | `win32-x64` |
| macOS ARM64 | `darwin-arm64` |
| macOS x64 | `darwin-x64` |
| Linux x64 | `linux-x64` |

### 请求示例

```bash
# 获取最新版本
curl https://your-worker.workers.dev/latest

# 获取稳定版本
curl https://your-worker.workers.dev/stable

# 获取 2.1.19 版本的校验清单
curl https://your-worker.workers.dev/manifest/2.1.19

# 下载 2.1.19 版本 Windows x64
curl -O https://your-worker.workers.dev/download/2.1.19/win32-x64/claude.exe
```

## 绑定自定义域名

### 步骤 1：准备域名

在 Cloudflare 托管你的域名（或购买新域名）

### 步骤 2：修改 `wrangler.toml`

```toml
[env.production]
routes = [
  { pattern = "claude.your-domain.com/*", zone_name = "your-domain.com" }
]
```

### 步骤 3：重新部署

```bash
npm run deploy:production
```

## 监控与日志

### 查看实时日志

```bash
npm run tail
```

### Cloudflare Analytics

访问 Cloudflare Dashboard → Workers → 你的 Worker → Analytics

## 配置选项

### wrangler.toml 配置

```toml
name = "claude-code-proxy"
main = "worker.js"
compatibility_date = "2024-01-01"

# 环境变量
[vars]
ENVIRONMENT = "production"

# KV 缓存（可选）
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"

# 自定义域名（可选）
[env.production]
routes = [
  { pattern = "claude.example.com/*", zone_name = "example.com" }
]
```

## 限制说明

| 项目 | 免费版限制 |
|------|----------|
| 请求次数 | 100,000 次/天 |
| 单文件大小 | 128 MB |
| CPU 时间 | 30 秒/请求 |
| 月带宽 | 无限 |

> 💡 大部分 Claude Code 安装包都小于 100MB，完全符合免费版要求。

## 故障排查

### 部署失败

```bash
# 检查登录状态
wrangler whoami

# 查看详细日志
wrangler deploy --verbose
```

### 请求 404

确认 URL 路径格式正确：
- ✅ `/latest`
- ✅ `/stable`
- ✅ `/download/2.1.19/win32-x64/claude.exe`
- ✅ `/manifest/2.1.19`
- ❌ `/claude-code-releases/latest`（不需要前缀）

### 下载速度慢

1. 确认使用 HTTPS
2. 检查 Cloudflare 状态页面
3. 尝试切换到其他 Cloudflare 边缘节点

## 架构说明

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare Network                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Cloudflare Worker                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │  路由处理    │  │  CORS 配置   │  │  请求代理     │  │  │
│  │  └─────────────┘  └─────────────┘  └──────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             │
                             ▼
              ┌────────────────────────────┐
              │  Google Cloud Storage      │
              │  (claude-code-releases)    │
              └────────────────────────────┘
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 相关资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Claude Code 官网](https://claude.ai/code)

---

<div align="center">
Made with ❤️ for faster Claude Code downloads in China
</div>
