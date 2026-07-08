/**
 * kicegg.com — Security Headers Worker
 *
 * Deploy as a Cloudflare Worker on route `kicegg.com/*` to add HTTP-level
 * security headers that GitHub Pages cannot provide.
 *
 * Headers added:
 *   - Strict-Transport-Security (HSTS)
 *   - Content-Security-Policy (HTTP-level, stronger than meta tag)
 *   - X-Content-Type-Options
 *   - X-Frame-Options
 *   - X-XSS-Protection
 *   - Referrer-Policy
 *   - Permissions-Policy
 */

const SECURITY_HEADERS = {
  // HSTS: 1 year, include subdomains
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',

  // CSP: mirrors the meta CSP but at HTTP level (stronger enforcement)
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: https:",
    "connect-src 'self' https://suneung-files.hdh061224.workers.dev https://cloudflareinsights.com https://www.google-analytics.com https://*.analytics.google.com https://www.google.com",
    "media-src 'self' https://suneung-files.hdh061224.workers.dev",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),

  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-xss-protection': '1; mode=block',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

// Cache TTL for static assets to reduce origin requests
const CACHE_HEADERS = {
  'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const response = await fetch(request);

  // Clone so we can modify headers
  const modified = new Response(response.body, response);

  // Add security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    modified.headers.set(key, value);
  }

  // Add cache headers for static assets
  const path = url.pathname.toLowerCase();
  if (path.match(/\.(js|css|svg|png|jpg|jpeg|gif|ico|woff2?|ttf)$/)) {
    for (const [key, value] of Object.entries(CACHE_HEADERS)) {
      modified.headers.set(key, value);
    }
  }

  // JSON data is versioned by query string on pages that need aggressive busting.
  // Override GitHub Pages' no-store so repeat users do not re-download exams.json.
  if (path.match(/\.json$/)) {
    modified.headers.set(
      'cache-control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
    );
  }

  // Add cache headers for HTML (shorter TTL)
  if (path.endsWith('.html') || path === '/' || !path.includes('.')) {
    modified.headers.set(
      'cache-control',
      'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400'
    );
  }

  return modified;
}
