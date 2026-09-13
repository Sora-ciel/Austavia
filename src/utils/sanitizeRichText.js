// Cleans editor HTML down to a small allowlist before it is rendered.
//
// Task text used to be markdown rendered with markdown-it's `html: false`,
// which meant no markup could ever get through. Tasks now hold real editor
// HTML so an image can keep the width you dragged it to — markdown has no way
// to express that, so resizing was silently lost on save. This keeps the same
// guarantee the old flag gave: text arrives through sync, so it is treated as
// untrusted, and anything outside the list below is dropped.

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'SPAN', 'DIV',
  'STRONG', 'B', 'EM', 'I', 'U', 'S', 'CODE', 'PRE',
  'UL', 'OL', 'LI', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'A', 'IMG', 'HR'
]);

// Only what a tag needs. A span keeps the one attribute that says it is a
// separator and nothing else — the styling hangs off that attribute rather
// than off a class, so a separator written in a task survives being read back
// without letting arbitrary classes through with it.
const ALLOWED_ATTRS = {
  A: ['href', 'title'],
  IMG: ['src', 'alt', 'title', 'width', 'height', 'data-align'],
  SPAN: ['data-inline-separator']
};

// data: is allowed for images only — that's how a freshly pasted picture
// arrives, before sync swaps it for a Storage URL.
function safeUrl(value, { allowData = false } = {}) {
  const url = String(value || '').trim();
  if (!url) return null;
  if (/^(https?:|mailto:|blob:)/i.test(url)) return url;
  if (allowData && /^data:image\//i.test(url)) return url;
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('#')) return url;
  return null; // javascript:, vbscript:, data:text/html and anything else
}

export function sanitizeRichText(html) {
  const input = String(html ?? '');
  if (!input) return '';
  if (typeof document === 'undefined') return '';

  // A detached template never runs scripts or loads resources while parsing.
  const template = document.createElement('template');
  template.innerHTML = input;

  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) continue;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }

      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Keep what the element wrapped, drop the element itself, so removing
        // an unknown wrapper doesn't take its text with it.
        const parent = child.parentNode;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        child.remove();
        continue;
      }

      const allowed = ALLOWED_ATTRS[child.tagName] || [];
      for (const attr of [...child.attributes]) {
        if (!allowed.includes(attr.name)) {
          child.removeAttribute(attr.name);
          continue;
        }
        if (attr.name === 'href') {
          const url = safeUrl(attr.value);
          if (url) child.setAttribute('href', url);
          else child.removeAttribute('href');
        }
        if (attr.name === 'src') {
          const url = safeUrl(attr.value, { allowData: true });
          if (url) child.setAttribute('src', url);
          else child.remove();
        }
      }

      if (child.tagName === 'A') {
        child.setAttribute('rel', 'noopener noreferrer');
        child.setAttribute('target', '_blank');
      }

      walk(child);
    }
  };

  walk(template.content);
  return template.innerHTML;
}

// Tasks written before this change are still markdown. Anything with a tag in
// it came from the editor; anything else goes through the markdown renderer.
export function looksLikeHtml(text) {
  return /<(p|div|img|br|ul|ol|li|h[1-6]|strong|em|code|pre|blockquote|a|span)\b[^>]*>/i.test(
    String(text ?? '')
  );
}
