/**
 * Generate sequential document numbers with prefix
 * @param {string} prefix - Prefix for the number (e.g., 'PRJ', 'SO', 'WO')
 * @param {number} sequence - The sequential number
 * @param {number} padLength - Length to pad the number (default: 6)
 * @returns {string} Formatted document number
 */
function generateDocumentNumber(prefix, sequence, padLength = 6) {
  const paddedNumber = String(sequence).padStart(padLength, '0');
  return `${prefix}-${paddedNumber}`;
}

/**
 * Generate a unique reference number with date component
 * @param {string} prefix - Prefix for the number
 * @param {number} sequence - The sequential number
 * @returns {string} Reference number with date
 */
function generateRefNumber(prefix, sequence) {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const paddedSeq = String(sequence).padStart(4, '0');
  return `${prefix}-${year}${month}-${paddedSeq}`;
}

/**
 * Calculate working days between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} Number of working days
 */
function getWorkingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

/**
 * Add working days to a date
 * @param {Date} date - Starting date
 * @param {number} days - Number of working days to add
 * @returns {Date} New date
 */
function addWorkingDays(date, days) {
  const result = new Date(date);
  let addedDays = 0;
  
  while (addedDays < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }
  
  return result;
}

/**
 * Format currency value
 * @param {number} value - Numeric value
 * @param {string} currency - Currency code (default: 'USD')
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(value);
}

/**
 * Round to specified decimal places
 * @param {number} value - Value to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded value
 */
function roundTo(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate percentage
 * @param {number} part - Part value
 * @param {number} total - Total value
 * @returns {number} Percentage
 */
function calculatePercentage(part, total) {
  if (total === 0) return 0;
  return roundTo((part / total) * 100);
}

/**
 * Generate a simple slug from text
 * @param {string} text - Text to slugify
 * @returns {string} Slugified text
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

/**
 * Check if object is empty
 * @param {Object} obj - Object to check
 * @returns {boolean} True if empty
 */
function isEmpty(obj) {
  return obj === null || obj === undefined || 
    (typeof obj === 'object' && Object.keys(obj).length === 0);
}

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module.exports = {
  generateDocumentNumber,
  generateRefNumber,
  getWorkingDays,
  addWorkingDays,
  formatCurrency,
  roundTo,
  calculatePercentage,
  slugify,
  isEmpty,
  deepClone,
};
