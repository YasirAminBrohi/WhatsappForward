/**
 * waInject.ts — WhatsApp Web Page-Context Injection Script
 *
 * Runs in WhatsApp Web's MAIN execution context (world: MAIN).
 *
 * FULL-SPECTRUM PROTOCOL FORWARDING ENGINE:
 * 1. Meta Registry Scanner (__debug.modulesMap):
 *    Enumerates all modules in Meta's runtime to find and hook ALL instances
 *    of createMsgProtobuf, createQuotedMsgProtobuf, and send actions.
 * 2. Protobuf Serialization Interceptor (createMsgProtobuf):
 *    Upgrades plain text waE2E.Message.conversation (Tag 1) to
 *    waE2E.Message.extendedTextMessage (Tag 6) with ContextInfo containing
 *    isForwarded: true and forwardingScore: N.
 * 3. Model Prototype Interception:
 *    Hooks Msg.prototype.initialize and Chat.prototype.sendMessage so models
 *    always carry isForwarded: true and forwardingScore: N at the JavaScript object level.
 * 4. Active Protocol Dispatcher:
 *    Dispatches via createTextMsgData + addAndSendMsgToChat with full forwarding metadata.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const WFM_LOG_PREFIX = '[ForwardedMode:Inject]';

(window as any).__FORWARDED_MODE_ENABLED = false;
(window as any).__FORWARDED_SCORE = 1;

let isReady = false;
const hookedModules: string[] = [];
const diagnostics: string[] = [];

function diag(msg: string): void {
  diagnostics.push(msg);
  console.log(WFM_LOG_PREFIX, msg);
}

function isForwardedModeActive(): boolean {
  if (document.documentElement.getAttribute('data-wfm-enabled') === 'true') {
    return true;
  }
  if ((window as any).__FORWARDED_MODE_ENABLED) {
    return true;
  }
  try {
    if (localStorage.getItem('wfm_forwarded_mode') === 'true') {
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

function getForwardedScore(): number {
  const domScore = document.documentElement.getAttribute('data-wfm-score');
  if (domScore) {
    const parsed = parseInt(domScore, 10);
    if (!isNaN(parsed) && parsed >= 1) return parsed;
  }
  const winScore = (window as any).__FORWARDED_SCORE;
  if (typeof winScore === 'number' && winScore >= 1) return winScore;
  try {
    const stored = localStorage.getItem('wfm_forwarded_score');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= 1) return parsed;
    }
  } catch { /* ignore */ }
  return 1;
}

// ---------------------------------------------------------------------------
// 1. Meta Module System Access & ErrorGuard Bypass
// ---------------------------------------------------------------------------

function getRequire(): any {
  const win = window as any;
  return win.require || win.__r || null;
}

function bypassErrorGuard(): void {
  try {
    if ((window as any).ErrorGuard?.skipGuardGlobal) {
      (window as any).ErrorGuard.skipGuardGlobal(true);
    }
  } catch { /* ignore */ }

  const req = getRequire();
  if (!req) return;

  try {
    const eg = req('ErrorGuard');
    if (eg?.skipGuardGlobal) {
      eg.skipGuardGlobal(true);
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 2. Store Module Registry & Resolution
// ---------------------------------------------------------------------------

interface WAStoreModules {
  ChatCollection: any;
  sendTextMsgToChat: any;
  createTextMsgData: any;
  addAndSendTextMsg: any;
  addAndSendMsgToChat: any;
  createMsgProtobuf: any;
  MsgCollection: any;
  forwardMessages: any;
}

const waModules: Partial<WAStoreModules> = {};

function resolveModules(): boolean {
  const req = getRequire();
  if (!req) return false;

  bypassErrorGuard();

  // 1. Resolve WAWebSendTextMsgChatAction
  if (!waModules.createTextMsgData || !waModules.sendTextMsgToChat) {
    try {
      const mod = req('WAWebSendTextMsgChatAction');
      if (mod) {
        if (typeof mod.sendTextMsgToChat === 'function') waModules.sendTextMsgToChat = mod.sendTextMsgToChat;
        if (typeof mod.createTextMsgData === 'function') waModules.createTextMsgData = mod.createTextMsgData;
        if (typeof mod.addAndSendTextMsg === 'function') waModules.addAndSendTextMsg = mod.addAndSendTextMsg;
        diag('Resolved WAWebSendTextMsgChatAction functions');
      }
    } catch { /* ignore */ }
  }

  // 2. Resolve WAWebSendMsgChatAction
  if (!waModules.addAndSendMsgToChat) {
    try {
      const mod = req('WAWebSendMsgChatAction');
      if (mod) {
        if (typeof mod.addAndSendMsgToChat === 'function') waModules.addAndSendMsgToChat = mod.addAndSendMsgToChat;
        diag('Resolved WAWebSendMsgChatAction functions');
      }
    } catch { /* ignore */ }
  }

  // 3. Resolve WAWebChatCollection
  if (!waModules.ChatCollection) {
    try {
      const mod = req('WAWebChatCollection');
      if (mod) {
        waModules.ChatCollection = mod.ChatCollection || mod.default?.ChatCollection || mod;
        diag('Resolved WAWebChatCollection');
      }
    } catch { /* ignore */ }
  }

  // 4. Resolve WAWebMsgCollection
  if (!waModules.MsgCollection) {
    try {
      const mod = req('WAWebMsgCollection');
      if (mod) {
        waModules.MsgCollection = mod.MsgCollection || mod.default?.MsgCollection || mod;
        diag('Resolved WAWebMsgCollection');
      }
    } catch { /* ignore */ }
  }

  // 5. Resolve WAWebChatForwardMessage
  if (!waModules.forwardMessages) {
    const fwdModNames = ['WAWebChatForwardMessage', 'WAWebForwardMessagesChatAction'];
    for (const name of fwdModNames) {
      try {
        const mod = req(name);
        if (mod && (typeof mod.forwardMessages === 'function' || typeof mod.forwardMessagesToChats === 'function')) {
          waModules.forwardMessages = mod.forwardMessages || mod.forwardMessagesToChats;
          diag(`Resolved forwardMessages from "${name}"`);
          break;
        }
      } catch { /* ignore */ }
    }
  }

  // 6. Comprehensive Scan of Meta's __debug.modulesMap to find createMsgProtobuf
  findAndHookAllProtobufModules(req);

  // Install all hooks (prototypes + function monkey-patches)
  installAllHooks();

  return !!(waModules.addAndSendMsgToChat && (waModules.createTextMsgData || waModules.sendTextMsgToChat));
}

// ---------------------------------------------------------------------------
// 3. Meta Runtime Protobuf Scanner & Hook Engine
// ---------------------------------------------------------------------------

function findAndHookAllProtobufModules(req: any): void {
  try {
    let modulesMap: any = null;

    try {
      const debugMod = req('__debug');
      if (debugMod?.modulesMap) modulesMap = debugMod.modulesMap;
    } catch { /* ignore */ }

    if (!modulesMap && req.modules) {
      modulesMap = req.modules;
    }

    if (!modulesMap) return;

    const moduleNames = Object.keys(modulesMap);

    for (const name of moduleNames) {
      try {
        const mod = req(name);
        if (!mod) continue;

        const targets = [mod, mod.default].filter(Boolean);
        for (const target of targets) {
          if (typeof target.createMsgProtobuf === 'function') {
            if (!waModules.createMsgProtobuf) waModules.createMsgProtobuf = target.createMsgProtobuf;
            hookProtobufModule(target, name);
          }
          if (typeof target.createQuotedMsgProtobuf === 'function') {
            hookProtobufModule(target, `${name}:quoted`);
          }
        }
      } catch { /* ignore individual module evaluation errors */ }
    }
  } catch (err: any) {
    diag(`Module scanner note: ${err.message || String(err)}`);
  }
}

function hookProtobufModule(target: any, name: string): void {
  const hookKey = `createMsgProtobuf:${name}`;
  if (hookedModules.includes(hookKey)) return;

  const orig = target.createMsgProtobuf;
  target.createMsgProtobuf = function (msgModel: any, options: any, ...rest: any[]) {
    const proto = orig.call(this, msgModel, options, ...rest);
    try {
      const active = isForwardedModeActive();
      const modelIsForwarded = !!(msgModel?.isForwarded || msgModel?.get?.('isForwarded'));

      if (active || modelIsForwarded) {
        const score = getForwardedScore() || msgModel?.forwardingScore || 1;
        if (proto) {
          if (proto.conversation) {
            // Upgrade plain text (conversation) to extendedTextMessage with ContextInfo
            proto.extendedTextMessage = {
              text: proto.conversation,
              contextInfo: {
                ...(proto.contextInfo || {}),
                isForwarded: true,
                forwardingScore: score,
              },
            };
            delete proto.conversation;
            console.log(WFM_LOG_PREFIX, `✅ [createMsgProtobuf:${name}] Converted conversation -> extendedTextMessage (score=${score})`);
          } else if (proto.extendedTextMessage) {
            if (!proto.extendedTextMessage.contextInfo) proto.extendedTextMessage.contextInfo = {};
            proto.extendedTextMessage.contextInfo.isForwarded = true;
            proto.extendedTextMessage.contextInfo.forwardingScore = score;
            console.log(WFM_LOG_PREFIX, `✅ [createMsgProtobuf:${name}] Injected contextInfo into extendedTextMessage (score=${score})`);
          }
        }
      }
    } catch (err) {
      console.warn(WFM_LOG_PREFIX, 'createMsgProtobuf hook notice:', err);
    }
    return proto;
  };

  hookedModules.push(hookKey);
  diag(`✅ HOOKED createMsgProtobuf from "${name}"`);
}

// ---------------------------------------------------------------------------
// 4. Prototype & Function Hook Installation
// ---------------------------------------------------------------------------

function installAllHooks(): void {
  const req = getRequire();
  if (!req) return;

  // A. Hook Msg model prototype (guarantees isForwarded is true on the model itself)
  if (waModules.MsgCollection && !hookedModules.includes('MsgPrototype')) {
    try {
      const sampleMsg = waModules.MsgCollection.getModelsArray?.()?.[0] || waModules.MsgCollection.models?.[0];
      const MsgProto = sampleMsg?.constructor?.prototype;
      if (MsgProto) {
        const origInit = MsgProto.initialize;
        if (origInit) {
          MsgProto.initialize = function (...args: any[]) {
            const res = origInit.apply(this, args);
            if (isForwardedModeActive() && this.self === 'out') {
              const score = getForwardedScore();
              if (typeof this.set === 'function') {
                this.set('isForwarded', true);
                this.set('forwardingScore', score);
                this.set('multicast', true);
              }
              this.isForwarded = true;
              this.forwardingScore = score;
              this.multicast = true;
            }
            return res;
          };
        }
        hookedModules.push('MsgPrototype');
        diag('✅ HOOKED Msg.prototype.initialize');
      }
    } catch { /* ignore */ }
  }

  // B. Hook Chat model prototype
  if (waModules.ChatCollection && !hookedModules.includes('ChatPrototype')) {
    try {
      const sampleChat = waModules.ChatCollection.getActive?.() || waModules.ChatCollection.getModelsArray?.()?.[0];
      const ChatProto = sampleChat?.constructor?.prototype;
      if (ChatProto) {
        const origSendMsg = ChatProto.sendMessage;
        if (origSendMsg) {
          ChatProto.sendMessage = async function (msgData: any, options: any = {}, ...rest: any[]) {
            if (isForwardedModeActive()) {
              const score = getForwardedScore();
              if (msgData) {
                msgData.isForwarded = true;
                msgData.forwardingScore = score;
                msgData.multicast = true;
                if (!msgData.contextInfo) msgData.contextInfo = {};
                msgData.contextInfo.isForwarded = true;
                msgData.contextInfo.forwardingScore = score;
              }
              options = {
                ...options,
                isForwarded: true,
                forwardingScore: score,
                multicast: true,
                contextInfo: { ...(options.contextInfo || {}), isForwarded: true, forwardingScore: score },
              };
            }
            return origSendMsg.call(this, msgData, options, ...rest);
          };
        }
        hookedModules.push('ChatPrototype');
        diag('✅ HOOKED Chat.prototype.sendMessage');
      }
    } catch { /* ignore */ }
  }

  // C. Patch WAWebSendTextMsgChatAction
  try {
    const mod = req('WAWebSendTextMsgChatAction');
    if (mod) {
      if (typeof mod.sendTextMsgToChat === 'function' && !hookedModules.includes('sendTextMsgToChat')) {
        const orig = mod.sendTextMsgToChat;
        mod.sendTextMsgToChat = async function (chat: any, text: any, options: any = {}, ...rest: any[]) {
          if (isForwardedModeActive()) {
            const score = getForwardedScore();
            options = {
              ...options,
              isForwarded: true,
              forwardingScore: score,
              multicast: true,
              contextInfo: {
                ...(options.contextInfo || {}),
                isForwarded: true,
                forwardingScore: score,
              },
            };
            console.log(WFM_LOG_PREFIX, `✅ Injected forwarded (score=${score}) via sendTextMsgToChat`);
          }
          return orig.call(this, chat, text, options, ...rest);
        };
        hookedModules.push('sendTextMsgToChat');
        diag('✅ HOOKED sendTextMsgToChat');
      }

      if (typeof mod.createTextMsgData === 'function' && !hookedModules.includes('createTextMsgData')) {
        const orig = mod.createTextMsgData;
        mod.createTextMsgData = function (chat: any, text: any, options: any = {}, ...rest: any[]) {
          const active = isForwardedModeActive();
          if (active) {
            const score = getForwardedScore();
            options = {
              ...options,
              isForwarded: true,
              forwardingScore: score,
              multicast: true,
              contextInfo: {
                ...(options.contextInfo || {}),
                isForwarded: true,
                forwardingScore: score,
              },
            };
          }
          const msgData = orig.call(this, chat, text, options, ...rest);
          if (active && msgData) {
            const score = getForwardedScore();
            msgData.isForwarded = true;
            msgData.forwardingScore = score;
            msgData.multicast = true;
            if (!msgData.contextInfo) msgData.contextInfo = {};
            msgData.contextInfo.isForwarded = true;
            msgData.contextInfo.forwardingScore = score;
            msgData.extendedTextMessage = {
              text: text,
              contextInfo: {
                isForwarded: true,
                forwardingScore: score,
              },
            };
            console.log(WFM_LOG_PREFIX, `✅ Injected forwarded (score=${score}) into createTextMsgData`);
          }
          return msgData;
        };
        hookedModules.push('createTextMsgData');
        diag('✅ HOOKED createTextMsgData');
      }

      if (typeof mod.addAndSendTextMsg === 'function' && !hookedModules.includes('addAndSendTextMsg')) {
        const orig = mod.addAndSendTextMsg;
        mod.addAndSendTextMsg = async function (chat: any, text: any, options: any = {}, ...rest: any[]) {
          if (isForwardedModeActive()) {
            const score = getForwardedScore();
            options = {
              ...options,
              isForwarded: true,
              forwardingScore: score,
              multicast: true,
              contextInfo: {
                ...(options.contextInfo || {}),
                isForwarded: true,
                forwardingScore: score,
              },
            };
            console.log(WFM_LOG_PREFIX, `✅ Injected forwarded (score=${score}) via addAndSendTextMsg`);
          }
          return orig.call(this, chat, text, options, ...rest);
        };
        hookedModules.push('addAndSendTextMsg');
        diag('✅ HOOKED addAndSendTextMsg');
      }
    }
  } catch { /* ignore */ }

  // D. Patch WAWebSendMsgChatAction
  try {
    const mod = req('WAWebSendMsgChatAction');
    if (mod) {
      if (typeof mod.addAndSendMsgToChat === 'function' && !hookedModules.includes('addAndSendMsgToChat')) {
        const orig = mod.addAndSendMsgToChat;
        mod.addAndSendMsgToChat = async function (chat: any, msgData: any, ...rest: any[]) {
          if (isForwardedModeActive() && msgData) {
            const score = getForwardedScore();
            msgData.isForwarded = true;
            msgData.forwardingScore = score;
            msgData.multicast = true;
            if (!msgData.contextInfo) msgData.contextInfo = {};
            msgData.contextInfo.isForwarded = true;
            msgData.contextInfo.forwardingScore = score;
            msgData.extendedTextMessage = {
              text: msgData.body || '',
              contextInfo: {
                isForwarded: true,
                forwardingScore: score,
              },
            };
            console.log(WFM_LOG_PREFIX, `✅ Injected forwarded (score=${score}) via addAndSendMsgToChat`);
          }
          const res = await orig.call(this, chat, msgData, ...rest);
          const msgModel = Array.isArray(res) ? res[0] : res;
          if (msgModel && isForwardedModeActive()) {
            const score = getForwardedScore();
            try {
              if (typeof msgModel.set === 'function') {
                msgModel.set('isForwarded', true);
                msgModel.set('forwardingScore', score);
                msgModel.set('multicast', true);
              }
              msgModel.isForwarded = true;
              msgModel.forwardingScore = score;
              msgModel.multicast = true;
              if (typeof msgModel.trigger === 'function') {
                msgModel.trigger('change:isForwarded');
                msgModel.trigger('change');
              }
            } catch { /* ignore */ }
          }
          return res;
        };
        hookedModules.push('addAndSendMsgToChat');
        diag('✅ HOOKED addAndSendMsgToChat');
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// 5. Active Chat Resolution & In-Page Composer Clear
// ---------------------------------------------------------------------------

function clearInPageComposer(): void {
  try {
    const composer = document.querySelector<HTMLElement>(
      'div[data-lexical-editor="true"], footer div[contenteditable="true"], div[data-testid="conversation-compose-box-input"]'
    );
    if (!composer) return;

    composer.focus();

    // 1. Check Lexical Editor instance directly on DOM
    const editor = (composer as any).__lexicalEditor;
    if (editor && typeof editor.update === 'function') {
      try {
        editor.update(() => {
          const root = editor._editorState?._nodeMap?.get('root');
          if (root && typeof root.clear === 'function') {
            root.clear();
          }
        });
      } catch { /* ignore */ }
    }

    // 2. Browser native selection & execCommand
    document.execCommand('selectAll', false, undefined);
    document.execCommand('delete', false, undefined);
    document.execCommand('insertText', false, '');

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

    // 3. Fallback innerHTML reset if text persists
    if ((composer.innerText || composer.textContent || '').trim().length > 0) {
      composer.innerHTML = '<p class="selectable-text copyable-text"><br></p>';
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch { /* ignore */ }
}

function getActiveChat(): any {
  if (waModules.ChatCollection) {
    try {
      if (typeof waModules.ChatCollection.getActive === 'function') {
        const active = waModules.ChatCollection.getActive();
        if (active) return active;
      }
    } catch { /* ignore */ }

    try {
      if (waModules.ChatCollection.models && Array.isArray(waModules.ChatCollection.models)) {
        const active = waModules.ChatCollection.models.find((c: any) => c.active || c.isActive);
        if (active) return active;
      }
    } catch { /* ignore */ }
  }

  return findChatFromFiber();
}

function findChatFromFiber(): any {
  const elements = [
    document.querySelector('footer'),
    document.querySelector('div[contenteditable="true"]'),
    document.querySelector('#main'),
    document.querySelector('div[data-testid="conversation-panel-messages"]'),
  ].filter(Boolean);

  for (const el of elements) {
    if (!el) continue;
    const fiberKey = Object.keys(el).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (!fiberKey) continue;

    let fiber = (el as any)[fiberKey];
    let depth = 0;

    while (fiber && depth < 60) {
      depth++;
      const p = fiber.memoizedProps || fiber.pendingProps;
      if (p?.chat && (p.chat.id || p.chat.name)) {
        return p.chat;
      }
      fiber = fiber.return;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 6. Active Protocol Send Execution
// ---------------------------------------------------------------------------

async function sendForwardedMessage(
  text: string,
  forwardingScore: number
): Promise<{ success: boolean; error?: string }> {
  try {
    resolveModules();

    const chat = getActiveChat();
    if (!chat) {
      return { success: false, error: 'No active chat could be resolved' };
    }

    const score = Math.min(Math.max(forwardingScore, 1), 127);

    const forwardingOptions: any = {
      isForwarded: true,
      forwardingScore: score,
      multicast: true,
      contextInfo: {
        isForwarded: true,
        forwardingScore: score,
      },
      extendedTextMessage: {
        text: text,
        contextInfo: {
          isForwarded: true,
          forwardingScore: score,
        },
      },
      linkPreview: null,
      quotedMsg: null,
    };

    // Method A: createTextMsgData -> inject forwarded metadata -> addAndSendMsgToChat
    if (waModules.createTextMsgData && waModules.addAndSendMsgToChat) {
      try {
        const msgData = waModules.createTextMsgData(chat, text, forwardingOptions);
        if (msgData) {
          msgData.isForwarded = true;
          msgData.forwardingScore = score;
          msgData.multicast = true;
          if (!msgData.contextInfo) msgData.contextInfo = {};
          msgData.contextInfo.isForwarded = true;
          msgData.contextInfo.forwardingScore = score;
          msgData.extendedTextMessage = {
            text: text,
            contextInfo: {
              isForwarded: true,
              forwardingScore: score,
            },
          };

          const res = await waModules.addAndSendMsgToChat(chat, msgData);
          const msgModel = Array.isArray(res) ? res[0] : res;
          if (msgModel) {
            try {
              if (typeof msgModel.set === 'function') {
                msgModel.set('isForwarded', true);
                msgModel.set('forwardingScore', score);
                msgModel.set('multicast', true);
              }
              msgModel.isForwarded = true;
              msgModel.forwardingScore = score;
              msgModel.multicast = true;
              if (typeof msgModel.trigger === 'function') {
                msgModel.trigger('change:isForwarded');
                msgModel.trigger('change');
              }
            } catch { /* ignore */ }
          }

          clearInPageComposer();
          console.log(WFM_LOG_PREFIX, `✅ [Method A] Dispatched message with forwarded score=${score}`);
          return { success: true };
        }
      } catch (err: any) {
        diag(`Method A notice: ${err.message || String(err)}`);
      }
    }

    // Method B: addAndSendTextMsg
    if (waModules.addAndSendTextMsg) {
      try {
        await waModules.addAndSendTextMsg(chat, text, forwardingOptions);
        clearInPageComposer();
        console.log(WFM_LOG_PREFIX, `✅ [Method B] Dispatched message with forwarded score=${score}`);
        return { success: true };
      } catch (err: any) {
        diag(`Method B notice: ${err.message || String(err)}`);
      }
    }

    // Method C: sendTextMsgToChat
    if (waModules.sendTextMsgToChat) {
      try {
        await waModules.sendTextMsgToChat(chat, text, forwardingOptions);
        clearInPageComposer();
        console.log(WFM_LOG_PREFIX, `✅ [Method C] Dispatched message with forwarded score=${score}`);
        return { success: true };
      } catch (err: any) {
        diag(`Method C notice: ${err.message || String(err)}`);
      }
    }

    // Method D: chat.sendMessage
    if (typeof chat.sendMessage === 'function') {
      try {
        const msgData: any = {
          body: text,
          type: 'chat',
          ...forwardingOptions,
        };
        await chat.sendMessage(msgData, forwardingOptions);
        clearInPageComposer();
        console.log(WFM_LOG_PREFIX, `✅ [Method D] Dispatched message with forwarded score=${score}`);
        return { success: true };
      } catch (err: any) {
        diag(`Method D notice: ${err.message || String(err)}`);
      }
    }

    return { success: false, error: 'Protocol send functions unavailable' };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// 7. CustomEvent Bridge
// ---------------------------------------------------------------------------

document.addEventListener('wfm-command', ((e: CustomEvent) => {
  const { action, payload, requestId } = e.detail;

  switch (action) {
    case 'ping':
      if (!isReady) resolveModules();
      respond(requestId, {
        ready: isReady || !!waModules.sendTextMsgToChat,
        modules: hookedModules,
        forwardedEnabled: isForwardedModeActive(),
        forwardedScore: getForwardedScore(),
      });
      break;

    case 'sendForwarded':
      sendForwardedMessage(payload.text, payload.forwardingScore || 1).then((result) => {
        respond(requestId, result);
      });
      break;

    case 'setForwardedMode':
      (window as any).__FORWARDED_MODE_ENABLED = !!payload.enabled;
      (window as any).__FORWARDED_SCORE = payload.score || 1;
      try {
        document.documentElement.setAttribute('data-wfm-enabled', payload.enabled ? 'true' : 'false');
        document.documentElement.setAttribute('data-wfm-score', String(payload.score || 1));
      } catch { /* ignore */ }
      console.log(WFM_LOG_PREFIX, `Forwarded mode: ${payload.enabled ? 'ON' : 'OFF'}, score: ${payload.score || 1}`);
      respond(requestId, { success: true });
      break;

    case 'getStatus':
      if (!isReady) resolveModules();
      respond(requestId, {
        ready: isReady,
        modules: hookedModules,
        diagnostics,
        forwardedEnabled: isForwardedModeActive(),
        forwardedScore: getForwardedScore(),
        activeChat: getActiveChat()?.name || null,
      });
      break;

    default:
      respond(requestId, { error: `Unknown action: ${action}` });
  }
}) as EventListener);

function respond(requestId: string, data: any): void {
  document.dispatchEvent(
    new CustomEvent('wfm-response', {
      detail: { requestId, data },
    })
  );
}

// ---------------------------------------------------------------------------
// 8. Event-Driven & Polling Initialization
// ---------------------------------------------------------------------------

function initLoop(maxAttempts: number, intervalMs: number): void {
  let attempt = 0;

  function check(): void {
    attempt++;
    const ready = resolveModules();

    if (ready) {
      isReady = true;
      diag(`✅ Ready after ${attempt} attempt(s)! Hooked: [${hookedModules.join(', ')}]`);
      respond('init', { ready: true, modules: hookedModules });
    } else if (attempt < maxAttempts) {
      setTimeout(check, intervalMs);
    } else {
      diag('Module discovery standby: ready on interaction');
      respond('init', { ready: false, modules: [] });
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(check, 800);
  } else {
    window.addEventListener('load', () => setTimeout(check, 800));
  }

  window.addEventListener('focus', () => { if (!isReady) check(); }, { once: false, passive: true });
  window.addEventListener('click', () => { if (!isReady) check(); }, { once: false, passive: true });
  window.addEventListener('keydown', () => { if (!isReady) check(); }, { once: false, passive: true });
}

initLoop(20, 1000);

// Global debug exposure
(window as any).__wfm_modules = waModules;
(window as any).__wfm_diagnostics = diagnostics;
(window as any).__wfm_sendForwarded = sendForwardedMessage;
(window as any).__wfm_clearComposer = clearInPageComposer;
