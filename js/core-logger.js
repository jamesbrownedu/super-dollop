/**
 * Logging System - Structured logging with persistence
 * Handles console, storage, and server-side logging
 */

class Logger {
  constructor(context) {
    this.context = context;
    this.logs = [];
    this.maxLogs = 100;
  }

  /**
   * Log a message with optional data
   */
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      context: this.context,
      message,
      data,
      userAgent: navigator.userAgent
    };

    // Add to local array
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output
    const prefix = `[${level.toUpperCase()}] [${this.context}]`;
    if (level === 'error') {
      console.error(prefix, message, data);
    } else if (level === 'warn') {
      console.warn(prefix, message, data);
    } else {
      console.log(prefix, message, data);
    }

    // Send to server if error
    if (level === 'error') {
      this.sendToServer(logEntry);
    }
  }

  /**
   * Send critical logs to server for monitoring
   */
  async sendToServer(logEntry) {
    try {
      // Non-blocking - use sendBeacon if available
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/logs', JSON.stringify(logEntry));
      }
    } catch (e) {
      // Fail silently to avoid recursive errors
    }
  }

  info(message, data) { this.log('info', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  error(message, data) { this.log('error', message, data); }

  /**
   * Get recent logs for debugging
   */
  getRecentLogs(count = 20) {
    return this.logs.slice(-count);
  }

  /**
   * Export logs as JSON
   */
  exportLogs() {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Create global logger instance
const logger = new Logger('GameUI');
