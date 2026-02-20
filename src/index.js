export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v13.0 De-Hijack Active", { status: 200 });

    const response = await fetch(targetUrl, {
      headers: {
        "Referer": env.TRUSTED_REFERER || "https://facebook.com",
        "User-Agent": request.headers.get("User-Agent")
      }
    });

    const customCSS = `
      <style>
        /* 1. Reset everything to black */
        body, html { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100%; width: 100%; }
        
        /* 2. Force the video tag to be visible and interactive */
        video { 
          display: block !important;
          width: 100vw !important; 
          height: 100vh !important; 
          object-fit: contain !important; 
          pointer-events: auto !important;
        }

        /* 3. Hide all Sendvid UI remnants */
        .vjs-control-bar, .vjs-big-play-button, .ad-overlay, #video-overlay, 
        #vjs-logo-top-bar, #vjs-logobrand, .video-info-link { 
          display: none !important; 
          opacity: 0 !important;
        }
      </style>
    `;

    const rewriter = new HTMLRewriter()
      .on("head", { element(e) { e.append(customCSS, { html: true }); } })
      // CRITICAL: Change the class so VideoJS doesn't "hijack" the player
      .on("video", {
        element(e) {
          e.setAttribute("class", "video-native"); // Remove 'video-js'
          e.setAttribute("controls", "true");      // Ensure native UI is on
          e.setAttribute("preload", "metadata");   // Help with loading
          e.removeAttribute("data-setup");         // Kill auto-init
        }
      })
      .on("script", {
        element(e) {
          let src = e.getAttribute("src") || "";
          if (src.startsWith("//")) e.setAttribute("src", "https:" + src);
          else if (src.startsWith("/")) e.setAttribute("src", "https://sendvid.com" + src);
          
          // BLOCK ALL SCRIPTS that might try to re-init the player or show ads
          // Since we want native controls, we don't even need the Sendvid player.js
          const isAd = src.includes("ads") || src.includes("clickadu") || src.includes("gtag") || src.includes("gukahdbam");
          if (isAd || src.includes("player")) {
            e.remove(); 
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
    newHeaders.set("X-Worker-Version", "13.0-De-Hijack");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
