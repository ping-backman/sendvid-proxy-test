// index.js -- Proxy Worker v15 (Clean Extraction + Stable Native Player)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    /* ================= DEFAULT ================= */

    if (!targetUrl) {
      return new Response("v15 Clean Native Proxy", { status: 200 });
    }

    /* ================= VALIDATION ================= */

    if (!targetUrl.startsWith("https://sendvid.com")) {
      return new Response("Invalid source", { status: 400 });
    }

    /* ================= CACHE NORMALIZATION ================= */

    const cache = caches.default;

    const normalizedKeyUrl = new URL(url.origin + url.pathname);
    normalizedKeyUrl.searchParams.set("url", targetUrl);

    const cacheKey = new Request(normalizedKeyUrl.toString());

    /* ================= CACHE HIT ================= */

    let cached = await cache.match(cacheKey);
    if (cached) return cached;

    /* ================= FETCH SOURCE ================= */

    let response;

    try {
      response = await fetch(targetUrl, {
        headers: {
          "Referer": env.TRUSTED_REFERER || "https://facebook.com",
          "User-Agent": request.headers.get("User-Agent")
        }
      });
    } catch (e) {
      return new Response("Upstream fetch failed", { status: 502 });
    }

    if (!response || !response.ok) {
      return new Response("Invalid upstream response", { status: 502 });
    }

    /* ================= CSS ================= */

    const customCSS = `
      <style>
        html, body {
          margin: 0;
          padding: 0;
          background: #000;
          height: 100%;
          width: 100%;
          overflow: hidden;
        }

        video {
          width: 100vw !important;
          height: 100vh !important;
          object-fit: contain !important;
          background: #000;
        }
      </style>
    `;

    /* ================= HTML REWRITE ================= */

    const rewriter = new HTMLRewriter()

      // Inject clean CSS
      .on("head", {
        element(e) {
          e.append(customCSS, { html: true });
        }
      })

      // KEEP ONLY CLEAN VIDEO ELEMENT
      .on("video", {
        element(e) {
          e.setAttribute("controls", "true");
          e.setAttribute("controlsList", "nodownload");
          e.setAttribute("oncontextmenu", "return false;");
          e.setAttribute("preload", "metadata");

          // 🔥 critical: kill JS player hooks
          e.removeAttribute("data-setup");
          e.removeAttribute("class");
        }
      })

      // REMOVE ALL SCRIPTS (fixes videojs + sessionStorage crash)
      .on("script", {
        element(e) {
          e.remove();
        }
      })

      // REMOVE IFRAMES (ads / trackers)
      .on("iframe", {
        element(e) {
          e.remove();
        }
      });

    const transformed = rewriter.transform(response);

    /* ================= HEADERS ================= */

    const newHeaders = new Headers(transformed.headers);

    // Cookie rewrite
    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie) {
      newHeaders.set(
        "Set-Cookie",
        setCookie.replace(/domain=[^;]+/, `domain=${url.hostname}`)
      );
    }

    newHeaders.set("X-Frame-Options", "ALLOWALL");
    newHeaders.delete("Content-Security-Policy");

    /* ================= EDGE CACHE ================= */

    newHeaders.set(
      "Cache-Control",
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
    );

    newHeaders.set("X-Worker-Version", "15-Clean-Native");

    const finalResponse = new Response(transformed.body, {
      status: transformed.status,
      headers: newHeaders
    });

    /* ================= CACHE STORE ================= */

    ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));

    return finalResponse;
  }
};
