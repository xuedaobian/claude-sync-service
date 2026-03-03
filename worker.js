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
    <title>Claude Code // TERMINAL_DOWNLOAD</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        :root {
            --terminal-black: #0a0a0a;
            --terminal-green: #00ff41;
            --terminal-cyan: #00d9ff;
            --terminal-dim: #003300;
            --terminal-glow: rgba(0, 255, 65, 0.5);
            --scanline-color: rgba(0, 0, 0, 0.5);
        }

        body {
            font-family: 'JetBrains Mono', 'Courier New', monospace;
            background: var(--terminal-black);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
            overflow-x: hidden;
        }

        /* CRT Scanline Effect */
        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: repeating-linear-gradient(
                0deg,
                rgba(0, 0, 0, 0.15),
                rgba(0, 0, 0, 0.15) 1px,
                transparent 1px,
                transparent 2px
            );
            pointer-events: none;
            z-index: 1000;
            animation: scanlines 8s linear infinite;
        }

        @keyframes scanlines {
            0% { transform: translateY(0); }
            100% { transform: translateY(10px); }
        }

        /* Ambient Glow Background */
        .ambient-glow {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 800px;
            height: 800px;
            background: radial-gradient(circle, var(--terminal-glow) 0%, transparent 70%);
            opacity: 0.1;
            animation: pulse 4s ease-in-out infinite;
            z-index: 0;
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.1; transform: translate(-50%, -50%) scale(1); }
            50% { opacity: 0.15; transform: translate(-50%, -50%) scale(1.1); }
        }

        .terminal {
            position: relative;
            z-index: 1;
            max-width: 700px;
            width: 100%;
        }

        /* ASCII Art Header */
        .ascii-header {
            color: var(--terminal-green);
            font-size: 10px;
            line-height: 1.2;
            margin-bottom: 20px;
            text-align: center;
            opacity: 0;
            animation: fadeIn 0.8s ease-out 0.2s forwards;
            white-space: pre;
            font-family: 'JetBrains Mono', monospace;
        }

        /* Title with Glitch Effect */
        .title-container {
            margin-bottom: 30px;
            text-align: center;
        }

        .title {
            font-family: 'Orbitron', sans-serif;
            font-size: clamp(28px, 6vw, 48px);
            font-weight: 900;
            color: var(--terminal-cyan);
            text-shadow:
                0 0 10px var(--terminal-cyan),
                0 0 20px var(--terminal-cyan),
                0 0 40px var(--terminal-cyan),
                2px 2px 0 var(--terminal-green);
            letter-spacing: 4px;
            opacity: 0;
            animation: titleGlitch 0.5s ease-out 0.5s forwards,
                       titlePulse 3s ease-in-out infinite 1s;
            position: relative;
        }

        @keyframes titleGlitch {
            0% { opacity: 0; transform: translateX(-20px); filter: blur(10px); }
            50% { transform: translateX(2px); filter: blur(2px); }
            100% { opacity: 1; transform: translateX(0); filter: blur(0); }
        }

        @keyframes titlePulse {
            0%, 100% { text-shadow: 0 0 10px var(--terminal-cyan), 0 0 20px var(--terminal-cyan), 2px 2px 0 var(--terminal-green); }
            50% { text-shadow: 0 0 20px var(--terminal-cyan), 0 0 40px var(--terminal-cyan), 0 0 60px var(--terminal-cyan), 2px 2px 0 var(--terminal-green); }
        }

        .subtitle {
            color: var(--terminal-green);
            font-size: 12px;
            letter-spacing: 8px;
            text-transform: uppercase;
            margin-top: 10px;
            opacity: 0;
            animation: slideIn 0.6s ease-out 0.8s forwards;
        }

        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Version Display */
        .version-display {
            background: rgba(0, 255, 65, 0.05);
            border: 1px solid var(--terminal-dim);
            padding: 15px 20px;
            margin: 25px 0;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 15px;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 1s forwards;
            position: relative;
            overflow: hidden;
        }

        .version-display::before {
            content: '>>';
            color: var(--terminal-green);
            font-weight: 700;
            animation: blink 1s step-end infinite;
        }

        .version-display::after {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            width: 2px;
            height: 100%;
            background: var(--terminal-green);
            box-shadow: 0 0 10px var(--terminal-green);
            animation: progress 1.5s ease-out forwards;
        }

        @keyframes progress {
            from { width: 0; }
            to { width: 100%; opacity: 0; }
        }

        @keyframes blink {
            50% { opacity: 0; }
        }

        .version-label {
            color: var(--terminal-green);
            opacity: 0.7;
        }

        .version-number {
            color: var(--terminal-cyan);
            font-weight: 700;
            font-size: 16px;
            text-shadow: 0 0 10px var(--terminal-cyan);
        }

        /* Download Terminal */
        .download-terminal {
            background: rgba(0, 20, 0, 0.3);
            border: 1px solid var(--terminal-dim);
            padding: 25px;
            position: relative;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 1.2s forwards;
        }

        .terminal-prompt {
            color: var(--terminal-green);
            font-size: 11px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .prompt-symbol {
            animation: blink 1s step-end infinite;
        }

        .prompt-text {
            opacity: 0.8;
        }

        .download-grid {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .download-btn {
            display: flex;
            align-items: center;
            padding: 15px 20px;
            background: transparent;
            border: 1px solid var(--terminal-dim);
            color: var(--terminal-green);
            text-decoration: none;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .download-btn::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            width: 0;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(0, 255, 65, 0.1), transparent);
            transition: width 0.5s ease;
        }

        .download-btn:hover::before {
            width: 100%;
        }

        .download-btn:hover {
            border-color: var(--terminal-green);
            background: rgba(0, 255, 65, 0.05);
            box-shadow: 0 0 20px rgba(0, 255, 65, 0.2), inset 0 0 20px rgba(0, 255, 65, 0.05);
            transform: translateX(5px);
        }

        .download-btn .icon {
            font-size: 20px;
            margin-right: 15px;
            opacity: 0.8;
            transition: transform 0.3s ease;
        }

        .download-btn:hover .icon {
            transform: scale(1.2);
            text-shadow: 0 0 10px var(--terminal-green);
        }

        .download-btn .info {
            flex: 1;
        }

        .download-btn .platform {
            display: block;
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
        }

        .download-btn .arch {
            display: block;
            font-size: 11px;
            opacity: 0.6;
            margin-top: 2px;
        }

        .download-btn .arrow {
            font-size: 18px;
            opacity: 0;
            transform: translateX(-10px);
            transition: all 0.3s ease;
        }

        .download-btn:hover .arrow {
            opacity: 1;
            transform: translateX(0);
        }

        /* Footer */
        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 10px;
            color: var(--terminal-green);
            opacity: 0.5;
            opacity: 0;
            animation: fadeIn 0.6s ease-out 1.6s forwards;
            letter-spacing: 2px;
        }

        .footer a {
            color: var(--terminal-cyan);
            text-decoration: none;
            transition: all 0.3s ease;
        }

        .footer a:hover {
            text-shadow: 0 0 10px var(--terminal-cyan);
        }

        @keyframes fadeIn {
            to { opacity: 1; }
        }

        /* Cursor */
        .cursor {
            display: inline-block;
            width: 10px;
            height: 18px;
            background: var(--terminal-green);
            animation: blink 1s step-end infinite;
            vertical-align: middle;
            margin-left: 5px;
        }

        /* Responsive */
        @media (max-width: 600px) {
            .title {
                font-size: 24px;
                letter-spacing: 2px;
            }
            .subtitle {
                letter-spacing: 4px;
                font-size: 10px;
            }
            .download-terminal {
                padding: 15px;
            }
            .ascii-header {
                font-size: 7px;
            }
        }
    </style>
</head>
<body>
    <div class="ambient-glow"></div>
    <div class="terminal">
        <div class="ascii-header">
███╗   ███╗██╗   ██╗███████╗██╗   ██╗
████╗ ████║██║   ██║██╔════╝██║   ██║
██╔████╔██║██║   ██║███████╗██║   ██║
██║╚██╔╝██║██║   ██║╚════██║██║   ██║
██║ ╚═╝ ██║╚██████╔╝███████║╚██████╔╝
╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝
        </div>

        <div class="title-container">
            <h1 class="title">CLAUDE CODE</h1>
            <p class="subtitle">AI // TERMINAL // INTERFACE</p>
        </div>

        <div class="version-display">
            <span class="version-label">CURRENT_VERSION</span>
            <span class="version-number" id="version">DETECTING...</span>
        </div>

        <div class="download-terminal">
            <div class="terminal-prompt">
                <span class="prompt-symbol">$</span>
                <span class="prompt-text">select_target_platform</span>
            </div>

            <div class="download-grid">
                <a href="/download/windows" class="download-btn">
                    <span class="icon">▣</span>
                    <div class="info">
                        <span class="platform">WINDOWS</span>
                        <span class="arch">x64 architecture</span>
                    </div>
                    <span class="arrow">→</span>
                </a>

                <a href="/download/macos-arm" class="download-btn">
                    <span class="icon">◈</span>
                    <div class="info">
                        <span class="platform">MACOS ARM</span>
                        <span class="arch">Apple Silicon M1/M2/M3</span>
                    </div>
                    <span class="arrow">→</span>
                </a>

                <a href="/download/macos-intel" class="download-btn">
                    <span class="icon">◈</span>
                    <div class="info">
                        <span class="platform">MACOS INTEL</span>
                        <span class="arch">x86_64 architecture</span>
                    </div>
                    <span class="arrow">→</span>
                </a>

                <a href="/download/linux" class="download-btn">
                    <span class="icon">◇</span>
                    <div class="info">
                        <span class="platform">LINUX</span>
                        <span class="arch">x64 architecture</span>
                    </div>
                    <span class="arrow">→</span>
                </a>
            </div>
        </div>

        <div class="footer">
            <a href="https://github.com/xuedaobian/claude-sync-service" target="_blank">
                [PROXY_SERVICE_V1.0]
            </a>
            <span style="margin: 0 10px;">::</span>
            <span>cloudflare_workers_network</span>
        </div>
    </div>

    <script>
        (function() {
            const versionEl = document.getElementById('version');

            // Typing effect for version detection
            const statusTexts = ['SCANNING...', 'DETECTING...', 'LOADING...'];
            let statusIndex = 0;

            const typeInterval = setInterval(() => {
                versionEl.textContent = statusTexts[statusIndex];
                statusIndex = (statusIndex + 1) % statusTexts.length;
            }, 200);

            // Fetch actual version
            fetch('/latest')
                .then(r => r.text())
                .then(v => {
                    clearInterval(typeInterval);
                    const version = v.trim();
                    typeText(versionEl, 'v' + version);
                })
                .catch(() => {
                    clearInterval(typeInterval);
                    versionEl.textContent = 'vLATEST';
                });

            function typeText(element, text) {
                element.textContent = '';
                let i = 0;
                const typeInterval = setInterval(() => {
                    if (i < text.length) {
                        element.textContent += text[i];
                        i++;
                    } else {
                        clearInterval(typeInterval);
                    }
                }, 50);
            }
        })();
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
