/**
 * CachyWire 0.1.0-alpha - HTML Sanitizer / Escaper (SEC-03)
 * Prevents DOM-based XSS when rendering process-controlled or network-derived strings.
 */
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeHtml(str) {
  return esc(str);
}
