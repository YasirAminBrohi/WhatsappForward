/**
 * sendPlugin.ts — Forwarded Mode Dispatcher & State Synchronizer
 *
 * DUAL-LAYER DISPATCH STRATEGY:
 * 1. Active Send Interception: When Forwarded Mode is ON and user hits Enter
 *    or clicks Send, this plugin cancels the native event synchronously, reads
 *    the composer text, clears composer, and dispatches it directly through
 *    WhatsApp Web's protocol API with authentic isForwarded + forwardingScore metadata.
 * 2. Transparent Fallback: If protocol dispatch encounters an issue, state
 *    synchronization ensures monkey patches in waInject.js handle outgoing messages.
 */

import { ExtensionSettings } from '../types';
import { logger } from './logger';
import { sendForwardedMessage, syncForwardedState } from './moduleLoader';

let activeSettings: ExtensionSettings | null = null;
let isProcessingSend = false;

export function findComposerElement(): HTMLElement | null {
  if (document.activeElement) {
    const editable = (document.activeElement as HTMLElement).closest<HTMLElement>(
      'div[data-lexical-editor="true"], div[contenteditable="true"], div[role="textbox"]'
    );
    if (editable) return editable;
  }

  const selectors = [
    'div[data-lexical-editor="true"]',
    'footer div[contenteditable="true"]',
    'div[data-testid="conversation-compose-box-input"]',
    '#main footer div[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"]',
  ];

  for (const selector of selectors) {
    try {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) return el;
    } catch {
      // Continue
    }
  }

  return null;
}

function getComposerText(composer: HTMLElement): string {
  return (composer.innerText || composer.textContent || '').trim();
}

function clearComposer(composer: HTMLElement): void {
  try {
    composer.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand('delete', false);
    composer.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteContentBackward',
      })
    );
  } catch (err) {
    logger.warn('Error clearing composer:', err);
  }
}

async function syncState(): Promise<void> {
  if (!activeSettings) return;

  const enabled = activeSettings.forwardedMode;
  const score = activeSettings.forwardingScore ?? 1;

  try {
    document.documentElement.setAttribute('data-wfm-enabled', enabled ? 'true' : 'false');
    document.documentElement.setAttribute('data-wfm-score', String(score));
    localStorage.setItem('wfm_forwarded_mode', enabled ? 'true' : 'false');
    localStorage.setItem('wfm_forwarded_score', String(score));
  } catch { /* ignore */ }

  await syncForwardedState(enabled, score);
}

function handleSendInterception(e: Event): void {
  if (!activeSettings || !activeSettings.forwardedMode) return;
  if (isProcessingSend) return;

  const composer = findComposerElement();
  if (!composer) return;

  const text = getComposerText(composer);
  if (!text) return;

  // Cancel native event immediately and synchronously to prevent duplicate plain text sends
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  isProcessingSend = true;
  const score = activeSettings.forwardingScore ?? 1;

  console.log(`[ForwardedMode] Intercepted send: "${text}" (score=${score})`);

  clearComposer(composer);

  sendForwardedMessage(text, score)
    .then((result) => {
      if (result && result.success) {
        console.log('[ForwardedMode] ✅ Message sent via WhatsApp protocol API with forwarded badge!');
      } else {
        console.warn('[ForwardedMode] Protocol send note:', result?.error || 'unhandled error');
      }
    })
    .catch((err) => {
      console.warn('[ForwardedMode] Send dispatch error:', err);
    })
    .finally(() => {
      setTimeout(() => {
        isProcessingSend = false;
      }, 150);
    });
}

export function initSendPlugin(settings: ExtensionSettings): void {
  activeSettings = settings;

  // Intercept Enter key in capture phase
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        handleSendInterception(e);
      }
    },
    true
  );

  // Intercept Send button click in capture phase
  window.addEventListener(
    'mousedown',
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest('[data-icon="send"]') ||
          target.closest('[data-testid="send"]') ||
          target.closest('button[aria-label*="Send" i]'))
      ) {
        handleSendInterception(e);
      }
    },
    true
  );

  // Sync state initially and with retries
  syncState();
  setTimeout(() => syncState(), 800);
  setTimeout(() => syncState(), 2500);

  logger.log('Send plugin initialized (dual-layer mode)');
}

export function updateSendPluginSettings(settings: ExtensionSettings): void {
  const prevEnabled = activeSettings?.forwardedMode;
  const prevScore = activeSettings?.forwardingScore;

  activeSettings = settings;

  const newEnabled = settings.forwardedMode;
  const newScore = settings.forwardingScore;

  if (prevEnabled !== newEnabled || prevScore !== newScore) {
    syncState();
  }
}
