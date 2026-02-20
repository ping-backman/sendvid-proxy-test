export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    // Simple feedback page if no URL is provided
    if (!targetUrl) {
      return new Response(`
        <h1>Video Proxy Tester</h1>
        <p>Usage: <code>${url.origin}/?url=SENDVID_EMBED_URL</code></p>
      `, { headers: { "Content-Type": "text/html" } });
    }

    try {
      // 1. Fetch the video with a spoofed Referer
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": request.headers.get("User-Agent"),
          "Referer": env.TRUSTED_REFERER,
        },
      });

      // 2. Clone response and prepare to modify headers
      let newResponse = new Response(response.body, response);

      // 3. Rewrite cookies to be 1st-party
      const setCookie = response.headers.get("Set-Cookie");
      if (setCookie) {
        // Change the 'domain' in the cookie to match YOUR current domain
        const firstPartyCookie = setCookie.replace(/domain=[^;]+/, `domain=${url.hostname}`);
        newResponse.headers.set("Set-Cookie", firstPartyCookie);
      }

      // 4. Add debug headers to see results easily in your browser's 'Network' tab
      newResponse.headers.set("X-Proxy-Status", "Active");
      newResponse.headers.set("X-Spoofed-Referer", env.TRUSTED_REFERER);

      return newResponse;
    } catch (e) {
      return new Response(`Proxy Error: ${e.message}`, { status: 500 });
    }
  },
};
