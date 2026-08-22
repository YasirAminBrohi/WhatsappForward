/**
 * forwardedRenderer.ts — Sender-Side Forwarded Header Badge Renderer
 *
 * Ensures outgoing message bubbles on the sender's WhatsApp Web view visually display
 * the authentic "↪ Forwarded" banner above the message text whenever Forwarded Mode is active.
 */

import { ExtensionSettings } from '../types';

let observer: MutationObserver | null = null;
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
  // If the bubble already has a forwarded badge (native or injected), skip
  if (
    bubble.querySelector('.wfm-forwarded-header') ||
    bubble.querySelector('[data-testid="forwarded"]') ||
    bubble.querySelector('[data-icon="forwarded"]')
  ) {
    return;
  }

  // Find the text container or inner bubble body
  const textContainer = bubble.querySelector<HTMLElement>('div.copyable-text, span.selectable-text');
  if (textContainer && textContainer.parentElement) {
    const badge = createForwardedBadgeElement(score);
    textContainer.parentElement.insertBefore(badge, textContainer);
  } else {
    const innerBubble = bubble.querySelector<HTMLElement>('div[class*="_amk4"], div[class*="_21Ahp"], div[class*="_1BOkc"]') || bubble;
    const badge = createForwardedBadgeElement(score);
    innerBubble.insertBefore(badge, innerBubble.firstChild);
  }
}

export function initForwardedRenderer(settings: ExtensionSettings): void {
  currentSettings = settings;

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  observer = new MutationObserver((mutations) => {
    if (!currentSettings?.forwardedMode) return;
    const score = currentSettings.forwardingScore ?? 1;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        const bubbles: HTMLElement[] = [];
        if (node.matches?.('.message-out, div[class*="message-out"]')) {
          bubbles.push(node);
        }
        node.querySelectorAll?.<HTMLElement>('.message-out, div[class*="message-out"]').forEach((b) => {
          bubbles.push(b);
        });

        for (const bubble of bubbles) {
          tagAndRenderBubble(bubble, score);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Check existing recent messages
  if (currentSettings.forwardedMode) {
    const existing = document.querySelectorAll<HTMLElement>('.message-out, div[class*="message-out"]');
    existing.forEach((el) => tagAndRenderBubble(el, currentSettings?.forwardingScore ?? 1));
  }
}

export function updateForwardedRendererSettings(settings: ExtensionSettings): void {
  currentSettings = settings;
  if (settings.forwardedMode) {
    const existing = document.querySelectorAll<HTMLElement>('.message-out, div[class*="message-out"]');
    existing.forEach((el) => tagAndRenderBubble(el, settings.forwardingScore ?? 1));
  }
}
