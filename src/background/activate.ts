import { browser } from 'wxt/browser';
import { pageKeyOf, parseSession, sessionStorageKey } from '../shared/changes';
import {
  BRIDGE_BOOT_KEY,
  contentPingResponseSchema,
  type TabStatus,
  type ToContentMessage,
} from '../shared/messages';
import { setTabStatus } from './status';

async function pingContent(tabId: number): Promise<TabStatus | null> {
  try {
    const message: ToContentMessage = { type: 'content/ping' };
    const raw: unknown = await browser.tabs.sendMessage(tabId, message);
    const parsed = contentPingResponseSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.bridge) return null;
    return { state: 'connected', bridge: parsed.data.bridge };
  } catch {
    return null; // no content script in this tab yet
  }
}

/**
 * Injects the content script and the MAIN-world bridge into a tab the user activated us on.
 * Idempotent: a tab that already has a live content script is left alone.
 */
export async function activate(tabId: number): Promise<void> {
  const existing = await pingContent(tabId);
  if (existing) {
    await setTabStatus(tabId, existing);
    return;
  }
  try {
    const token = crypto.randomUUID();
    const target = { tabId };
    await browser.scripting.executeScript({ target, files: ['/tinker-content.js'] });
    await browser.scripting.executeScript({
      target,
      world: 'MAIN',
      func: (key: string, value: string) => {
        Object.defineProperty(window, key, { value, configurable: true, enumerable: false });
      },
      args: [BRIDGE_BOOT_KEY, token],
    });
    await browser.scripting.executeScript({ target, world: 'MAIN', files: ['/bridge.js'] });
    const init: ToContentMessage = { type: 'content/init', token };
    await browser.tabs.sendMessage(tabId, init);
    // The content script reports content/ready once the bridge handshake finishes.
  } catch (err) {
    await setTabStatus(tabId, {
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * "Re-apply on reload": if the user opted in for this page and granted access to its origin,
 * activate on the freshly loaded tab and put the saved changes back.
 */
export async function reapplySavedSession(tabId: number, url: string): Promise<void> {
  const pageKey = pageKeyOf(url);
  if (!pageKey || !/^https?:/.test(pageKey)) return;
  const key = sessionStorageKey(pageKey);
  const session = parseSession((await browser.storage.local.get(key))[key]);
  if (!session?.reapply || session.changes.length === 0) return;
  const granted = await browser.permissions.contains({ origins: [`${new URL(pageKey).origin}/*`] });
  if (!granted) return;

  await activate(tabId);
  const apply: ToContentMessage = { type: 'changes/apply', changes: session.changes, enabled: true };
  await browser.tabs.sendMessage(tabId, apply).catch(() => undefined);
}
