// Cloudflare Pages Function -> serves the /api/webvideos route on the LIVE site.
//
// Why this exists: the premium page calls the relative path /api/webvideos
// (VITE_API_BASE_URL). In local dev the Vite proxy (vite.config.mjs) answers it
// and forwards to the HTTP-only backend. A production build has no Vite dev
// server, so without this file /api/webvideos would fall through to the static
// host and return the site HTML instead of JSON ("No video available").
//
// This function runs server-side on Cloudflare, fetches the HTTP-only backend,
// and returns its body verbatim. Because the browser talks to it over the same
// HTTPS origin (video-manage-zevixa.pages.dev), there is no mixed-content block
// and no CORS problem. It is the exact production counterpart of the dev proxy.
//
// Deploy note: Cloudflare Pages auto-detects a top-level `functions/` directory
// in the project root that is deployed (here: react-app). The file path
// functions/api/webvideos.js maps to the route /api/webvideos.

const BACKEND_URL = 'http://mhadevinfotech.in/api_webvideo/api_webvideos.php';

export async function onRequest() {
  try {
    const res = await fetch(BACKEND_URL, {
      method: 'GET',
      headers: { 'User-Agent': 'Zevixa-PagesFunction/1.0' },
    });

    const body = await res.text();

    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // Fail as JSON, never as HTML, so the client shows its own "No video" state
    // instead of receiving an unparseable page.
    return new Response(
      JSON.stringify({ success: false, error: 'video_proxy_failed' }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
