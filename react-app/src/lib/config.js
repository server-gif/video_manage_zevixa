// Central runtime config, sourced from Vite env vars (.env / .env.production).
//
// Vite statically replaces `import.meta.env.VITE_*` at BUILD time, so the
// values below are inlined into the bundle (they are NOT read at runtime -
// rebuild after editing .env). This is the SINGLE documented place to read
// environment config for a future backend integration.
//
// NOTE: There is currently NO page that calls a backend. Nothing consumes
// `backendUrl` yet, so importing this module has no effect on the faithful
// static pages. It exists so the wiring point is explicit and ready.
//
// Vite inlines `import.meta.env.VITE_*` at build time; unset vars become the
// fallbacks below.
export const config = {
  // Live backend API origin ('' until set in .env). No trailing slash.
  backendUrl: (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, ''),
  // Canonical production origin used for absolute links / SEO / redirects.
  siteOrigin: import.meta.env.VITE_SITE_ORIGIN || 'https://zevixa.site',
};

// Build an absolute URL against the configured backend.
// Throws a clear error instead of silently hitting a relative path when the
// backend has not been configured yet.
//   const res = await fetch(apiUrl(`/articles/${slug}`));
export function apiUrl(path = '') {
  if (!config.backendUrl) {
    throw new Error('VITE_BACKEND_URL is not set - add it to react-app/.env and rebuild');
  }
  return `${config.backendUrl}/${String(path).replace(/^\//, '')}`;
}
