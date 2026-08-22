/**
 * WhatsApp Web DOM Abstraction Layer
 * 
 * Provides resilient selectors for chat header and in-page controls.
 */

export const HEADER_SELECTORS = [
  '#main header',
  'div[data-testid="conversation-header"]',
  'div[data-testid="chat-header"]',
  'header',
];

export function findChatHeader(): HTMLElement | null {
  for (const selector of HEADER_SELECTORS) {
    try {
      const match = document.querySelector<HTMLElement>(selector);
      if (match) return match;
    } catch {
      // Continue
    }
  }
  return null;
}
