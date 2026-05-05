// index.js -- Proxy Worker v14.3

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) return new Response("v14.3 Active", { status: 200 });
    if (!targetUrl.startsWith("[https://sendvid.com](https://sendvid.com)")) return new Response("Invalid source", { status: 400 });

    const cache = caches.default;
    const normalizedKeyUrl = new URL(url.origin + url.pathname);
    normalizedKeyUrl.searchParams.set("url", targetUrl); 
    const cacheKey = new Request(normalizedKeyUrl.toString());

    let cached = await cache.match(cacheKey);
    if (cached) return cached;

    let response;
    try {
      response = await fetch(targetUrl, {
        headers: {
          "Referer": env.TRUSTED_REFERER || "[https://facebook.com](https://facebook.com)",
          "User-Agent": request.headers.get("User-Agent")
        }
      });
    } catch (e) {
      return new Response("Upstream fetch failed", { status: 502 });
    }

    const headInjections = `
      <style>
        body, html { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100%; width: 100%; }
        video { display: block !important; width: 100vw !important; height: 100vh !important; object-fit: contain !important; }
        .vjs-control-bar, .vjs-big-play-button, .ad-overlay, #video-overlay { display: none !important; }
      </style>
      <script>
        // Mocking to prevent crashes
        window.videojs = function() { return { ready: (f) => f(), on: () => {}, one: () => {}, dispose: () => {} }; };
        const m = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
        try { Object.defineProperty(window, 'sessionStorage', { value: m }); Object.defineProperty(window, 'localStorage', { value: m }); } catch(e) {}
      </script>
    `;

    const rewriter = new HTMLRewriter()
      .on("head", { element(e) { e.append(headInjections, { html: true }); } })
      .on("video", {
        element(e) {
          e.setAttribute("class", "video-native");
          e.setAttribute("controls", "true");
          e.setAttribute("autoplay", "true"); // Added for single-tap
          e.setAttribute("playsinline", "true"); // Critical for iOS
          e.setAttribute("preload", "auto");
          e.removeAttribute("data-setup");
        }
      })
      .on("script", {
        element(e) {
          let src = e.getAttribute("src") || "";
          if (src.includes("ads") || src.includes("player") || src.includes("gtag")) {
            e.remove();
          }
        }
      });

    const transformed = rewriter.transform(response);
    const newHeaders = new Headers(transformed.headers);

    // Ensure no CSP is blocking our own sandbox
    newHeaders.delete("Content-Security-Policy");
    newHeaders.delete("X-Content-Security-Policy");
    newHeaders.set("X-Frame-Options", "ALLOWALL");
    newHeaders.set("Access-Control-Allow-Origin", "*");

    const finalResponse = new Response(transformed.body, {
      status: transformed.status,
      headers: newHeaders
    });

    ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    return finalResponse;
  }
};
