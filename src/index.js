export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v11.0 Fail-Safe Active", { status: 200 });

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

        // 2. Force Player Initialization
        function startPlayer() {
          const video = document.querySelector('video');
          const playerDiv = document.querySelector('.video-js');
          if (video && playerDiv) {
            // Force VideoJS classes so controls appear
            playerDiv.classList.add('vjs-has-started', 'vjs-playing', 'vjs-user-active');
            video.play().catch(() => {
              console.log("Autoplay blocked, waiting for user click");
            });
          }
        }

        // Run when the page is fully loaded
        window.addEventListener('load', () => {
          setTimeout(startPlayer, 500); // 500ms delay to let scripts settle
        });

        // Also trigger on any click just in case
        document.addEventListener('click', startPlayer, { once: true });
      </script>
    `;

    const customCSS = `
      <style>
        /* Hide Branding & Overlays */
        #vjs-logo-top-bar, #vjs-logobrand, .sendvid-logo, .ad-overlay, #video-overlay { 
          display: none !important; 
        }

        /* Force Controls Visibility */
        .vjs-control-bar { 
          display: flex !important; 
          opacity: 1 !important; 
          visibility: visible !important;
          bottom: 0 !important;
        }

        /* Standard Play Button */
        .vjs-big-play-button {
          display: block !important;
          top: 50% !important; left: 50% !important;
          transform: translate(-50%, -50%) !important;
          z-index: 10 !important;
        }

        body, html { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100%; }
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
          // Path fixing
          if (src.startsWith("//")) e.setAttribute("src", "https:" + src);
          else if (src.startsWith("/")) e.setAttribute("src", "https://sendvid.com" + src);

          // Only allow essential video engine scripts
          const isEssential = src.includes("preflight") || src.includes("player") || src.includes("video");
          const isAd = src.includes("clickadu") || src.includes("ads") || src.includes("gtag");
          if (!isEssential || isAd) e.remove();
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
    newHeaders.set("X-Worker-Version", "11.0-Watchdog-Fixed");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
