export function sanitizeContent(content) {
  if (typeof content !== 'string') return '';
  try {
    const DOMPurify = require('isomorphic-dompurify');
    return DOMPurify.sanitize(content).trim();
  } catch (e) {
    return content.trim();
  }
}
