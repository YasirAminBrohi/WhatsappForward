/**
 * Logging utility for WhatsApp Web Forwarded Text Mode extension.
 * Operates quietly in production mode and outputs structured diagnostics when debugMode is active.
 */

let isDebugEnabled = false;

export function setDebugMode(enabled: boolean): void {
  isDebugEnabled = enabled;
}

export function getDebugMode(): boolean {
  return isDebugEnabled;
}

export const logger = {
  log(...args: unknown[]): void {
    if (isDebugEnabled) {
      console.log('[ForwardedMode]', ...args);
    }
  },

  info(...args: unknown[]): void {
    if (isDebugEnabled) {
      console.info('[ForwardedMode]', ...args);
    }
  },

  warn(...args: unknown[]): void {
    if (isDebugEnabled) {
      console.warn('[ForwardedMode]', ...args);
    }
  },

  error(...args: unknown[]): void {
    // Critical errors are logged with prefix
    console.error('[ForwardedMode]', ...args);
  },

  debug(...args: unknown[]): void {
    if (isDebugEnabled) {
      console.debug('[ForwardedMode]', ...args);
    }
  },
};
