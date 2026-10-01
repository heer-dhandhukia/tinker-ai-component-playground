import { browser } from 'wxt/browser';
import { tabStatusSchema, type BroadcastMessage, type TabStatus } from '../shared/messages';

// storage.session survives service-worker restarts and is not readable from content scripts.
const key = (tabId: number) => `tab:${tabId}`;

export async function getTabStatus(tabId: number): Promise<TabStatus> {
  const stored = await browser.storage.session.get(key(tabId));
  const parsed = tabStatusSchema.safeParse(stored[key(tabId)]);
  return parsed.success ? parsed.data : { state: 'inactive' };
}

export async function setTabStatus(tabId: number, status: TabStatus): Promise<void> {
  await browser.storage.session.set({ [key(tabId)]: status });
  const message: BroadcastMessage = { type: 'status/changed', tabId, status };
  // Rejects when no extension page is listening; that is fine.
  browser.runtime.sendMessage(message).catch(() => {});
}

export async function clearTabStatus(tabId: number): Promise<void> {
  await browser.storage.session.remove(key(tabId));
}
