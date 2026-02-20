export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) return new Response("Worker Active", { status: 200 });

    const response = await fetch(targetUrl, {
      headers: {
        "Referer": env.TRUSTED_REFERER || "https://facebook.com",
        "User-Agent": request.headers.get("User-Agent")
      }
    });

    const customCSS = `
      <style>
        /* 1. HIDE THE UGLY STUFF BUT KEEP THE PLAYER CLICKABLE */
        .ad-overlay, #video-overlay, .video-info-link, .sendvid-logo, 
        .sh-video-link, .video-details, .vjs-error-display { 
          display: none !important; 
          pointer-events: none !important; 
        }

        /* 2. MAKE THE BIG PLAY BUTTON INVISIBLE BUT CLICKABLE */
        /* This allows the first click to start the video without seeing the 'ugly' button */
        .vjs-big-play-button {
          opacity: 0 !important;
          width: 100% !important;
          height: 100% !important;
          top: 0 !important;
          left: 0 !important;
          margin: 0 !important;
          border: none !important;
        }

        /* 3. ENSURE CONTROLS ARE VISIBLE ONCE PLAYING */
        .vjs-control-bar { 
          display: flex !important; 
          visibility: visible !important; 
          opacity: 1 !important; 
          z-index: 2147483647 !important; 
        }

        /* 4. FULLSCREEN FIX */
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
        .video-js { width: 100vw !important; height: 100vh !important; }
        video { object-fit: contain; }
      </style>
    `;

    const rewriter = new HTMLRewriter()
      .on("head", { element(e) { e.append(customCSS, { html: true }); } })
      // Fix ALL scripts to ensure the player engine actually loads
      .on("script", {
        element(e) {
          const src = e.getAttribute("src");
          if (src && src.startsWith("/")) {
            e.setAttribute("src", "https://sendvid.com" + src);
          }
        }
      })
      .on("link", {
        element(e) {
          const href = e.getAttribute("href");
          if (href && href.startsWith("/")) {
            e.setAttribute("href", "https://sendvid.com" + href);
          }
        }
      });

    const transformedResponse = rewriter.transform(response);
    const newHeaders = new Headers(transformedResponse.headers);

    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie) {
      newHeaders.set("Set-Cookie", setCookie.replace(/domain=[^;]+/, `domain=${url.hostname}`));
    }

    newHeaders.set("X-Frame-Options", "ALLOWALL");
    newHeaders.delete("Content-Security-Policy");
    newHeaders.set("X-Worker-Version", "3.0-Functional-Beauty");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
