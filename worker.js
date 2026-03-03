/**
 * Cloudflare Worker for Claude Code Release Proxy
 *
 * Proxies requests from Google Cloud Storage to Cloudflare's network
 * for improved access in regions with poor GCS connectivity.
 */

// GCS base URL for Claude Code releases
const GCS_BASE_URL = 'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases';

// Platform mappings (friendly names -> GCS platform names)
const PLATFORM_MAP = {
  'windows': 'win32-x64',
  'win': 'win32-x64',
  'macos-arm': 'darwin-arm64',
  'mac-arm': 'darwin-arm64',
  'macos-intel': 'darwin-x64',
  'mac-intel': 'darwin-x64',
  'linux': 'linux-x64',
  'lin': 'linux-x64',
};

// File names for each platform
const FILE_NAMES = {
  'win32-x64': 'claude.exe',
  'darwin-arm64': 'claude',
  'darwin-x64': 'claude',
  'linux-x64': 'claude',
};

/**
 * Parse platform from path and return GCS platform name
 */
function parsePlatform(platform) {
  return PLATFORM_MAP[platform.toLowerCase()] || null;
}

/**
 * Get the latest version number
 */
async function getLatestVersion(stable = false) {
  const url = stable ? `${GCS_BASE_URL}/stable` : `${GCS_BASE_URL}/latest`;
  try {
    const response = await fetch(url);
    const text = await response.text();
    // GCS returns the version number as plain text
    return text.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Handle root path - return download page
 */
function handleIndex(url) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Code 下载</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .version {
            background: #f0f0f0;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 24px;
            font-size: 14px;
            color: #555;
        }
        .version strong { color: #333; }
        .download-grid {
            display: grid;
            gap: 12px;
        }
        .download-btn {
            display: block;
            padding: 16px 24px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 10px;
            transition: all 0.3s;
            font-weight: 500;
            text-align: center;
        }
        .download-btn:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .download-btn .platform {
            display: block;
            font-size: 18px;
            margin-bottom: 4px;
        }
        .download-btn .desc {
            display: block;
            font-size: 12px;
            opacity: 0.9;
        }
        .footer {
            margin-top: 24px;
            text-align: center;
            font-size: 12px;
            color: #999;
        }
        .footer a { color: #667eea; text-decoration: none; }
        .footer a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Claude Code</h1>
        <p class="subtitle">AI 驱动的命令行开发工具</p>
        <div class="version">
            当前版本: <strong id="version">加载中...</strong>
        </div>
        <div class="download-grid">
            <a href="/download/windows" class="download-btn">
                <span class="platform">🪟 Windows</span>
                <span class="desc">Windows x64</span>
            </a>
            <a href="/download/macos-arm" class="download-btn">
                <span class="platform">🍎 macOS ARM</span>
                <span class="desc">Apple Silicon (M1/M2/M3)</span>
            </a>
            <a href="/download/macos-intel" class="download-btn">
                <span class="platform">🍎 macOS Intel</span>
                <span class="desc">Intel 处理器</span>
            </a>
            <a href="/download/linux" class="download-btn">
                <span class="platform">🐧 Linux</span>
                <span class="desc">Linux x64</span>
            </a>
        </div>
        <div class="footer">
            由 <a href="https://github.com/xuedaobian/claude-sync-service">Claude Code Proxy</a> 提供加速服务
        </div>
    </div>
    <script>
        fetch('/latest').then(r => r.text()).then(v => {
            document.getElementById('version').textContent = v || '最新版';
        }).catch(() => {
            document.getElementById('version').textContent = '最新版';
        });
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

/**
 * Parse request path and determine target GCS URL
 * Returns { url: string, isRedirect: boolean }
 */
async function getTargetUrl(pathname) {
  // Remove leading slash
  const path = pathname.startsWith('/') ? pathname.slice(1) : pathname;

  // Root or health check
  if (path === '' || path === 'health') {
    return { url: null, special: 'health' };
  }

  // Latest version
  if (path === 'latest') {
    return { url: `${GCS_BASE_URL}/latest`, isVersion: true };
  }

  // Stable version
  if (path === 'stable') {
    return { url: `${GCS_BASE_URL}/stable`, isVersion: true };
  }

  // Manifest for specific version
  if (path.startsWith('manifest/')) {
    const version = path.split('/')[2];
    return { url: `${GCS_BASE_URL}/${version}/manifest.json` };
  }

  // Simple download: /download/{platform}
  if (path.startsWith('download/')) {
    const parts = path.split('/');

    // /download alone -> redirect to index
    if (parts.length === 1) {
      return { url: null, special: 'redirect-index' };
    }

    const platform = parsePlatform(parts[1]);
    if (!platform) {
      return { url: null, special: 'invalid-platform' };
    }

    // Check if requesting stable version
    const isStable = parts[2] === 'stable';

    // Get latest version and construct download URL
    const version = await getLatestVersion(isStable);
    if (!version) {
      return { url: null, special: 'version-error' };
    }

    const filename = FILE_NAMES[platform];
    const downloadUrl = `${GCS_BASE_URL}/${version}/${platform}/${filename}`;

    return { url: downloadUrl, isDownload: true, version, platform };
  }

  // Legacy: /download/{version}/{platform}/{filename}
  if (path.match(/^download\/[^/]+\/[^/]+\/.+/)) {
    const parts = path.split('/');
    const version = parts[1];
    const platform = parts[2];
    const filename = parts.slice(3).join('/');
    return { url: `${GCS_BASE_URL}/${version}/${platform}/${filename}` };
  }

  // Default: treat as direct GCS path
  return { url: `${GCS_BASE_URL}/${path}` };
}

/**
 * Handle CORS preflight requests
 */
function handleCors() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Create CORS-enabled response
 */
function createResponse(response, extraHeaders = {}) {
  const headers = new Headers();

  // Copy relevant headers from GCS response
  const copyHeaders = [
    'content-type',
    'content-length',
    'content-disposition',
    'etag',
    'last-modified',
    'cache-control',
  ];

  for (const header of copyHeaders) {
    const value = response.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  }

  // Add CORS headers
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Expose-Headers', '*');

  // Add security headers
  headers.set('X-Content-Type-Options', 'nosniff');

  // Add extra headers
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Handle health check
 */
function handleHealth() {
  return new Response(JSON.stringify({
    status: 'healthy',
    service: 'claude-code-proxy',
    timestamp: new Date().toISOString(),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Handle errors
 */
function handleError(errorType) {
  const errors = {
    'invalid-platform': {
      status: 400,
      body: {
        error: 'Invalid platform',
        message: 'Supported platforms: windows, macos-arm, macos-intel, linux',
        examples: ['/download/windows', '/download/macos-arm', '/download/linux'],
      },
    },
    'version-error': {
      status: 502,
      body: {
        error: 'Failed to get version',
        message: 'Could not determine the latest version',
      },
    },
  };

  const error = errors[errorType];
  if (error) {
    return new Response(JSON.stringify(error.body), {
      status: error.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return null;
}

/**
 * Main fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    // Only allow GET and HEAD methods
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: {
          'Allow': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Root path - show download page
    if (pathname === '' || pathname === '/') {
      return handleIndex(url);
    }

    // Get target GCS URL
    const target = await getTargetUrl(pathname);

    // Handle special cases
    if (target.special === 'health') {
      return handleHealth();
    }
    if (target.special === 'redirect-index') {
      return Response.redirect(new URL('/', url).toString(), 302);
    }
    if (target.special === 'invalid-platform' || target.special === 'version-error') {
      return handleError(target.special);
    }

    // Handle latest/stable version requests
    if (target.isVersion) {
      try {
        const gcsResponse = await fetch(target.url);
        const version = await gcsResponse.text();
        return new Response(version.trim(), {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: 'Failed to fetch version',
          message: error.message,
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    // Proxy request to GCS
    try {
      const gcsResponse = await fetch(target.url, {
        method: request.method,
        headers: {
          'Range': request.headers.get('Range') || '',
          'User-Agent': request.headers.get('User-Agent') || 'Claude-Code-Proxy/1.0',
        },
      });

      // Add content disposition for downloads
      const extraHeaders = {};
      if (target.isDownload) {
        const filename = FILE_NAMES[target.platform];
        extraHeaders['Content-Disposition'] = `attachment; filename="${filename}"`;
      }

      return createResponse(gcsResponse, extraHeaders);
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Proxy error',
        message: error.message,
        target: target.url,
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
