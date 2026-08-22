/**
 * Background Service Worker
 * Manages auto-injection into existing WhatsApp Web tabs on install/update.
 */

async function injectIntoWhatsAppTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css'],
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            files: ['waInject.js'],
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
        } catch {
          // Tab may not be ready or already injected
        }
      }
    }
  } catch (error) {
    console.warn('[ForwardedMode Background] Error injecting into tabs:', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  injectIntoWhatsAppTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoWhatsAppTabs();
});
