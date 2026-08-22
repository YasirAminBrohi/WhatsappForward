import { getSettings, onSettingsChanged } from '../storage/settings';
import { ExtensionSettings } from '../types';
import { syncInjectedControl } from './injectedControl';
import { logger, setDebugMode } from './logger';
import { initModuleLoader } from './moduleLoader';
import { initSendPlugin, updateSendPluginSettings } from './sendPlugin';

/**
 * Main initialization entry point for WhatsApp Web Forwarded Text Mode content script.
 *
 * NEW ARCHITECTURE (Monkey-Patch Mode):
 * - waInject.ts runs in MAIN world and monkey-patches WhatsApp's internal
 *   sendTextMsgToChat, addAndSendMsgToChat, and createMsgProtobuf functions.
 * - This content script (ISOLATED world) syncs the forwarded mode state
 *   (enabled + score) to the page context via CustomEvent bridge.
 * - When the user sends a message normally, WhatsApp's own code calls
 *   the patched functions, which inject forwarded metadata automatically.
 * - NO Enter key or Send button interception is needed.
 */
async function initialize(): Promise<void> {
  try {
    // Load initial settings
    const settings = await getSettings();
    setDebugMode(settings.debugMode);

    logger.log('WhatsApp Web detected');
    logger.log(`Initial state: Forwarded Mode = ${settings.forwardedMode ? 'ON' : 'OFF'}`);
    logger.log(`Protocol level: ${settings.useProtocolLevel ? 'ON' : 'OFF (markdown fallback)'}`);

    // Always initialize module loader — it sets up the CustomEvent bridge
    // to communicate with waInject.ts (which runs in MAIN world)
    initModuleLoader();

    // Initialize in-page quick toggle button
    syncInjectedControl(settings);

    // Initialize send plugin (syncs forwarded state to page context)
    initSendPlugin(settings);

    // Subscribe to settings changes (from popup, in-page toggle, or other tabs)
    onSettingsChanged((updatedSettings: ExtensionSettings) => {
      logger.log(`Settings updated: Forwarded Mode = ${updatedSettings.forwardedMode ? 'ON' : 'OFF'}`);
      setDebugMode(updatedSettings.debugMode);

      syncInjectedControl(updatedSettings);
      updateSendPluginSettings(updatedSettings);
    });
  } catch (error) {
    logger.warn('Failed to initialize ForwardedMode content script:', error);
  }
}

// Safely bootstrap when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize();
  });
} else {
  initialize();
}
