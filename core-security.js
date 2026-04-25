/**
 * Security & Utilities Module
 * Handles XSS protection, input validation, rate limiting, etc.
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML-safe text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, char => map[char]);
}

/**
 * Sanitize HTML input - removes dangerous tags
 * @param {string} html - HTML to sanitize
 * @returns {string} - Sanitized HTML
 */
function sanitizeHtml(html) {
  const temp = document.createElement('div');
  temp.textContent = html;
  return temp.innerHTML;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(String(email).toLowerCase());
}

/**
 * Validate game URL - must be HTTPS and not localhost
 * @param {string} url - URL to validate
 * @returns {string|null} - Error message or null if valid
 */
function validateGameURL(url) {
  try {
    if (!url || !url.trim()) return 'URL is required';
    
    const u = new URL(url);
    
    // Must be HTTPS
    if (u.protocol !== 'https:') {
      return 'Game URL must use HTTPS';
    }
    
    // Blacklist dangerous hosts
    const dangerous = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    if (dangerous.some(host => u.hostname.includes(host))) {
      return 'Cannot use local/private URLs';
    }
    
    // Check domain length (prevent abuse)
    if (u.hostname.length > 253) {
      return 'URL hostname too long';
    }
    
    return null; // Valid
  } catch (e) {
    return 'Invalid URL format';
  }
}

/**
 * Validate image URL
 * @param {string} url - Image URL to validate
 * @returns {string|null} - Error message or null if valid
 */
function validateImageURL(url) {
  if (!url) return null; // Optional field
  
  const urlError = validateGameURL(url);
  if (urlError) return urlError;
  
  // Check file extension
  const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const hasValidExt = validExts.some(ext => url.toLowerCase().endsWith(ext));
  if (!hasValidExt) {
    return 'Image must be JPG, PNG, GIF, WebP, or SVG';
  }
  
  return null;
}

/**
 * Validate text input with rules
 * @param {string} value - Value to validate
 * @param {Object} rules - Validation rules
 * @returns {string|null} - Error message or null if valid
 */
function validateInput(value, rules = {}) {
  const {
    required = true,
    maxLength = 1000,
    minLength = 0,
    pattern = null,
    allowedChars = null
  } = rules;

  if (required && !value?.trim()) {
    return 'This field is required';
  }

  if (value && value.length > maxLength) {
    return `Maximum ${maxLength} characters allowed`;
  }

  if (value && value.length < minLength) {
    return `Minimum ${minLength} characters required`;
  }

  if (pattern && !pattern.test(value)) {
    return 'Invalid format';
  }

  if (allowedChars && !new RegExp(`^[${allowedChars}]*$`).test(value)) {
    return `Only these characters allowed: ${allowedChars}`;
  }

  return null;
}

/**
 * Rate limiter - prevents spam
 */
class RateLimiter {
  constructor(maxAttempts = 5, windowMs = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }

  /**
   * Check if action is allowed
   * @param {string} key - Unique identifier (e.g., user ID)
   * @returns {boolean} - True if allowed, false if rate limited
   */
  isAllowed(key) {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];

    // Remove old attempts outside window
    const recentAttempts = attempts.filter(time => now - time < this.windowMs);

    if (recentAttempts.length >= this.maxAttempts) {
      return false; // Rate limited
    }

    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return true;
  }

  /**
   * Get remaining attempts
   */
  getRemaining(key) {
    const attempts = this.attempts.get(key) || [];
    const now = Date.now();
    const recentAttempts = attempts.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxAttempts - recentAttempts.length);
  }

  /**
   * Reset for a key
   */
  reset(key) {
    this.attempts.delete(key);
  }
}

/**
 * Debouncer - delays function execution
 */
class Debouncer {
  constructor(func, delay = 300) {
    this.func = func;
    this.delay = delay;
    this.timeout = null;
  }

  /**
   * Call function with debounce
   */
  execute(...args) {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.func.apply(this, args);
    }, this.delay);
  }

  /**
   * Cancel pending execution
   */
  cancel() {
    clearTimeout(this.timeout);
  }

  /**
   * Execute immediately (ignoring debounce)
   */
  flush(...args) {
    clearTimeout(this.timeout);
    this.func.apply(this, args);
  }
}

/**
 * Throttler - limits function execution frequency
 */
class Throttler {
  constructor(func, delay = 300) {
    this.func = func;
    this.delay = delay;
    this.lastExecution = 0;
  }

  /**
   * Call function with throttle
   */
  execute(...args) {
    const now = Date.now();
    if (now - this.lastExecution >= this.delay) {
      this.lastExecution = now;
      this.func.apply(this, args);
    }
  }
}

/**
 * Error handler with retry logic
 */
class ErrorHandler {
  constructor(maxRetries = 3, backoffMs = 1000) {
    this.maxRetries = maxRetries;
    this.backoffMs = backoffMs;
  }

  /**
   * Execute async function with retry
   */
  async executeWithRetry(asyncFn, context = null) {
    let lastError;

    for (let i = 0; i < this.maxRetries; i++) {
      try {
        return await asyncFn.call(context);
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${i + 1} failed, retrying...`, {
          error: error.message,
          attemptNumber: i + 1
        });

        // Exponential backoff
        if (i < this.maxRetries - 1) {
          const delayMs = this.backoffMs * Math.pow(2, i);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    logger.error('All retry attempts failed', {
      error: lastError?.message,
      totalAttempts: this.maxRetries
    });
    throw lastError;
  }

  /**
   * Handle Firebase error
   */
  handleFirebaseError(error) {
    const messages = {
      'permission-denied': 'You do not have permission to do this',
      'not-found': 'The item was not found',
      'already-exists': 'This item already exists',
      'invalid-argument': 'Invalid input provided',
      'unauthenticated': 'Please log in to continue',
      'unavailable': 'Service temporarily unavailable',
      'unknown': 'An unknown error occurred'
    };

    return messages[error.code] || error.message || 'An error occurred';
  }

  /**
   * Handle network error
   */
  handleNetworkError(error) {
    if (!navigator.onLine) {
      return 'No internet connection. Please check your network.';
    }
    if (error.code === 'NETWORK_ERROR') {
      return 'Network error. Please try again.';
    }
    if (error.code === 'TIMEOUT') {
      return 'Request timed out. Please try again.';
    }
    return 'Network error occurred';
  }
}

// Create global instances
const rateLimiters = {
  chatMessage: new RateLimiter(10, 60000), // 10 messages per minute
  gameSubmit: new RateLimiter(5, 300000), // 5 submissions per 5 minutes
  adminAction: new RateLimiter(20, 60000), // 20 actions per minute
  fileUpload: new RateLimiter(5, 60000) // 5 uploads per minute
};

const errorHandler = new ErrorHandler(3, 1000);
