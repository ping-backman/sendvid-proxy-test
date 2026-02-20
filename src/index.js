export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) return new Response("Worker is Live v2", { status: 200 });

    const response = await fetch(targetUrl, {
      headers: {
        "Referer": env.TRUSTED_REFERER || "https://facebook.com",
        "User-Agent": request.headers.get("User-Agent")
      }
    });

    const customCSS = `
      <style>
        /* HIDE EVERYTHING UGLY */
        .video-js .vjs-big-play-button, .ad-overlay, #video-overlay, 
        .video-info-link, .sendvid-logo, a[href*="sendvid.com"],
        .sh-video-link, .video-details { display: none !important; opacity: 0 !important; pointer-events: none !important; }

        /* FULLSCREEN PLAYER FIX */
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
        video, .video-js { width: 100vw !important; height: 100vh !important; }
      </style>
    `;

    // New Rewriter logic that hooks into BOTH 'head' and 'body' just in case
    const rewriter = new HTMLRewriter()
      .on("head", { element(e) { e.append(customCSS, { html: true }); } })
      .on("body", { element(e) { e.prepend(customCSS, { html: true }); } }) // Fallback
      .on("script", {
        element(e) {
          const src = e.getAttribute("src");
          if (src && src.startsWith("/") && (src.includes("video") || src.includes("player"))) {
            e.setAttribute("src", "https://sendvid.com" + src);
          }
        }
      })
      .on("link", {
        element(e) {
          const href = e.getAttribute("href");
          if (href && href.startsWith("/")) e.setAttribute("href", "https://sendvid.com" + href);
        }
      });

    const transformedResponse = rewriter.transform(response);
    const newHeaders = new Headers(transformedResponse.headers);

    // 1st Party Cookie Fix
    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie) {
      newHeaders.set("Set-Cookie", setCookie.replace(/domain=[^;]+/, `domain=${url.hostname}`));
    }

    // Embed Security
    newHeaders.set("X-Frame-Options", "ALLOWALL");
    newHeaders.delete("Content-Security-Policy");
    // Debug header to confirm THIS version is running
    newHeaders.set("X-Worker-Version", "2.0-Beauty-Mode");

    return new Response(transformedResponse.body, {
      ...transformedResponse,
      headers: newHeaders
    });
  }
};
