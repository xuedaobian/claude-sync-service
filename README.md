# Claude Code Proxy Service

Cloudflare Worker 代理服务，用于加速 Claude Code 在国内地区的下载。

## 功能

- 代理 Google Cloud Storage 上的 Claude Code 发布文件
- 利用 Cloudflare 全球 CDN 网络加速访问
- 支持 CORS 跨域访问
- 支持版本查询和文件下载

## 部署步骤

### 1. 安装依赖

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 配置项目

复制项目根目录后，确保 `wrangler.toml` 配置正确：

```toml
name = "claude-code-proxy"
main = "worker.js"
compatibility_date = "2024-01-01"
```

### 4. 部署

```bash
# 部署到默认环境
npm run deploy

# 或部署到生产环境
npm run deploy:production
```

部署完成后，你会看到类似以下的输出：

```
Published claude-code-proxy (0.12 sec)
  https://claude-code-proxy.your-subdomain.workers.dev
```

## API 端点

部署后，可以通过以下端点访问：

### 健康检查

```bash
curl https://your-worker.workers.dev/health
```

### 获取最新版本

```bash
curl https://your-worker.workers.dev/latest
```

### 获取稳定版本

```bash
curl https://your-worker.workers.dev/stable
```

### 下载特定版本的文件

```bash
# Windows x64
curl -O https://your-worker.workers.dev/download/2.1.19/win32-x64/claude.exe

# macOS ARM64
curl -O https://your-worker.workers.dev/download/2.1.19/darwin-arm64/claude

# macOS x64
curl -O https://your-worker.workers.dev/download/2.1.19/darwin-x64/claude

# Linux x64
curl -O https://your-worker.workers.dev/download/2.1.19/linux-x64/claude
```

### 获取版本校验清单

```bash
curl https://your-worker.workers.dev/manifest/2.1.19
```

## 绑定自定义域名（可选）

### 1. 在 Cloudflare 购买或添加域名

### 2. 更新 `wrangler.toml`

```toml
[env.production]
routes = [
  { pattern = "claude.your-domain.com/*", zone_name = "your-domain.com" }
]
```

### 3. 重新部署

```bash
npm run deploy:production
```

## 使用示例

### 修改 Claude Code 安装脚本

将原安装脚本中的 GCS URL 替换为代理 URL：

**PowerShell (Windows):**

```powershell
# 原始 URL
$baseUrl = "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases"

# 替换为代理 URL
$baseUrl = "https://your-worker.workers.dev"
```

**Bash (macOS/Linux):**

```bash
# 原始 URL
BASE_URL="https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases"

# 替换为代理 URL
BASE_URL="https://your-worker.workers.dev"
```

## 监控和日志

查看实时日志：

```bash
npm run tail
```

## 架构说明

```
用户请求
   ↓
Cloudflare Worker (本服务)
   ↓
Google Cloud Storage (claude-code-releases)
   ↓
响应通过 CF 网络返回
```

## 限制和注意事项

1. **免费额度**: Cloudflare Workers 免费版每天 100,000 次请求
2. **文件大小**: 单个请求最大 128MB（CF Worker 限制）
3. **超时**: 请求超时时间为 30 秒（CPU 时间）

## 故障排查

### 部署失败

```bash
# 检查登录状态
wrangler whoami

# 检查配置
wrangler tail
```

### 请求 404

确认 URL 路径正确：
- `/latest` ✓
- `/stable` ✓
- `/download/VERSION/PLATFORM/FILENAME` ✓
- `/manifest/VERSION` ✓

### CORS 错误

确保 Worker 正确设置了 CORS 头。检查 `worker.js` 中的 `createResponse` 函数。

## 扩展功能

### 添加 KV 缓存

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
```

### 添加访问统计

可以集成 Cloudflare Analytics 或添加自定义日志记录。

## 许可证

MIT
