export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v8.0 Minimalist Active", { status: 200 });

    const response = await fetch(targetUrl, {
      headers: {
        "Referer": env.TRUSTED_REFERER || "https://facebook.com",
        "User-Agent": request.headers.get("User-Agent")
      }
    });

    const interceptorJS = `
      <script>
        // Kill Pop-ups and Ad-Redirects
        window.open = function() { return null; };
        const originalCreateElement = document.createElement;
        document.createElement = function(tag) {
          const el = originalCreateElement.call(document, tag);
          if (tag.toLowerCase() === 'a') {
            const setAttr = el.setAttribute;
            el.setAttribute = function(n, v) {
              if (n === 'href' && (v.includes('clickadu') || v.includes('gukahdbam'))) return;
              return setAttr.apply(el, arguments);
            };
          }
          return el;
        };
      </script>
    `;

    const customCSS = `
      <style>
        /* 1. Nuke Logos & Banners entirely */
        #vjs-logo-top-bar, #vjs-logobrand, .sendvid-logo, .sh-video-link { display: none !important; }

        /* 2. User Experience: Remove the big play button entirely */
        /* Hiding it forces the player to rely on the background click or the bottom bar */
        .vjs-big-play-button { display: none !important; opacity: 0 !important; pointer-events: none !important; }

        /* 3. Force the player to show controls immediately so user can click 'Play' at the bottom */
        .vjs-control-bar { 
          display: flex !important; 
          visibility: visible !important; 
          opacity: 1 !important; 
          z-index: 9999 !important; 
        }

        /* 4. Fullscreen responsive layout */
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
        .video-js { width: 100vw !important; height: 100vh !important; }
        video { object-fit: contain; cursor: pointer; }
      </style>
    `;

    const rewriter = new HTMLRewriter()
      .on("head", { element(e) { 
        e.prepend(interceptorJS, { html: true }); 
        e.append(customCSS, { html: true }); 
      }})
      .on("script", {
        element(e) {
          const src = e.getAttribute("src") || "";
          // WHITELIST: Only fix/allow these 3 specific files
          const isEssential = src.includes("preflight") || 
                              src.includes("player-0.0.10.min.js") || 
                              src.includes("player-c27304ea");
          
          if (isEssential) {
            if (src.startsWith("/")) e.setAttribute("src", "https://sendvid.com" + src);
          } else {
            // Delete everything else (Clickadu, Adsmediabox, etc.)
            e.remove();
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

    const setCookie = response.headers.get("Set-Cookie");
    if (setCookie) {
      newHeaders.set("Set-Cookie", setCookie.replace(/domain=[^;]+/, `domain=${url.hostname}`));
    }

    newHeaders.set("X-Frame-Options", "ALLOWALL");
    newHeaders.delete("Content-Security-Policy");
    newHeaders.set("X-Worker-Version", "8.0-Triple-Whitelist");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
