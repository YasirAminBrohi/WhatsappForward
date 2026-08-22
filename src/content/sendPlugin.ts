/**
 * sendPlugin.ts — Forwarded Mode Dispatcher & State Synchronizer
 *
 * DUAL-LAYER DISPATCH STRATEGY:
 * 1. Active Send Interception: When Forwarded Mode is ON and user hits Enter
 *    or clicks Send, this plugin cancels native events synchronously (preventing duplicate sends),
 *    extracts text, cleanly resets the Lexical composer, and dispatches via protocol API.
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

export function clearComposer(composer: HTMLElement): void {
  try {
    composer.focus();

    // 1. Native Select All + Delete + Clear
    document.execCommand('selectAll', false, undefined);
    document.execCommand('delete', false, undefined);
    document.execCommand('insertText', false, '');

    // 2. Selection Range Clearing
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand('delete', false, undefined);

    // 3. Dispatch Lexical-friendly InputEvents
    composer.dispatchEvent(
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteHardLineBackward',
      })
    );
    composer.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'deleteContentBackward',
      })
    );

    // 4. Force DOM reset if any text remained
    const textRemaining = (composer.innerText || composer.textContent || '').trim();
    if (textRemaining.length > 0) {
      composer.innerHTML = '<p class="selectable-text copyable-text"><br></p>';
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    }
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

function isSendButton(target: HTMLElement | null): boolean {
  if (!target) return false;
  return !!(
    target.closest('[data-icon="send"]') ||
    target.closest('[data-testid="send"]') ||
    target.closest('[data-testid="compose-btn-send"]') ||
    target.closest('button[aria-label*="Send" i]') ||
    target.closest('span[data-icon="send"]')
  );
}

function handleSendInterception(e: Event): void {
  if (!activeSettings || !activeSettings.forwardedMode) return;
  if (isProcessingSend) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return;
  }

  const composer = findComposerElement();
  if (!composer) return;

  const text = getComposerText(composer);
  if (!text) return;

  // Cancel native event synchronously so WhatsApp never triggers duplicate sends
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  isProcessingSend = true;
  const score = activeSettings.forwardingScore ?? 1;

  console.log(`[ForwardedMode] Intercepted send: "${text}" (score=${score})`);

  // Clear composer immediately on interception
  clearComposer(composer);

  sendForwardedMessage(text, score)
    .then((result) => {
      if (result && result.success) {
        console.log('[ForwardedMode] ✅ Message sent via WhatsApp protocol API with forwarded badge!');
        // Second pass clear to ensure no leftover text in any editor sub-tree
        clearComposer(composer);
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
      }, 250);
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

  // Intercept ALL send button events in capture phase to prevent double sending
  const sendEvents = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'];
  sendEvents.forEach((evtName) => {
    window.addEventListener(
      evtName,
      (e: Event) => {
        if (!activeSettings?.forwardedMode) return;
        const target = e.target as HTMLElement | null;
        if (isSendButton(target)) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (evtName === 'mousedown' || evtName === 'click') {
            handleSendInterception(e);
          }
        }
      },
      true // capture phase
    );
  });

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
