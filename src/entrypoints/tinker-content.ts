import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { createBridgeClient } from '../content/bridge-client';
import { createController } from '../content/controller';
import {
  toContentMessageSchema,
  type BridgeStatus,
  type ToBackgroundMessage,
} from '../shared/messages';

// The isolated-world content script. It is an unlisted script rather than a WXT content script
// on purpose: WXT content scripts (even with registration: 'runtime') add their `matches` to
// host_permissions, and we only ever inject through activeTab + chrome.scripting.
export default defineUnlistedScript(() => {
  const flag = globalThis as { __tinkerContentLoaded?: boolean };
  if (flag.__tinkerContentLoaded) return;
  flag.__tinkerContentLoaded = true;

  let bridgeStatus: BridgeStatus | null = null;
  const controller = createController();

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    // Only our own extension's contexts (background, side panel) can send with this id.
    if (sender.id !== browser.runtime.id) return;
    const parsed = toContentMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    const message = parsed.data;

    switch (message.type) {
      case 'content/ping':
        sendResponse({ bridge: bridgeStatus });
        return;
      case 'content/init': {
        sendResponse({ ok: true });
        const bridge = createBridgeClient(message.token);
        void bridge.handshake().then((status) => {
          bridgeStatus = status;
          controller.setBridge(status.reachable ? bridge : null);
          const ready: ToBackgroundMessage = { type: 'content/ready', bridge: status };
          void browser.runtime.sendMessage(ready);
        });
        return;
      }
      case 'picker/start':
        controller.startPicking();
        sendResponse({ ok: true });
        return;
      case 'picker/stop':
        controller.stopPicking();
        sendResponse({ ok: true });
        return;
      case 'selection/relative':
        controller.selectRelative(message.direction);
        sendResponse({ ok: true });
        return;
      case 'selection/get':
        sendResponse(controller.snapshot());
        return;
      case 'ai/context':
        sendResponse(controller.aiContext());
        return;
      case 'overlay/set':
        controller.setOverlayVisible(message.visible);
        sendResponse({ ok: true });
        return;
      case 'changes/enabled':
        void controller.setChangesEnabled(message.enabled).then(() => sendResponse({ ok: true }));
        return true; // async response
      case 'export/rects':
        sendResponse(controller.rectsOf(message.tinkerIds));
        return;
      case 'changes/apply':
        void controller.applyChanges(message.changes, message.enabled).then((detached) => sendResponse({ detached }));
        return true; // async response
    }
  });
});
