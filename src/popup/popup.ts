import { getSettings, onSettingsChanged, updateSettings } from '../storage/settings';
import { ExtensionSettings, ForwardedStyle } from '../types';

// DOM Elements
const toggleForwardedMode = document.getElementById('toggle-forwarded-mode') as HTMLInputElement;
const toggleProtocolMode = document.getElementById('toggle-protocol-mode') as HTMLInputElement;
const toggleInpageControl = document.getElementById('toggle-inpage-control') as HTMLInputElement;
const toggleDebugMode = document.getElementById('toggle-debug-mode') as HTMLInputElement;
const statusBanner = document.getElementById('status-banner') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const tabStatus = document.getElementById('tab-status') as HTMLSpanElement;
const moduleStatusBanner = document.getElementById('module-status-banner') as HTMLDivElement;
const moduleStatusText = document.getElementById('module-status-text') as HTMLSpanElement;
const forwardingScoreSlider = document.getElementById('forwarding-score') as HTMLInputElement;
const scoreValueDisplay = document.getElementById('score-value') as HTMLSpanElement;
const fallbackStyleCard = document.getElementById('fallback-style-card') as HTMLDivElement;
const styleRadios = document.querySelectorAll<HTMLInputElement>('input[name="forwardedStyle"]');

/**
 * Updates UI controls to match settings object.
 */
function applySettingsToUI(settings: ExtensionSettings): void {
  toggleForwardedMode.checked = settings.forwardedMode;
  toggleProtocolMode.checked = settings.useProtocolLevel;
  toggleInpageControl.checked = settings.showInPageControl;
  toggleDebugMode.checked = settings.debugMode;

  // Forwarding score
  forwardingScoreSlider.value = String(settings.forwardingScore);
  scoreValueDisplay.textContent = String(settings.forwardingScore);

  // Style radios
  styleRadios.forEach((radio) => {
    radio.checked = radio.value === settings.forwardedStyle;
  });

  // Main mode status
  if (settings.forwardedMode) {
    statusBanner.classList.add('active');
    statusText.textContent = 'Forwarded Mode: ON';
  } else {
    statusBanner.classList.remove('active');
    statusText.textContent = 'Forwarded Mode: OFF';
  }

  // Protocol mode status
  if (settings.useProtocolLevel) {
    moduleStatusBanner.classList.add('active');
    moduleStatusText.textContent = 'WA Modules: Protocol Mode Active';
  } else {
    moduleStatusBanner.classList.remove('active');
    moduleStatusText.textContent = 'WA Modules: Using Markdown Fallback';
  }

  // Show/hide fallback style card based on protocol mode
  if (fallbackStyleCard) {
    fallbackStyleCard.style.display = settings.useProtocolLevel ? 'none' : '';
  }
}

/**
 * Checks if the currently active browser tab is WhatsApp Web.
 */
async function checkActiveTab(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.url && activeTab.url.includes('web.whatsapp.com')) {
        tabStatus.textContent = 'WhatsApp Web Connected';
        tabStatus.classList.add('active');
        return;
      }
    }
  } catch {
    // Ignore query error
  }
  tabStatus.textContent = 'WhatsApp Web Inactive';
  tabStatus.classList.remove('active');
}

/**
 * Initialize popup logic and bind event listeners.
 */
async function initPopup(): Promise<void> {
  const initialSettings = await getSettings();
  applySettingsToUI(initialSettings);
  await checkActiveTab();

  // Mode toggle
  toggleForwardedMode.addEventListener('change', async () => {
    const updated = await updateSettings({ forwardedMode: toggleForwardedMode.checked });
    applySettingsToUI(updated);
  });

  // Protocol mode toggle
  toggleProtocolMode.addEventListener('change', async () => {
    const updated = await updateSettings({ useProtocolLevel: toggleProtocolMode.checked });
    applySettingsToUI(updated);
  });

  // Forwarding score slider
  forwardingScoreSlider.addEventListener('input', () => {
    scoreValueDisplay.textContent = forwardingScoreSlider.value;
  });
  forwardingScoreSlider.addEventListener('change', async () => {
    const updated = await updateSettings({ forwardingScore: parseInt(forwardingScoreSlider.value, 10) });
    applySettingsToUI(updated);
  });

  // Style radios
  styleRadios.forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (radio.checked) {
        const updated = await updateSettings({ forwardedStyle: radio.value as ForwardedStyle });
        applySettingsToUI(updated);
      }
    });
  });

  // In-page toggle
  toggleInpageControl.addEventListener('change', async () => {
    const updated = await updateSettings({ showInPageControl: toggleInpageControl.checked });
    applySettingsToUI(updated);
  });

  // Debug toggle
  toggleDebugMode.addEventListener('change', async () => {
    const updated = await updateSettings({ debugMode: toggleDebugMode.checked });
    applySettingsToUI(updated);
  });

  // Storage listener
  onSettingsChanged((newSettings) => {
    applySettingsToUI(newSettings);
  });
}

document.addEventListener('DOMContentLoaded', initPopup);
