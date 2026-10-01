import { useEffect } from 'react';
import { browser } from 'wxt/browser';
import { parseSession, sessionStorageKey, SESSION_VERSION, type Session } from '../shared/changes';
import {
  applyResultSchema,
  broadcastMessageSchema,
  contentEventSchema,
  selectionSnapshotSchema,
  tabStatusSchema,
  type ToBackgroundMessage,
  type ToContentMessage,
} from '../shared/messages';
import { detachedReceived, effectiveChanges, elementsFor, sessionResolved, showOriginalSet } from './changesSlice';
import { statusReceived, tabResolved } from './connectionSlice';
import { pickingChanged, selectionChanged, tokensReceived } from './selectionSlice';
import { useAppDispatch, useAppSelector } from './store';

/** `?tabId=` pins the panel to one tab (used when the panel is opened as a normal tab). */
function pinnedTabId(): number | null {
  const fromUrl = new URLSearchParams(location.search).get('tabId');
  return fromUrl !== null && /^\d+$/.test(fromUrl) ? Number(fromUrl) : null;
}

async function activeTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

export function sendToContent(tabId: number, message: ToContentMessage): Promise<unknown> {
  // Rejects if the content script is gone (page navigated); the status broadcast covers that.
  return browser.tabs.sendMessage(tabId, message).catch(() => undefined);
}

/** Binds the panel to its tab: connection status, picker/selection events, and the page's session. */
export function useTabConnection(): void {
  const dispatch = useAppDispatch();
  const tabId = useAppSelector((state) => state.connection.tabId);
  const connected = useAppSelector((state) => state.connection.status.state === 'connected');

  // Bind to a tab. The real side panel is shared by every tab in the window, so unless it is
  // pinned by URL it follows the active tab and starts afresh for each one.
  useEffect(() => {
    let cancelled = false;
    let bound: number | null = null;

    const bind = async (next: number | null) => {
      if (cancelled || next === null || next === bound) return;
      // Clears the selection, change list and AI state that belong to the previous tab.
      if (bound !== null) dispatch(statusReceived({ tabId: bound, status: { state: 'inactive' } }));
      bound = next;
      dispatch(tabResolved(next));
      const request: ToBackgroundMessage = { type: 'panel/getStatus', tabId: next };
      const raw: unknown = await browser.runtime.sendMessage(request);
      const parsed = tabStatusSchema.safeParse(raw);
      if (!cancelled && bound === next && parsed.success) dispatch(statusReceived({ tabId: next, status: parsed.data }));
    };

    const pinned = pinnedTabId();
    if (pinned !== null) {
      void bind(pinned);
      return () => {
        cancelled = true;
      };
    }

    void activeTabId().then(bind);
    const onActivated = (active: { tabId: number; windowId: number }) => {
      void browser.windows.getCurrent().then((current) => {
        if (current.id === active.windowId) void bind(active.tabId);
      });
    };
    browser.tabs.onActivated.addListener(onActivated);
    return () => {
      cancelled = true;
      browser.tabs.onActivated.removeListener(onActivated);
    };
  }, [dispatch]);

  useEffect(() => {
    if (tabId === null) return;
    const onMessage = (raw: unknown, sender: { tab?: { id?: number } }) => {
      if (sender.tab?.id === tabId) {
        // From the content script of the tab this panel is bound to.
        const event = contentEventSchema.safeParse(raw);
        if (!event.success) return;
        switch (event.data.type) {
          case 'picker/changed':
            dispatch(pickingChanged(event.data.picking));
            return;
          case 'selection/changed':
            dispatch(selectionChanged(event.data.info));
            return;
          case 'changes/status':
            dispatch(detachedReceived(event.data.detached));
            return;
        }
      }
      const broadcast = broadcastMessageSchema.safeParse(raw);
      // Broadcasts cover every tab; the reducers must only see this panel's tab.
      if (broadcast.success && broadcast.data.tabId === tabId) dispatch(statusReceived(broadcast.data));
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [dispatch, tabId]);

  // On (re)connect: read what the page already has, then look up its saved session.
  useEffect(() => {
    if (tabId === null || !connected) return;
    let cancelled = false;
    void (async () => {
      const snapshot = selectionSnapshotSchema.safeParse(await sendToContent(tabId, { type: 'selection/get' }));
      if (cancelled || !snapshot.success) return;
      const { picking, info, tokens, pageKey, changes, enabled, detached } = snapshot.data;
      dispatch(pickingChanged(picking));
      dispatch(selectionChanged(info));
      dispatch(tokensReceived(tokens));
      if (pageKey === null) return;

      const key = sessionStorageKey(pageKey);
      const saved = parseSession((await browser.storage.local.get(key))[key]);
      if (cancelled) return;
      dispatch(
        sessionResolved({
          pageKey,
          live: changes,
          saved: saved?.changes ?? [],
          reapply: saved?.reapply ?? false,
          elements: saved?.elements ?? {},
        }),
      );
      if (changes.length > 0) {
        dispatch(showOriginalSet(!enabled));
        dispatch(detachedReceived(detached));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, tabId, connected]);
}

/** Keeps the page and storage in step with the change list. */
export function useChangeSync(): void {
  const dispatch = useAppDispatch();
  const tabId = useAppSelector((state) => state.connection.tabId);
  const { present, preview, pending, showOriginal, hydrated, pageKey, reapply, elements } = useAppSelector((state) => state.changes);

  useEffect(() => {
    if (tabId === null || !hydrated) return;
    let cancelled = false;
    const changes = effectiveChanges(present, preview);
    void sendToContent(tabId, { type: 'changes/apply', changes, enabled: !showOriginal }).then((raw) => {
      const result = applyResultSchema.safeParse(raw);
      if (!cancelled && result.success) dispatch(detachedReceived(result.data.detached));
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, tabId, hydrated, present, preview, showOriginal]);

  useEffect(() => {
    if (!hydrated || pageKey === null) return;
    const key = sessionStorageKey(pageKey);
    // A saved session the user has not decided about yet stays in storage untouched.
    const changes = pending ?? present;
    if (changes.length === 0 && !reapply) {
      void browser.storage.local.remove(key);
      return;
    }
    const session: Session = {
      version: SESSION_VERSION,
      changes,
      reapply,
      updatedAt: Date.now(),
      elements: elementsFor(changes, elements),
    };
    void browser.storage.local.set({ [key]: session });
  }, [hydrated, pageKey, present, pending, reapply, elements]);
}
