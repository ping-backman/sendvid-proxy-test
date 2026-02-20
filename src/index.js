export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v7.0 Interceptor Active", { status: 200 });

    const response = await fetch(targetUrl, {
      headers: {
        "Referer": env.TRUSTED_REFERER || "https://facebook.com",
        "User-Agent": request.headers.get("User-Agent")
      }
    });

    // 1. The Interceptor Script: Runs BEFORE preflight.js
    const interceptorJS = `
      <script>
        // Kill the ability to open new windows (Pop-ups)
        const originalOpen = window.open;
        window.open = function() {
          console.log("Blocked Pop-up Attempt");
          return null; 
        };

        // Kill dynamic link creation (Common bypass for window.open)
        const originalCreateElement = document.createElement;
        document.createElement = function(tag) {
          const element = originalCreateElement.call(document, tag);
          if (tag.toLowerCase() === 'a') {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
              if (name === 'href' && (value.includes('clickadu') || value.includes('gukahdbam'))) {
                console.log("Blocked Ad Link: " + value);
                return;
              }
              return originalSetAttribute.apply(element, arguments);
            };
          }
          return element;
        };
      </script>
    `;

    const customCSS = `
      <style>
        /* Hide all identified logos and banners */
        #vjs-logo-top-bar, #vjs-logobrand, .sendvid-logo, .sh-video-link,
        .ad-overlay, #video-overlay, .video-info-link, .video-details { 
          display: none !important; visibility: hidden !important; pointer-events: none !important; 
        }
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #000; }
        .video-js { width: 100vw !important; height: 100vh !important; }
        .vjs-big-play-button {
          opacity: 0 !important; display: block !important;
          width: 100% !important; height: 100% !important;
          position: absolute !important; top: 0 !important; left: 0 !important; z-index: 1 !important;
        }
        .vjs-control-bar { z-index: 9999 !important; }
      </style>
    `;

    const rewriter = new HTMLRewriter()
      // Inject Interceptor and CSS at the very top of <head>
      .on("head", { 
        element(e) { 
          e.prepend(interceptorJS, { html: true }); 
          e.append(customCSS, { html: true }); 
        } 
      })
      // Delete the logo elements from the DOM
      .on("#vjs-logo-top-bar", { element(e) { e.remove(); } })
      .on("#vjs-logobrand", { element(e) { e.remove(); } })
      // Fix relative paths for the core scripts
      .on("script", {
        element(e) {
          const src = e.getAttribute("src") || "";
          if (src.startsWith("/")) {
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
    newHeaders.set("X-Worker-Version", "7.0-Interceptor-Hook");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
