export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v13.0 Protected Native Active", { status: 200 });

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

        /* 4. CSS Fix to hide Download Button in Chrome/Edge/Safari */
        video::-internal-media-controls-download-button {
            display: none !important;
        }
        video::-webkit-media-controls-enclosure {
            overflow: hidden !important;
        }
        video::-webkit-media-controls-panel {
            width: calc(100% + 35px) !important; /* Shoves the download button out of view */
        }
      </style>
    `;

    const rewriter = new HTMLRewriter()
      .on("head", { element(e) { e.append(customCSS, { html: true }); } })
      // MODIFIED: Added nodownload and right-click block
      .on("video", {
        element(e) {
          e.setAttribute("class", "video-native"); 
          e.setAttribute("controls", "true");      
          e.setAttribute("controlsList", "nodownload"); // Disable download button
          e.setAttribute("oncontextmenu", "return false;"); // Disable right-click save
          e.setAttribute("preload", "metadata");   
          e.removeAttribute("data-setup");         
        }
      })
      .on("script", {
        element(e) {
          let src = e.getAttribute("src") || "";
          if (src.startsWith("//")) e.setAttribute("src", "https:" + src);
          else if (src.startsWith("/")) e.setAttribute("src", "https://sendvid.com" + src);
          
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
    newHeaders.set("X-Worker-Version", "13.0-Protected-Native");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
