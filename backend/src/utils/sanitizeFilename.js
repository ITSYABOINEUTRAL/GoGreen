const path = require('path');

/**
 * Reduce a file path to a filename that is safe to place in a Content-Disposition header.
 * Keeps only the basename and replaces anything outside [a-zA-Z0-9._-] with "_".
 *
 * @param {string} filePath
 * @returns {string}
 */
function sanitizeFilename(filePath) {
  return path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
}

module.exports = { sanitizeFilename };
