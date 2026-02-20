export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v10.0 Final Touch Active", { status: 200 });

    const response = await fetch(targetUrl, {
      headers: {
        "Referer": env.TRUSTED_REFERER || "https://facebook.com",
        "User-Agent": request.headers.get("User-Agent")
      }
    });

    const interceptorJS = `
      <script>
        // 1. Block Pop-ups
        window.open = function() { return null; };
        
        // 2. Ensure controls become visible once the video starts playing
        document.addEventListener('play', function(e) {
          const player = document.querySelector('.video-js');
          if (player) {
            player.classList.add('vjs-has-started');
            player.classList.remove('vjs-paused');
            player.classList.add('vjs-playing');
          }
        }, true);
      </script>
    `;

    const customCSS = `
      <style>
        /* Hide Branding & Ads */
        #vjs-logo-top-bar, #vjs-logobrand, .sendvid-logo, .ad-overlay, #video-overlay, .video-info-link { 
          display: none !important; 
        }

        /* Restore a beautiful, centered Play Button */
        .vjs-big-play-button {
          display: block !important;
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: 80px !important;
          height: 80px !important;
          line-height: 80px !important;
          border-radius: 50% !important;
          background-color: rgba(0, 0, 0, 0.7) !important;
          border: 3px solid #fff !important;
          z-index: 10 !important;
          cursor: pointer !important;
        }

        /* Ensure the Progress Bar and Controls show up correctly */
        .vjs-control-bar { 
          display: flex !important; 
          z-index: 2147483647 !important; 
        }

        /* Layout fixes */
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
        .video-js { width: 100vw !important; height: 100vh !important; }
        video { object-fit: contain; }
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
          // Correctly join paths for both // and /
          if (src.startsWith("//")) e.setAttribute("src", "https:" + src);
          else if (src.startsWith("/")) e.setAttribute("src", "https://sendvid.com" + src);

          // Whitelist essential scripts
          const isEssential = src.includes("preflight") || src.includes("player") || src.includes("video");
          if (!isEssential || src.includes("clickadu") || src.includes("ads") || src.includes("gtag")) {
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
    newHeaders.set("X-Worker-Version", "10.0-Full-UI-Restore");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
