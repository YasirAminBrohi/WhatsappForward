# WhatsApp Web: Forwarded Text Mode

A lightweight, privacy-focused Chromium browser extension (Manifest V3, TypeScript) that allows users to type normal text messages while manipulating WhatsApp Web's internal pipeline so that **the backend and recipient clients treat the message as genuinely forwarded** (with protocol-level `isForwarded: true` and configurable `forwardingScore`).

---

## How It Works

When **Forwarded Mode** is **ON**:

1. **Protocol-Level Mode (Default & Recommended)**:
   - You type your message normally in WhatsApp Web's composer.
   - When you press **Enter** or click **Send**, the extension intercepts the send action.
   - It interfaces with WhatsApp Web's internal Store and Protobuf modules in the page context (`waInject.ts`).
   - The message payload is constructed with `isForwarded: true` and the chosen `forwardingScore` (e.g. `1` for *"Forwarded"*, `4+` for *"Forwarded many times"*).
   - The message is encrypted and transmitted via WhatsApp's native Signal Protocol pipeline.
   - **On the Recipient's Screen:** The recipient's native WhatsApp app (Android, iOS, Web, Desktop) displays the genuine WhatsApp **Forwarded** badge above the message.

2. **Automatic Markdown Fallback Mode**:
   - If WhatsApp Web updates break internal module hooks or if protocol mode is toggled off in settings, the extension falls back to structured blockquote/markdown formatting.

---

## Configuration Options (in Extension Popup)

- **Forwarded Mode Toggle**: Turn forwarded dispatch ON or OFF.
- **Protocol-Level Mode**: Use WhatsApp Web internal module injection vs. Markdown fallback.
- **Forwarding Score Slider**:
  - `1`: Normal *"Forwarded"* badge.
  - `4`: *"Forwarded many times"* badge with double forward arrow.
- **Fallback Formatting Styles**:
  - *Blockquote Style* (`> ↪ _Forwarded_ ...`)
  - *Divider Line Style*
  - *Clean Header Style*
- **In-Page Quick Toggle**: Floating/docked pill in WhatsApp Web header for 1-click toggling.
- **Developer Debug Mode**: Diagnostics and module discovery logs in DevTools console.

---

## Architecture Overview

```
[User Input in Composer]
       │
       ▼
[sendPlugin.ts] (Capture-phase Send/Enter Interception)
       │
       ├──► Protocol Mode: [moduleLoader.ts] ──► CustomEvent Bridge ──► [waInject.ts (Page Context)]
       │                                                                      │
       │                                                                      ▼
       │                                                       [WhatsApp Webpack Store/Msg Modules]
       │                                                       (Sets isForwarded=true, forwardingScore)
       │                                                                      │
       │                                                                      ▼
       │                                                       [WhatsApp Encryption & WebSocket]
       │
       └──► Fallback Mode: Markdown Text Formatting Fallback
```

---

## Installation & Reload Instructions

1. Open `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select `k:\WhatsappForwarded\dist` (or click **🔄 Reload** if already loaded).
4. Navigate to [web.whatsapp.com](https://web.whatsapp.com/) and refresh (`F5`).
5. Open the extension popup or click the in-page pill to turn **Forwarded Mode: ON**.
6. Type a message and send.

---

## Privacy & Security

- **100% Client-Side**: Operates entirely locally inside your browser session.
- **Official End-to-End Encryption**: Outgoing messages travel through WhatsApp's official encryption pipeline.
- **Zero Telemetry**: No third-party servers, tracking, or telemetry.
