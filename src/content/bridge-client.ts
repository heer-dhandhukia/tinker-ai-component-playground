import type { ReactInfo } from '../shared/element-info';
import {
  BRIDGE_CHANNEL,
  PROBE_ATTRIBUTE,
  fromBridgeEnvelopeSchema,
  openEnvelope,
  type BridgeStatus,
  type FromBridgeMessage,
  type ToBridgeMessage,
} from '../shared/messages';

const HANDSHAKE_TIMEOUT_MS = 2000;
const INSPECT_TIMEOUT_MS = 500;

export interface BridgeClient {
  /** Pings the MAIN-world bridge; resolves unreachable on timeout. */
  handshake(): Promise<BridgeStatus>;
  /** Asks the bridge what React knows about an element. Null if not React, or no answer. */
  inspect(element: Element, detail: 'name' | 'full'): Promise<ReactInfo | null>;
  dispose(): void;
}

export function createBridgeClient(token: string): BridgeClient {
  let onPong: ((hookPresent: boolean) => void) | null = null;
  const pending = new Map<string, (react: ReactInfo | null) => void>();

  const post = (msg: ToBridgeMessage) =>
    window.postMessage({ channel: BRIDGE_CHANNEL, token, from: 'content', msg }, '*');

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    const msg = openEnvelope<FromBridgeMessage>(fromBridgeEnvelopeSchema, event.data, token);
    if (!msg) return;
    if (msg.type === 'bridge/pong') onPong?.(msg.hookPresent);
    else pending.get(msg.requestId)?.(msg.react);
  };
  window.addEventListener('message', onMessage);

  return {
    handshake() {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          onPong = null;
          resolve({ reachable: false, hookPresent: false });
        }, HANDSHAKE_TIMEOUT_MS);
        onPong = (hookPresent) => {
          clearTimeout(timer);
          onPong = null;
          resolve({ reachable: true, hookPresent });
        };
        post({ type: 'bridge/ping' });
      });
    },

    inspect(element, detail) {
      return new Promise((resolve) => {
        // The two worlds cannot share object references, so the element is marked with a
        // short-lived attribute that the bridge looks up.
        const requestId = crypto.randomUUID();
        const finish = (react: ReactInfo | null) => {
          clearTimeout(timer);
          pending.delete(requestId);
          if (element.getAttribute(PROBE_ATTRIBUTE) === requestId) element.removeAttribute(PROBE_ATTRIBUTE);
          resolve(react);
        };
        const timer = setTimeout(() => finish(null), INSPECT_TIMEOUT_MS);
        pending.set(requestId, finish);
        element.setAttribute(PROBE_ATTRIBUTE, requestId);
        post({ type: 'bridge/inspect', requestId, detail });
      });
    },

    dispose() {
      window.removeEventListener('message', onMessage);
      pending.forEach((finish) => finish(null));
    },
  };
}
