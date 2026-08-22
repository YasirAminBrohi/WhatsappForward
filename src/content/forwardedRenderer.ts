/**
 * forwardedRenderer.ts — Sender-Side Forwarded Header Badge Renderer
 *
 * Ensures outgoing message bubbles on the sender's WhatsApp Web view visually display
 * the authentic "↪ Forwarded" banner inside the green bubble above the message text.
 */

import { ExtensionSettings } from '../types';

let observer: MutationObserver | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentSettings: ExtensionSettings | null = null;

const FORWARD_ICON_SVG = `
  <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
    <path d="M12.5 7.5L8 3v3C3.5 6 1.5 9 1 12.5c1.5-2 3.5-3 7-3v3l4.5-4.5z"/>
  </svg>
`;

function createForwardedBadgeElement(score: number): HTMLElement {
  const badge = document.createElement('div');
  badge.className = 'wfm-forwarded-header';
  const labelText = score >= 4 ? 'Forwarded many times' : 'Forwarded';

  badge.innerHTML = `
    ${FORWARD_ICON_SVG}
    <span>${labelText}</span>
  `;
  return badge;
}

export function tagAndRenderBubble(bubble: HTMLElement, score: number): void {
  if (!bubble) return;

  // If already tagged or has official native badge, skip
  if (
    bubble.querySelector('.wfm-forwarded-header') ||
    bubble.querySelector('[data-testid="forwarded"]') ||
    bubble.querySelector('[data-icon="forwarded"]') ||
    bubble.querySelector('[data-icon="forwarded-many"]')
  ) {
    return;
  }

  // Target the inner bubble body (copyable-text is the green bubble container in WA Web)
  const copyableContainer = bubble.matches?.('.copyable-text')
    ? bubble
    : bubble.querySelector<HTMLElement>('.copyable-text') ||
      bubble.querySelector<HTMLElement>('div[class*="_amk6"], div[class*="_amk7"], div[class*="_21Ahp"], div[class*="_1BOkc"]') ||
      bubble;

  if (copyableContainer) {
    const badge = createForwardedBadgeElement(score);
    copyableContainer.insertBefore(badge, copyableContainer.firstChild);
  }
}

export function scanAllOutgoingBubbles(): void {
  if (!currentSettings || !currentSettings.forwardedMode) return;
  const score = currentSettings.forwardingScore ?? 1;

  const selectors = [
    'div.message-out',
    'div[class*="message-out"]',
    'div[data-id^="true_"]',
  ];

  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      elements.forEach((el) => tagAndRenderBubble(el, score));
    } catch { /* ignore */ }
  }
}

export function initForwardedRenderer(settings: ExtensionSettings): void {
  currentSettings = settings;

  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  observer = new MutationObserver(() => {
    if (currentSettings?.forwardedMode) {
      scanAllOutgoingBubbles();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Periodic fallback scan to handle React DOM reconciliations
  pollTimer = setInterval(() => {
    if (currentSettings?.forwardedMode) {
      scanAllOutgoingBubbles();
    }
  }, 400);

  scanAllOutgoingBubbles();
}

export function updateForwardedRendererSettings(settings: ExtensionSettings): void {
  currentSettings = settings;
  if (settings.forwardedMode) {
    scanAllOutgoingBubbles();
  }
}
