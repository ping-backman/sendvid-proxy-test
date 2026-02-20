export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) return new Response("Sendvid Proxy Active", { status: 200 });

    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.set("Referer", env.TRUSTED_REFERER || "https://facebook.com");

    const response = await fetch(targetUrl, { headers: modifiedHeaders });

    // CSS to inject: Hides overlays, links, and "ugly" UI elements
    const customCSS = `
      <style>
        /* Hide Sendvid's Ad Overlays & Promo Links */
        .video-js .vjs-big-play-button, 
        .ad-overlay, 
        #video-overlay, 
        .video-info-link,
        .sendvid-logo,
        a[href*="sendvid.com"] { 
          display: none !important; 
        }

        /* Make the player fill the window properly */
        body, html { margin: 0; padding: 0; overflow: hidden; background: #000; }
        video { width: 100% !important; height: 100vh !important; object-fit: contain; }

        /* Custom Play Button simulation if their JS fails */
        .vjs-control-bar { display: flex !important; visibility: visible !important; opacity: 1 !important; }
      </style>
    `;

    const rewriter = new HTMLRewriter()
      // Inject our custom "Beauty" CSS into the <head>
      .on("head", {
        element(e) {
          e.append(customCSS, { html: true });
        }
      })
      // Fix only ESSENTIAL video player scripts, NOT ad scripts
      .on("script", {
        element(e) {
          const src = e.getAttribute("src");
          // Only fix the core video player (VideoJS), let others (ads) stay broken
          if (src && (src.includes("video") || src.includes("player"))) {
            if (src.startsWith("/")) e.setAttribute("src", "https://sendvid.com" + src);
          }
        }
      })
      // Fix CSS paths for the player skin
      .on("link", {
        element(e) {
          const href = e.getAttribute("href");
          if (href && href.startsWith("/")) e.setAttribute("href", "https://sendvid.com" + href);
        }
      });

    let newResponse = rewriter.transform(response);
    let outHeaders = new Headers(newResponse.headers);

    // 1st-Party Cookie Logic
    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie) {
      const updatedCookie = setCookie.replace(/domain=[^;]+/, `domain=${url.hostname}`);
      outHeaders.set("Set-Cookie", updatedCookie);
    }

    // Allow embedding in your Netlify <iframe>
    outHeaders.set("X-Frame-Options", "ALLOWALL");
    outHeaders.delete("Content-Security-Policy");

    return new Response(newResponse.body, { ...newResponse, headers: outHeaders });
  }
};
