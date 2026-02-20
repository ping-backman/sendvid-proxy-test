export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v12.0 Native UI Active", { status: 200 });

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

        // 2. FORCE NATIVE CONTROLS
        function forceNative() {
          const video = document.querySelector('video');
          if (video) {
            video.setAttribute('controls', 'true'); // Show browser's own seek bar
            video.style.display = 'block';
            video.style.width = '100vw';
            video.style.height = '100vh';
            video.play().catch(() => {});
          }
          // Hide the broken VideoJS UI layers
          const vjsUI = document.querySelector('.vjs-control-bar');
          if (vjsUI) vjsUI.style.display = 'none';
        }

        window.addEventListener('load', () => setTimeout(forceNative, 100));
        document.addEventListener('click', forceNative, { once: true });
      </script>
    `;

    const customCSS = `
      <style>
        /* Hide ALL Sendvid UI elements to let Native Browser UI shine */
        .vjs-control-bar, .vjs-big-play-button, .ad-overlay, #video-overlay, 
        .video-info-link, #vjs-logo-top-bar, #vjs-logobrand { 
          display: none !important; 
        }

        body, html { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100%; width: 100%; }
        
        /* Ensure the raw video tag is visible and fills the screen */
        video { 
          width: 100vw !important; 
          height: 100vh !important; 
          object-fit: contain !important; 
          position: absolute;
          top: 0; left: 0;
          z-index: 999; 
        }
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
          if (src.startsWith("//")) e.setAttribute("src", "https:" + src);
          else if (src.startsWith("/")) e.setAttribute("src", "https://sendvid.com" + src);
          
          // Whitelist only the core engine
          const isEssential = src.includes("player") || src.includes("preflight");
          if (!isEssential || src.includes("ads") || src.includes("clickadu")) e.remove();
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
    newHeaders.set("X-Worker-Version", "12.0-Native-UI");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
