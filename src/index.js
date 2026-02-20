export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v9.0 Absolute Fix Active", { status: 200 });

    const response = await fetch(targetUrl, {
      headers: {
        "Referer": env.TRUSTED_REFERER || "https://facebook.com",
        "User-Agent": request.headers.get("User-Agent")
      }
    });

    const interceptorJS = `
      <script>
        // Kill Pop-ups
        window.open = function() { return null; };
        // Force Video to start on any click
        document.addEventListener('click', function() {
           const v = document.querySelector('video');
           if (v && v.paused) v.play().catch(()=>{});
        }, { once: true });
      </script>
    `;

    const customCSS = `
      <style>
        #vjs-logo-top-bar, #vjs-logobrand, .sendvid-logo, .ad-overlay, #video-overlay { display: none !important; }
        
        /* Make the big play button invisible but BIG so clicking anywhere starts the video */
        .vjs-big-play-button {
          opacity: 0 !important; display: block !important;
          width: 100% !important; height: 100% !important;
          position: absolute !important; top: 0 !important; left: 0 !important;
        }

        .vjs-control-bar { display: flex !important; visibility: visible !important; opacity: 1 !important; z-index: 9999 !important; }
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
        .video-js { width: 100vw !important; height: 100vh !important; }
      </style>
    `;

    const rewriter = new HTMLRewriter()
      .on("head", { element(e) { 
        e.prepend(interceptorJS, { html: true }); 
        e.append(customCSS, { html: true }); 
      }})
      .on("script", {
        element(e) {
          let src = e.getAttribute("src") || "";
          
          // Fix the 404 double-slash and handle external vs relative paths
          if (src.startsWith("//")) {
            e.setAttribute("src", "https:" + src); // Fixes //cdn.embed.ly
          } else if (src.startsWith("/")) {
            e.setAttribute("src", "https://sendvid.com" + src); // Fixes /assets/...
          }

          // WHITELIST: Only allow essential video engine scripts
          const isEssential = src.includes("preflight") || src.includes("player") || src.includes("video");
          const isAd = src.includes("clickadu") || src.includes("adsmediabox") || src.includes("gukahdbam");

          if (!isEssential || isAd) {
             e.remove();
          }
        }
      })
      .on("link", {
        element(e) {
          let href = e.getAttribute("href") || "";
          if (href.startsWith("//")) e.setAttribute("href", "https:" + href);
          else if (href.startsWith("/")) e.setAttribute("href", "https://sendvid.com" + href);
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
    newHeaders.set("X-Worker-Version", "9.0-Path-Fixed");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
