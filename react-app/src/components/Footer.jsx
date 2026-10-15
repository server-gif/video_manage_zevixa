import footerHtml from '../shared/footer.html?raw';

// Reusable site chrome footer. See Header.jsx for why raw markup is composed
// instead of rendered as an isolated wrapper element.
export { footerHtml };

export default function Footer() {
  return <div dangerouslySetInnerHTML={{ __html: footerHtml }} />;
}
