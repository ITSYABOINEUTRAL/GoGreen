const sanitizeHtml = require('sanitize-html');

/**
 * Strip all HTML tags — returns plain text only.
 * Use this before storing any user-generated text in the DB.
 *
 * @param {string} value
 * @returns {string}
 */
function sanitizeText(value) {
  if (Array.isArray(value)) return value.map(sanitizeText);
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
}

module.exports = { sanitizeText };
