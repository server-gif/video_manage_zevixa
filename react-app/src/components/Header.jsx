import headerHtml from '../shared/header.html?raw';

// The reusable site chrome header. Pages compose this raw markup directly into
// the #main-container innerHTML (rather than rendering it as an isolated
// component) so the resulting DOM stays byte-identical to the original static
// site. Header() is still exported for standalone/preview usage.
export { headerHtml };

export default function Header() {
  return <div dangerouslySetInnerHTML={{ __html: headerHtml }} />;
}
