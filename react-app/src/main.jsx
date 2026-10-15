import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { executeScripts } from './lib/mount.js';
import { headerHtml as sharedHeader } from './components/Header.jsx';
import { footerHtml as sharedFooter } from './components/Footer.jsx';

// Eager raw imports of every generated fragment. Paths mirror the original URL
// slug (e.g. raw/category__news/*, raw/premium/*).
const bodyTops = import.meta.glob('./raw/*/bodyTop.html', { eager: true, query: '?raw', import: 'default' });
const mains = import.meta.glob('./raw/*/main.html', { eager: true, query: '?raw', import: 'default' });
const bodyBottoms = import.meta.glob('./raw/*/bodyBottom.html', { eager: true, query: '?raw', import: 'default' });
const wholeBodies = import.meta.glob('./raw/*/body.html', { eager: true, query: '?raw', import: 'default' });

function pick(map, slug) {
  const key = Object.keys(map).find((k) => k.includes(`/raw/${slug}/`));
  return key ? map[key] : undefined;
}

// Rebuild the exact original <body> inner HTML for a route.
function composeBody(slug) {
  const whole = pick(wholeBodies, slug);
  if (whole != null) return whole; // pages without WP chrome (premium, cloaktest)

  const bodyTop = pick(bodyTops, slug) ?? '';
  const main = pick(mains, slug) ?? '';
  const bodyBottom = pick(bodyBottoms, slug) ?? '';
  // Reusable chrome: EVERY chrome page uses the ONE shared header/footer
  // (from src/shared). Per-page header/footer overrides are intentionally
  // ignored so the header and footer are identical across all pages.
  const header = sharedHeader;
  const footer = sharedFooter;

  return `${bodyTop}<div id="main-container">${header}${main}${footer}</div>${bodyBottom}`;
}

// Mount the original markup as DIRECT children of <body>. This is required for
// byte-identical fidelity: the theme and the premium page use selectors like
// `body > *:not(#videoOverlay)` that assume the page's top-level nodes are
// immediate <body> children. Nesting them under a #root wrapper would break
// those rules (premium rendered fully hidden). React owns the lifecycle; the
// content itself is the verbatim original DOM.
function mountFaithfully(slug) {
  const anchor = document.getElementById('root');
  // Whole-body pages (premium, cloaktest) are emitted as static HTML with no
  // #root anchor, so there is nothing to mount here. Bail defensively.
  if (!anchor) return;
  const composed = composeBody(slug);

  // Parse into a template so any <script> stays inert until we explicitly run it.
  const tpl = document.createElement('template');
  tpl.innerHTML = composed;

  const inserted = [];
  while (tpl.content.firstChild) {
    const node = tpl.content.firstChild;
    anchor.parentNode.insertBefore(node, anchor);
    inserted.push(node);
  }

  // Collect scripts in document order (top-level script siblings + nested ones).
  const scripts = [];
  for (const node of inserted) {
    if (node.nodeType !== 1) continue;
    if (node.tagName === 'SCRIPT') scripts.push(node);
    for (const s of node.querySelectorAll('script')) scripts.push(s);
  }

  // Re-execute the original scripts now that the full DOM is present.
  executeScripts(scripts);
}

export default function Page({ slug }) {
  useEffect(() => {
    // The cloak edge-router replaces this whole document with the static
    // /premium/ page via fetch + document.write. When it has decided to do so it
    // sets window.__CLOAK_SWAP__ (which persists across document.open because
    // the realm is reused). In that case React must NOT mount: its async
    // body-mutation and script re-execution would race the swap. The premium
    // page is static and needs no mounting, so skipping here is always correct.
    if (window.__CLOAK_SWAP__) return;
    mountFaithfully(slug);
  }, [slug]);

  // React renders nothing itself; the original markup is mounted as <body>
  // siblings (see mountFaithfully) to preserve the exact source DOM structure.
  return null;
}

const rootEl = document.getElementById('root');
const slug = rootEl.getAttribute('data-slug') || 'index';
createRoot(rootEl).render(<Page slug={slug} />);
