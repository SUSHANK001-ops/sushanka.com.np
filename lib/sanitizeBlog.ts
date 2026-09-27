import sanitizeHtml from 'sanitize-html'

/**
 * Sanitize rich-text blog HTML produced by the admin editor before it is
 * stored and later rendered with dangerouslySetInnerHTML. This strips
 * <script>, event handlers (onclick, onerror, …), javascript: URLs, and any
 * tag/attribute not on the allowlist — closing the stored-XSS vector while
 * keeping the formatting the Lexical editor emits.
 */
export function sanitizeBlogHtml(dirty: string): string {
  if (!dirty) return ''

  return sanitizeHtml(dirty, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr', 'span', 'div',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'mark',
      'blockquote', 'pre', 'code',
      'ul', 'ol', 'li',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'figure', 'figcaption',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      // Allow inline style + id/class only where the editor uses them.
      '*': ['id', 'class', 'style'],
    },
    // Only http(s), mailto and protocol-relative links; blocks javascript:.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: true,
    // Restrict inline style properties to safe, presentational ones.
    allowedStyles: {
      '*': {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^rgba\(/i, /^[a-z-]+$/i],
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^rgba\(/i, /^[a-z-]+$/i],
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
        'font-size': [/^\d+(?:px|em|rem|%)$/],
        'font-weight': [/^\d+$/, /^bold$/, /^normal$/],
        'text-decoration': [/^[a-z- ]+$/i],
        'max-width': [/^\d+(?:px|%)$/],
        'border-radius': [/^\d+(?:px|%)$/],
      },
    },
    // Force safe rel on links that open a new tab.
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.target === '_blank') {
          attribs.rel = 'noopener noreferrer nofollow'
        }
        return { tagName, attribs }
      },
    },
    disallowedTagsMode: 'discard',
  })
}
