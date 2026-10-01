import type { ReactInfo } from '../shared/element-info';
import {
  BRIDGE_BOOT_KEY,
  BRIDGE_CHANNEL,
  PROBE_ATTRIBUTE,
  openEnvelope,
  toBridgeEnvelopeSchema,
  type FromBridgeMessage,
  type ToBridgeMessage,
} from '../shared/messages';
import { describeFiber, findFiber } from './react';

/** Reads and removes the one-shot session token the background left for us. */
function takeToken(): string | null {
  const holder = window as unknown as Record<string, unknown>;
  const token = holder[BRIDGE_BOOT_KEY];
  delete holder[BRIDGE_BOOT_KEY];
  return typeof token === 'string' ? token : null;
}

function inspect(requestId: string, detail: 'name' | 'full'): ReactInfo | null {
  try {
    // requestId is schema-restricted to [a-z0-9-], so it is safe inside the selector.
    const element = document.querySelector(`[${PROBE_ATTRIBUTE}="${requestId}"]`);
    const fiber = element && findFiber(element);
    return fiber ? describeFiber(fiber, detail) : null;
  } catch {
    return null; // React internals changed shape, or a page object threw
  }
}

export function startBridge(): void {
  const token = takeToken();
  if (!token) return;

  const send = (msg: FromBridgeMessage) =>
    window.postMessage({ channel: BRIDGE_CHANNEL, token, from: 'bridge', msg }, '*');

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = openEnvelope<ToBridgeMessage>(toBridgeEnvelopeSchema, event.data, token);
    if (!msg) return;
    switch (msg.type) {
      case 'bridge/ping':
        send({ type: 'bridge/pong', hookPresent: '__REACT_DEVTOOLS_GLOBAL_HOOK__' in window });
        return;
      case 'bridge/inspect':
        send({ type: 'bridge/inspected', requestId: msg.requestId, react: inspect(msg.requestId, msg.detail) });
        return;
    }
  });
}
