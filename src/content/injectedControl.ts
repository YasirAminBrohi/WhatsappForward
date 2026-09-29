import { ExtensionSettings } from '../types';
import { updateSettings } from '../storage/settings';
import { logger } from './logger';
import { findChatHeader } from './whatsappDom';

const INJECTED_CONTROL_ID = 'wfm-injected-toggle-button';
let headerObserver: MutationObserver | null = null;
let currentSettings: ExtensionSettings | null = null;

/**
 * Creates or updates the in-page "Forwarded Mode" toggle control.
 */
export function syncInjectedControl(settings: ExtensionSettings): void {
  currentSettings = settings;

  try {
    let control = document.getElementById(INJECTED_CONTROL_ID) as HTMLButtonElement | null;

    if (!settings.showInPageControl) {
      if (control) control.remove();
      stopHeaderObserver();
      return;
    }

    if (!control) {
      control = document.createElement('button');
      control.id = INJECTED_CONTROL_ID;
      control.type = 'button';
      control.className = 'wfm-injected-pill';

      control.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentMode = control?.getAttribute('data-mode') === 'on';
        const newMode = !currentMode;
        logger.log(`Toggled Forwarded Mode via in-page control to: ${newMode ? 'ON' : 'OFF'}`);
        await updateSettings({ forwardedMode: newMode });
      });

      document.body.appendChild(control);
    }

    // Update state & visual styling
    const isModeOn = settings.forwardedMode;
    control.setAttribute('data-mode', isModeOn ? 'on' : 'off');
    control.title = `Forwarded Text Mode: ${isModeOn ? 'ON' : 'OFF'} • Powered by NorthPeak Studio`;

    control.innerHTML = `
      <span class="wfm-pill-dot ${isModeOn ? 'wfm-dot-active' : ''}"></span>
      <span class="wfm-pill-text">Forwarded Mode: <strong>${isModeOn ? 'ON' : 'OFF'}</strong></span>
    `;

    // Try docking into active chat header if available
    const header = findChatHeader();
    if (header && !header.contains(control)) {
      header.appendChild(control);
    }

    startHeaderObserver();
  } catch (error) {
    logger.warn('Error syncing in-page control:', error);
  }
}

/**
 * Observes header mutations so the button stays docked when switching chats.
 */
function startHeaderObserver(): void {
  if (headerObserver) return;

  headerObserver = new MutationObserver(() => {
    if (!currentSettings || !currentSettings.showInPageControl) return;

    const control = document.getElementById(INJECTED_CONTROL_ID);
    const header = findChatHeader();

    if (control && header && !header.contains(control)) {
      header.appendChild(control);
    }
  });

  headerObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopHeaderObserver(): void {
  if (headerObserver) {
    headerObserver.disconnect();
    headerObserver = null;
  }
}

/**
 * Removes the in-page control from the DOM.
 */
export function removeInjectedControl(): void {
  const control = document.getElementById(INJECTED_CONTROL_ID);
  if (control) control.remove();
  stopHeaderObserver();
}
