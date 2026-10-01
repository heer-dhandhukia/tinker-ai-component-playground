import { describe, expect, it } from 'vitest';
import {
  fromBridgeEnvelopeSchema,
  openEnvelope,
  tabStatusSchema,
  toBackgroundMessageSchema,
  toBridgeEnvelopeSchema,
} from '../../src/shared/messages';

const TOKEN = '0b1c2d3e-aaaa-bbbb-cccc-1234567890ab';
const pong = { type: 'bridge/pong', hookPresent: true };
const envelope = (over: Record<string, unknown> = {}) => ({
  channel: 'tinker',
  token: TOKEN,
  from: 'bridge',
  msg: pong,
  ...over,
});

describe('openEnvelope', () => {
  it('returns the message when shape and token match', () => {
    expect(openEnvelope(fromBridgeEnvelopeSchema, envelope(), TOKEN)).toEqual(pong);
  });

  it('rejects a wrong token', () => {
    expect(openEnvelope(fromBridgeEnvelopeSchema, envelope(), TOKEN.replace('0', '1'))).toBeNull();
  });

  it('rejects a message claiming the wrong direction', () => {
    expect(openEnvelope(fromBridgeEnvelopeSchema, envelope({ from: 'content' }), TOKEN)).toBeNull();
    expect(openEnvelope(toBridgeEnvelopeSchema, envelope(), TOKEN)).toBeNull();
  });

  it('rejects unknown message types and junk from the page', () => {
    const evil = envelope({ msg: { type: 'bridge/eval', code: 'alert(1)' } });
    expect(openEnvelope(fromBridgeEnvelopeSchema, evil, TOKEN)).toBeNull();
    for (const junk of [null, undefined, 'tinker', 42, {}, { channel: 'tinker' }]) {
      expect(openEnvelope(fromBridgeEnvelopeSchema, junk, TOKEN)).toBeNull();
    }
  });

  it('rejects a pong with a non-boolean payload', () => {
    const bad = envelope({ msg: { type: 'bridge/pong', hookPresent: 'yes' } });
    expect(openEnvelope(fromBridgeEnvelopeSchema, bad, TOKEN)).toBeNull();
  });
});

describe('runtime message schemas', () => {
  it('accepts the known background messages', () => {
    expect(
      toBackgroundMessageSchema.safeParse({ type: 'panel/getStatus', tabId: 7 }).success,
    ).toBe(true);
    expect(
      toBackgroundMessageSchema.safeParse({
        type: 'content/ready',
        bridge: { reachable: true, hookPresent: false },
      }).success,
    ).toBe(true);
  });

  it('rejects malformed background messages', () => {
    expect(toBackgroundMessageSchema.safeParse({ type: 'panel/getStatus' }).success).toBe(false);
    expect(
      toBackgroundMessageSchema.safeParse({ type: 'panel/getStatus', tabId: -1 }).success,
    ).toBe(false);
    expect(toBackgroundMessageSchema.safeParse({ type: 'content/steal-key' }).success).toBe(false);
  });

  it('parses every tab status variant', () => {
    expect(tabStatusSchema.safeParse({ state: 'inactive' }).success).toBe(true);
    expect(tabStatusSchema.safeParse({ state: 'error', message: 'nope' }).success).toBe(true);
    expect(tabStatusSchema.safeParse({ state: 'connected' }).success).toBe(false);
  });
});
