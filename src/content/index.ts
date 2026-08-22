import { getSettings, onSettingsChanged } from '../storage/settings';
import { ExtensionSettings } from '../types';
import { initForwardedRenderer, updateForwardedRendererSettings } from './forwardedRenderer';
import { syncInjectedControl } from './injectedControl';
import { logger, setDebugMode } from './logger';
import { initModuleLoader } from './moduleLoader';
import { initSendPlugin, updateSendPluginSettings } from './sendPlugin';

/**
 * Main initialization entry point for WhatsApp Web Forwarded Text Mode content script.
 */
async function initialize(): Promise<void> {
  try {
    // Load initial settings
    const settings = await getSettings();
    setDebugMode(settings.debugMode);

    logger.log('WhatsApp Web detected');
    logger.log(`Initial state: Forwarded Mode = ${settings.forwardedMode ? 'ON' : 'OFF'}`);
    logger.log(`Protocol level: ${settings.useProtocolLevel ? 'ON' : 'OFF (markdown fallback)'}`);

    // 1. Initialize module loader (CustomEvent bridge to MAIN world waInject.js)
    initModuleLoader();

    // 2. Initialize in-page quick toggle button
    syncInjectedControl(settings);

    // 3. Initialize send plugin (captures send events & clears composer)
    initSendPlugin(settings);

    // 4. Initialize sender-side forwarded badge renderer
    initForwardedRenderer(settings);

    // 5. Subscribe to settings changes
    onSettingsChanged((updatedSettings: ExtensionSettings) => {
      logger.log(`Settings updated: Forwarded Mode = ${updatedSettings.forwardedMode ? 'ON' : 'OFF'}`);
      setDebugMode(updatedSettings.debugMode);

      syncInjectedControl(updatedSettings);
      updateSendPluginSettings(updatedSettings);
      updateForwardedRendererSettings(updatedSettings);
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
