/**
 * worker/index.ts
 * Cloudflare Worker — CDN proxy for raw GitHub file URLs.
 *
 * Routes:
 *   GET /proxy?url=<encoded raw.githubusercontent.com URL>
 *     → caches the response at the edge and returns it to the client
 *
 * Deploy with Wrangler:
 *   wrangler deploy
 */

export interface Env {
  // Optional: Cloudflare KV namespace for extended caching
  // CACHE_KV: KVNamespace;
}

const CACHE_TTL = 86400; // 24 hours in seconds
const ALLOWED_ORIGIN = "raw.githubusercontent.com";

export default {
  async fetch(request: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    if (url.pathname !== "/proxy") {
      return new Response("Not Found", { status: 404 });
    }

    const targetEncoded = url.searchParams.get("url");
    if (!targetEncoded) {
      return new Response("Missing url parameter", { status: 400 });
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(decodeURIComponent(targetEncoded));
    } catch {
      return new Response("Invalid URL", { status: 400 });
    }

    // Security: only proxy raw.githubusercontent.com URLs
    if (targetUrl.hostname !== ALLOWED_ORIGIN) {
      return new Response("Forbidden: only raw.githubusercontent.com URLs are allowed", {
        status: 403,
      });
    }

    // Check Cloudflare edge cache first
    const cache = caches.default;
    const cacheKey = new Request(targetUrl.toString(), request);
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const res = new Response(cachedResponse.body, cachedResponse);
      res.headers.set("X-Cache", "HIT");
      res.headers.set("Access-Control-Allow-Origin", "*");
      return res;
    }

    // Cache miss — fetch from GitHub
    const originResponse = await fetch(targetUrl.toString(), {
      headers: {
        "User-Agent": "GitStore-CDN-Worker/1.0",
      },
    });

    if (!originResponse.ok) {
      return new Response(`Origin error: ${originResponse.status}`, {
        status: originResponse.status,
      });
    }

    // Clone and store in cache
    const responseToCache = new Response(originResponse.body, originResponse);
    responseToCache.headers.set("Cache-Control", `public, max-age=${CACHE_TTL}`);
    responseToCache.headers.set("Access-Control-Allow-Origin", "*");
    responseToCache.headers.set("X-Cache", "MISS");

    ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));

    return responseToCache;
  },
} satisfies ExportedHandler<Env>;
