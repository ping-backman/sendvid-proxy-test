export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) return new Response("v14.0 Vimeo-Style Active", { status: 200 });

    const response = await fetch(targetUrl, {
      headers: {
        "Referer": env.TRUSTED_REFERER || "https://facebook.com",
        "User-Agent": request.headers.get("User-Agent")
      }
    });

    const customCSS = `
      <style>
        /* 1. Reset Page Layout */
        body, html { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center; }
        
        /* 2. Style the Video Tag */
        video { 
          display: block !important;
          width: 100vw !important; 
          height: 100vh !important; 
          object-fit: contain !important; 
          cursor: pointer;
        }

        /* 3. The Vimeo-Blue Center Play Button (CSS Only) */
        /* This creates a pseudo-element on the body that disappears when the video plays */
        body:not(.video-playing)::after {
          content: '';
          position: absolute;
          width: 80px;
          height: 50px;
          background: #00adef; /* Vimeo Blue */
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 1000;
          /* Draw the white triangle */
          background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>');
          background-repeat: no-repeat;
          background-position: center;
          background-size: 30px;
          transition: transform 0.2s;
        }

        body:not(.video-playing):hover::after { transform: scale(1.1); }
        body.video-playing::after { display: none; }

        /* 4. Hide all Sendvid UI remnants */
        .vjs-control-bar, .vjs-big-play-button, .ad-overlay, #video-overlay, 
        #vjs-logo-top-bar, #vjs-logobrand, .video-info-link { display: none !important; }
      </style>
    `;

    const interceptorJS = `
      <script>
        // Kill Pop-ups
        window.open = function() { return null; };
        
        // Handle the "Playing" state for our CSS button
        document.addEventListener('play', () => {
          document.body.classList.add('video-playing');
        }, true);
      </script>
    `;

    const rewriter = new HTMLRewriter()
      .on("head", { element(e) { 
        e.append(customCSS, { html: true }); 
        e.prepend(interceptorJS, { html: true });
      } })
      .on("video", {
        element(e) {
          e.setAttribute("class", "video-native"); // Bypass VideoJS
          e.setAttribute("controls", "true");      // Native UI
          e.removeAttribute("data-setup");
        }
      })
      .on("script", {
        element(e) {
          let src = e.getAttribute("src") || "";
          if (src.startsWith("//")) e.setAttribute("src", "https:" + src);
          else if (src.startsWith("/")) e.setAttribute("src", "https://sendvid.com" + src);
          
          // Allow preflight for metadata but block the player.js and ads
          const isAd = src.includes("ads") || src.includes("clickadu") || src.includes("gtag");
          if (isAd || src.includes("player-c273")) e.remove(); 
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
    newHeaders.set("X-Worker-Version", "14.0-Vimeo-Style");

    return new Response(transformedResponse.body, { ...transformedResponse, headers: newHeaders });
  }
};
