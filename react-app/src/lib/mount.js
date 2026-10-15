// Faithful re-execution of the original <body> scripts after they are inserted
// via innerHTML (innerHTML/template-inserted scripts are inert). Scripts are
// executed in DOCUMENT ORDER and, for external scripts, awaited sequentially so
// original parse-order dependencies (e.g. inline code using googletag after
// gpt.js loads) are preserved. Nothing here rewrites the scripts themselves.
//
// Each script is executed inside try/catch so that a single malformed script
// (some LiteSpeed-combined blobs are broken in the source export) cannot abort
// the rest of the chain - mirroring how a real browser isolates top-level
// <script> errors from one another.
//
// Special cases:
//  - <script type="application/ld+json"> / other data types: left untouched (never executed).
//  - <script type="speculationrules">: re-inserted as-is so the browser can act on it.
export async function executeScripts(scriptEls) {
  for (const old of scriptEls) {
    if (!old || !old.parentNode) continue;
    const type = (old.getAttribute('type') || '').toLowerCase();
    const isJs = type === '' || type === 'text/javascript' || type === 'module' || type === 'application/javascript';

    if (!isJs && type !== 'speculationrules') {
      // data block (ld+json, etc.) -> leave inert in place.
      continue;
    }

    const fresh = document.createElement('script');
    // Copy every attribute verbatim (id, src, async, defer, crossorigin, referrerpolicy, ...).
    for (const attr of Array.from(old.attributes)) {
      fresh.setAttribute(attr.name, attr.value);
    }

    try {
      if (old.src) {
        // External: load and await so ordering is preserved.
        await new Promise((resolveLoad) => {
          fresh.addEventListener('load', () => resolveLoad());
          fresh.addEventListener('error', () => resolveLoad());
          try { old.parentNode.replaceChild(fresh, old); } catch (e) { resolveLoad(); }
        });
      } else {
        // Inline: copy text and insert in place (executes immediately).
        fresh.text = old.text;
        old.parentNode.replaceChild(fresh, old);
      }
    } catch (e) {
      // Syntax/runtime error in one script must not stop the others (as in a browser).
      // eslint-disable-next-line no-console
      console.error('[Zevixa] script execution isolated an error:', e && e.message);
    }
  }
}
