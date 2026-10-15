import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

// The generator (tools/generate.mjs) writes mpa-entries.json listing every route
// entry HTML file (paths are relative to this project root and mirror the exact
// original URL paths, e.g. "index.html", "category/news/index.html").
function loadEntries() {
  const manifest = resolve(root, 'mpa-entries.json');
  if (!existsSync(manifest)) {
    // Fall back to the home entry so `vite` can at least start before first generate.
    return ['index.html'];
  }
  return JSON.parse(readFileSync(manifest, 'utf8'));
}

const entries = loadEntries();

// Build a stable fake identifier (_0x-style) from a seed string, used to mask
// the revealing script ids (cloak-guard / cloak-nav-rewriter / cloak-edge-router)
// so even the tag names do not hint at the cloaking logic in View Source.
function maskId(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return '_0x' + h.toString(16).padStart(8, '0').slice(0, 8);
}

// Obfuscate the cloaking scripts on EVERY page at serve/build time so View
// Source (Ctrl+U) and Inspect Elements show encoded code instead of readable
// logic. This covers any inline <script id="cloak-*"> (the article pages'
// cloak-edge-router entry point AND the premium page's cloak-guard /
// cloak-nav-rewriter) plus the premium video module. Vite/React's own injected
// scripts and JSON-LD are left untouched. The readable source stays in the
// HTML files; the browser receives the obfuscated version.
function premiumObfuscator(env) {
  const apiBase = env.VITE_API_BASE_URL || '';
  // The old "?preview=1" / "?test=premium" gate was a public backdoor anyone
  // could type. Preview now requires the secret key from .env, and if that key
  // is missing the preview path is removed entirely (fail-closed).
  const previewKey = env.VITE_PREVIEW_KEY || '';
  const PREVIEW_SOURCE =
    "var isPreview = (q.indexOf('preview=1') !== -1 || q.indexOf('test=premium') !== -1);";
  const PREVIEW_REPLACEMENT = previewKey
    ? 'var isPreview = (q.indexOf(' + JSON.stringify('preview=' + previewKey) + ') !== -1);'
    : 'var isPreview = false;';
  // The article pages also list the two preview strings inside clickIds, and
  // their router bails out early with "if (!hasClick) return;" BEFORE the
  // isPreview check. So the secret key has to live in that list too, otherwise
  // the article -> premium preview flow stops working. Replacing the entries
  // means ?preview=1 no longer counts as a click, only the secret key does.
  const CLICKID_PREVIEW = ", 'preview=1', 'test=premium']";
  const CLICKID_PREVIEW_REPLACEMENT = previewKey
    ? ', ' + JSON.stringify('preview=' + previewKey) + ']'
    : ']';
  // Anti-inspect block: kills the right-click menu (so "Inspect" never shows),
  // F12, Ctrl+Shift+I/J/C, Ctrl+U (view source), Ctrl+S (save page), the macOS
  // Cmd+Opt+I/J/U equivalents, plus text selection and image/video drag-save.
  // It is prepended BEFORE obfuscation, so this too ships as encoded code.
  const ANTI_INSPECT =
    "(function(){try{var no=function(e){e.preventDefault();e.stopPropagation();e.returnValue=false;return false};" +
    "document.addEventListener('contextmenu',no,true);" +
    "document.addEventListener('dragstart',no,true);" +
    "document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();" +
    "if(e.keyCode===123||(e.ctrlKey&&e.shiftKey&&(k==='i'||k==='j'||k==='c'))||(e.ctrlKey&&(k==='u'||k==='s'))||(e.metaKey&&e.altKey&&(k==='i'||k==='j'||k==='u'))){return no(e)}},true);" +
    "}catch(err){}})();\n";
  return {
    name: 'premium-obfuscator',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        let antiInspectAdded = false;
        return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, code) => {
          if (/\bsrc\s*=/i.test(attrs)) return full;
          if (/application\/ld\+json/i.test(attrs)) return full;
          const isTarget = /\bid\s*=\s*["']cloak-/i.test(attrs) || /VIDEO_API_URL/.test(code);
          if (!isTarget || !code.trim()) return full;
          // Bake the env value so obfuscation does not depend on import.meta and
          // the API path is encoded as a string too.
          let js = code.split('import.meta.env.VITE_API_BASE_URL').join(JSON.stringify(apiBase));
          // Convert the bot/Meta user-agent regex literals into string-built RegExp
          // so the obfuscator encodes them. Regex literals are otherwise left in
          // plaintext and would leak the cloaking rules (e.g. facebookexternalhit).
          const REGEX_TO_STRING = [
            ['/bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|facebot|googlebot|bingbot|headless|lighthouse|ptst|bytespider|mediapartners-google/i',
              "new RegExp('bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|facebot|googlebot|bingbot|headless|lighthouse|ptst|bytespider|mediapartners-google','i')"],
            ['/fb_iab|fban\\/|fbav\\/|facebookbrowser|instagram/i',
              "new RegExp('fb_iab|fban/|fbav/|facebookbrowser|instagram','i')"],
          ];
          for (const pair of REGEX_TO_STRING) {
            js = js.split(pair[0]).join(pair[1]);
          }
          // Swap the public preview backdoor for the secret key (identical line
          // in all 17 page sources, so one rewrite covers every page).
          js = js.split(PREVIEW_SOURCE).join(PREVIEW_REPLACEMENT);
          js = js.split(CLICKID_PREVIEW).join(CLICKID_PREVIEW_REPLACEMENT);
          // Inject once per page, into the first cloak script (it sits in <head>
          // so the listeners are attached before anything renders).
          if (!antiInspectAdded) {
            js = ANTI_INSPECT + js;
            antiInspectAdded = true;
          }
          try {
            const out = JavaScriptObfuscator.obfuscate(js, {
              compact: true,
              // Heavy control-flow flattening so the logic order is scrambled.
              controlFlowFlattening: true,
              controlFlowFlatteningThreshold: 0.75,
              // Every string (clickIds like 'fbclid=', bot names, API paths,
              // sessionStorage keys) goes into an RC4-encrypted string pool,
              // accessed only through chained wrapper functions.
              stringArray: true,
              stringArrayEncoding: ['rc4'],
              stringArrayThreshold: 1,
              stringArrayWrappersCount: 3,
              stringArrayWrappersChainedCalls: true,
              stringArrayWrappersParametersMaxCount: 4,
              stringArrayWrappersType: 'function',
              stringArrayIndexesType: ['hexadecimal-number'],
              // Chop remaining literals into tiny fragments so grep/AI cannot
              // reassemble any keyword from the source.
              splitStrings: true,
              splitStringsChunkLength: 3,
              identifierNamesGenerator: 'hexadecimal',
              renameGlobals: false,
              // Sprinkle decoy code to mislead static analysis.
              deadCodeInjection: true,
              deadCodeInjectionThreshold: 0.2,
              // Breaks the code if anyone beautifies/reformats it (anti-AI).
              selfDefending: true,
              target: 'browser',
            });
            const obfuscated = out.getObfuscatedCode();
            // Rename the revealing id (cloak-guard etc.) to a meaningless hex
            // identifier. Nothing in the app references these ids at runtime.
            const maskedAttrs = attrs.replace(/cloak-[a-z0-9-]+/i, maskId(code));
            return '<script' + maskedAttrs + '>' + obfuscated + '</script>';
          } catch (e) {
            // Never fail silently: if obfuscation breaks, we must know (the
            // readable cloak code would otherwise be served as-is).
            console.error('[premium-obfuscator] obfuscation failed:', e && e.message ? e.message : e);
            return full;
          }
        });
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  return {
    root,
    plugins: [react(), premiumObfuscator(env)],
    // Keep absolute public paths (/_assets, /assets) resolving to the copied site assets.
    publicDir: resolve(root, 'public'),

    server: {
      // Dev-server only (no effect on the live build). The app calls the relative
      // path /api/webvideos; here Vite forwards it server-side to the HTTP-only
      // backend, which avoids the browser's mixed-content and CORS blocks. On the
      // live site the SAME /api/webvideos path is handled by the Cloudflare Pages
      // Function in functions/api/webvideos.js. ngrok is no longer used.
      port: 5173,
      strictPort: true,
      proxy: {
        '/api/webvideos': {
          target: 'http://mhadevinfotech.in',
          changeOrigin: true,
          rewrite: () => '/api_webvideo/api_webvideos.php',
        },
      },
    },

    build: {
      // Faithful multi-page build: one output HTML per original route, preserving
      // the directory/index.html layout so URLs stay identical to the static site.
      rollupOptions: {
        input: entries.map((e) => resolve(root, e)),
      },
    },
  };
});
