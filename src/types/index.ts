/**
 * Extension Settings Configuration Interface
 */
export type ForwardedStyle = 'quote' | 'divider' | 'header';

export interface ExtensionSettings {
  /** Whether the Forwarded Text Mode is currently active */
  forwardedMode: boolean;
  /** Visual formatting style applied to outgoing messages (markdown fallback) */
  forwardedStyle: ForwardedStyle;
  /** Forwarding score: 1 = "Forwarded", 4+ = "Forwarded many times" */
  forwardingScore: number;
  /** Whether to use WhatsApp internal API (true) or markdown fallback (false) */
  useProtocolLevel: boolean;
  /** Whether developer console logging is enabled */
  debugMode: boolean;
  /** Whether the in-page quick toggle button is shown */
  showInPageControl: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  forwardedMode: false,
  forwardedStyle: 'quote',
  forwardingScore: 1,
  useProtocolLevel: true,
  debugMode: false,
  showInPageControl: true,
};
