/**
 * Cloudflare Worker for Claude Code Release Proxy
 *
 * Proxies requests from Google Cloud Storage to Cloudflare's network
 * for improved access in regions with poor GCS connectivity.
 */

// GCS base URL for Claude Code releases
const GCS_BASE_URL = 'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases';

/**
 * Parse request path and determine target GCS URL
 */
function getTargetUrl(pathname) {
  // Remove leading slash and decode
  const path = pathname.startsWith('/') ? pathname.slice(1) : pathname;

  // Health check endpoint
  if (path === '' || path === 'health') {
    return null; // Special handling
  }

  // Latest version redirect
  if (path === 'latest') {
    return `${GCS_BASE_URL}/latest`;
  }

  // Stable version redirect
  if (path === 'stable') {
    return `${GCS_BASE_URL}/stable`;
  }

  // Manifest for specific version
  if (path.startsWith('manifest/')) {
    const version = path.split('/')[2];
    return `${GCS_BASE_URL}/${version}/manifest.json`;
  }

  // Download specific file
  if (path.startsWith('download/')) {
    // Extract version/platform/filename from path like: download/2.1.19/win32-x64/claude.exe
    const parts = path.split('/');
    if (parts.length >= 4) {
      const version = parts[1];
      const platform = parts[2];
      const filename = parts.slice(3).join('/');
      return `${GCS_BASE_URL}/${version}/${platform}/${filename}`;
    }
  }

  // Default: treat as direct GCS path
  return `${GCS_BASE_URL}/${path}`;
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
function createResponse(response) {
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
 * Handle redirect to latest/stable
 */
async function handleRedirect(gcsUrl) {
  try {
    const response = await fetch(gcsUrl, {
      method: 'GET',
      redirect: 'manual', // Get the redirect location
    });

    const location = response.headers.get('Location');
    if (location) {
      return Response.redirect(location, 302);
    }

    // If no redirect, proxy the response
    return createResponse(response);
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch version info',
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

    // Health check
    if (pathname === '' || pathname === '/' || pathname === '/health') {
      return handleHealth();
    }

    // Get target GCS URL
    const targetUrl = getTargetUrl(pathname);

    if (!targetUrl) {
      return handleHealth();
    }

    // Handle latest/stable redirects
    if (pathname === '/latest' || pathname === '/stable') {
      return handleRedirect(targetUrl);
    }

    // Proxy request to GCS
    try {
      const gcsResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          // Forward relevant headers
          'Range': request.headers.get('Range') || '',
          'User-Agent': request.headers.get('User-Agent') || 'Claude-Code-Proxy/1.0',
        },
      });

      return createResponse(gcsResponse);
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Proxy error',
        message: error.message,
        target: targetUrl,
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
