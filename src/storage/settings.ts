import { DEFAULT_SETTINGS, ExtensionSettings } from '../types';

/**
 * Retrieves the current extension settings from browser storage.
 * Gracefully falls back to DEFAULT_SETTINGS if storage is empty or unavailable.
 */
export async function getSettings(): Promise<ExtensionSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storageArea = chrome.storage.sync || chrome.storage.local;
      const result = await storageArea.get(DEFAULT_SETTINGS);
      return {
        ...DEFAULT_SETTINGS,
        ...result,
      };
    }
  } catch (error) {
    console.warn('[ForwardedMode] Error reading settings from storage:', error);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Updates specific settings fields in browser storage and returns the merged result.
 */
export async function updateSettings(
  partial: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const updated: ExtensionSettings = {
    ...current,
    ...partial,
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const storageArea = chrome.storage.sync || chrome.storage.local;
      await storageArea.set(updated);
    }
  } catch (error) {
    console.warn('[ForwardedMode] Error saving settings to storage:', error);
  }

  return updated;
}

/**
 * Listens for settings changes triggered from any part of the extension (popup, content script, other tabs).
 * Returns an unsubscription function.
 */
export function onSettingsChanged(
  callback: (settings: ExtensionSettings) => void
): () => void {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
    return () => {};
  }

  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === 'sync' || areaName === 'local') {
      getSettings().then(callback);
    }
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}
