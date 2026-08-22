/**
 * moduleLoader.ts — Content-Script Bridge to waInject.ts
 *
 * Communicates with waInject.js (which runs in world: MAIN)
 * via CustomEvent bridge.
 *
 * NEW ARCHITECTURE: Instead of asking waInject to send messages,
 * we just sync the forwarded mode state (enabled + score) to the
 * page context. waInject's monkey-patches handle the rest automatically
 * when WhatsApp's own code sends messages.
 */

import { logger } from './logger';

let isHookReady = false;
let hookedModules: string[] = [];

const pendingRequests = new Map<string, {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

let requestCounter = 0;

function generateRequestId(): string {
  return `wfm-${Date.now()}-${++requestCounter}`;
}

/**
 * Sends a command to the page script (waInject.js) and awaits response.
 */
function sendCommand<T = any>(action: string, payload: any = {}, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = generateRequestId();

    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Command '${action}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timer });

    document.dispatchEvent(
      new CustomEvent('wfm-command', {
        detail: { action, payload, requestId },
      })
    );
  });
}

function setupResponseListener(): void {
  document.addEventListener('wfm-response', ((e: CustomEvent) => {
    const { requestId, data } = e.detail;

    if (requestId === 'init') {
      isHookReady = data.ready;
      hookedModules = data.modules || [];
      logger.log(`Module hooks init: ready=${isHookReady}, hooks=[${hookedModules.join(', ')}]`);
      return;
    }

    const pending = pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(requestId);
      pending.resolve(data);
    }
  }) as EventListener);
}

export function initModuleLoader(): void {
  setupResponseListener();
  logger.log('Module loader initialized (monkey-patch mode)');
}

export function isModuleReady(): boolean {
  return isHookReady;
}

export function getDiscoveredModules(): string[] {
  return [...hookedModules];
}

/**
 * Sync the forwarded mode state to the page context.
 * waInject.ts sets window.__FORWARDED_MODE_ENABLED and window.__FORWARDED_SCORE,
 * which are read by the monkey-patched functions when WhatsApp sends a message.
 */
export async function syncForwardedState(enabled: boolean, score: number): Promise<void> {
  try {
    await sendCommand('setForwardedMode', { enabled, score }, 2000);
    logger.log(`Synced forwarded state to page: enabled=${enabled}, score=${score}`);
  } catch (err) {
    logger.debug('Failed to sync forwarded state:', err);
  }
}

export async function pingModules(): Promise<{
  ready: boolean;
  modules: string[];
}> {
  try {
    const result = await sendCommand<{ ready: boolean; modules: string[] }>('ping', {}, 2000);
    isHookReady = result.ready;
    hookedModules = result.modules || [];
    return result;
  } catch (err) {
    logger.debug('Ping failed:', err);
    return { ready: false, modules: [] };
  }
}

export async function getModuleStatus(): Promise<{
  ready: boolean;
  modules: string[];
  forwardedEnabled: boolean;
  forwardedScore: number;
}> {
  try {
    return await sendCommand('getStatus', {}, 2000);
  } catch {
    return { ready: false, modules: [], forwardedEnabled: false, forwardedScore: 1 };
  }
}

export async function sendForwardedMessage(
  text: string,
  forwardingScore: number
): Promise<{ success: boolean; error?: string }> {
  try {
    return await sendCommand<{ success: boolean; error?: string }>(
      'sendForwarded',
      { text, forwardingScore },
      3500
    );
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

export async function retryHooks(): Promise<{
  ready: boolean;
  modules: string[];
}> {
  try {
    return await sendCommand('retryHooks', {}, 5000);
  } catch {
    return { ready: false, modules: [] };
  }
}
