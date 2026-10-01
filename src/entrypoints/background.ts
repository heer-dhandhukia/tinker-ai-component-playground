import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { activate, reapplySavedSession } from '../background/activate';
import { aiDestination, handleAiRequest, overrideEndpointForE2E } from '../background/ai';
import { captureBeforeAfter } from '../background/screenshot';
import { clearTabStatus, getTabStatus, setTabStatus } from '../background/status';
import { toBackgroundMessageSchema } from '../shared/messages';

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    if (tab.id == null) return;
    // sidePanel.open() must be called synchronously inside the user gesture.
    void browser.sidePanel.open({ windowId: tab.windowId });
    void activate(tab.id);
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const parsed = toBackgroundMessageSchema.safeParse(raw);
    if (!parsed.success || sender.id !== browser.runtime.id) return;
    const message = parsed.data;
    const fromExtensionPage = sender.url?.startsWith(browser.runtime.getURL('/')) ?? false;

    switch (message.type) {
      case 'content/ready': {
        const tabId = sender.tab?.id;
        if (tabId == null || fromExtensionPage) return;
        void setTabStatus(tabId, { state: 'connected', bridge: message.bridge });
        return;
      }
      case 'panel/getStatus': {
        if (!fromExtensionPage) return;
        void getTabStatus(message.tabId).then(sendResponse);
        return true; // async response
      }
      case 'export/screenshots': {
        if (!fromExtensionPage) return;
        void captureBeforeAfter(message.tabId, message.tinkerIds, message.restoreEnabled).then(sendResponse);
        return true; // async response
      }
      case 'ai/destination': {
        if (!fromExtensionPage) return;
        void aiDestination().then(sendResponse);
        return true; // async response
      }
      case 'ai/request': {
        if (!fromExtensionPage) return;
        void handleAiRequest(message).then(sendResponse);
        return true; // async response
      }
    }
  });

  // A navigation or reload throws the injected scripts away.
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') void setTabStatus(tabId, { state: 'inactive' });
    // tab.url is only visible for origins the user granted (re-apply on reload opt-in).
    if (changeInfo.status === 'complete' && tab.url) void reapplySavedSession(tabId, tab.url);
  });
  browser.tabs.onRemoved.addListener((tabId) => void clearTabStatus(tabId));

  if (import.meta.env.MODE === 'e2e') {
    // Test-only hook: Playwright cannot click the toolbar action.
    (globalThis as { __tinkerE2E?: unknown }).__tinkerE2E = { activate, overrideEndpoint: overrideEndpointForE2E };
  }
});
