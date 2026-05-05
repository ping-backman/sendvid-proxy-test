export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response("v14.0 Edge Cached Protected", { status: 200 });
    }

    /* ================= VALIDATION ================= */

    if (!targetUrl.startsWith("https://sendvid.com")) {
      return new Response("Invalid source", { status: 400 });
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url);

    /* ================= CACHE HIT ================= */

    let cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

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

    /* ================= CSS INJECTION ================= */

    const customCSS = `
      <style>
        body, html { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100%; width: 100%; }

        video {
          display: block !important;
          width: 100vw !important;
          height: 100vh !important;
          object-fit: contain !important;
          pointer-events: auto !important;
        }

        .vjs-control-bar, .vjs-big-play-button, .ad-overlay, #video-overlay,
        #vjs-logo-top-bar, #vjs-logobrand, .video-info-link {
          display: none !important;
          opacity: 0 !important;
        }

        video::-internal-media-controls-download-button {
          display: none !important;
        }

        video::-webkit-media-controls-enclosure {
          overflow: hidden !important;
        }

        video::-webkit-media-controls-panel {
          width: calc(100% + 35px) !important;
        }
      </style>
    `;

    /* ================= HTML REWRITE ================= */

    const rewriter = new HTMLRewriter()
      .on("head", {
        element(e) {
          e.append(customCSS, { html: true });
        }
      })
      .on("video", {
        element(e) {
          e.setAttribute("class", "video-native");
          e.setAttribute("controls", "true");
          e.setAttribute("controlsList", "nodownload");
          e.setAttribute("oncontextmenu", "return false;");
          e.setAttribute("preload", "metadata");
          e.removeAttribute("data-setup");
        }
      })
      .on("script", {
        element(e) {
          let src = e.getAttribute("src") || "";

          if (src.startsWith("//")) {
            e.setAttribute("src", "https:" + src);
          } else if (src.startsWith("/")) {
            e.setAttribute("src", "https://sendvid.com" + src);
          }

          const isAd =
            src.includes("ads") ||
            src.includes("clickadu") ||
            src.includes("gtag") ||
            src.includes("gukahdbam");

          if (isAd || src.includes("player")) {
            e.remove();
          }
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

    // 🔥 EDGE CACHE (LONG-LIVED BUT SAFE)
    newHeaders.set(
      "Cache-Control",
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
    );

    newHeaders.set("X-Worker-Version", "14.0-EdgeCached");

    const finalResponse = new Response(transformed.body, {
      status: transformed.status,
      headers: newHeaders
    });

    /* ================= CACHE STORE ================= */

    ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));

    return finalResponse;
  }
};
