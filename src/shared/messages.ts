import { z } from 'zod';
import { aiContextSchema, aiErrorSchema, aiVariantSchema, usageSchema } from './ai';
import { changeSchema } from './changes';
import { elementInfoSchema, reactInfoSchema } from './element-info';
import { designTokenSchema } from './tokens';

// ---- content script <-> MAIN-world bridge (window.postMessage) ----

export const BRIDGE_CHANNEL = 'tinker';
// Name of the one-shot window property the background uses to hand the session token to the bridge.
export const BRIDGE_BOOT_KEY = '__tinkerBoot';

// Attribute the content script puts on an element so the bridge can find the same node.
export const PROBE_ATTRIBUTE = 'data-tinker-probe';
const requestId = z.string().regex(/^[a-z0-9-]{1,64}$/);

export const toBridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bridge/ping') }),
  z.object({
    type: z.literal('bridge/inspect'),
    // Doubles as the probe attribute value, hence the strict character set.
    requestId,
    detail: z.enum(['name', 'full']),
  }),
]);
export type ToBridgeMessage = z.infer<typeof toBridgeMessageSchema>;

export const fromBridgeMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bridge/pong'), hookPresent: z.boolean() }),
  // react is null when the element is not rendered by React (or could not be found).
  z.object({ type: z.literal('bridge/inspected'), requestId, react: reactInfoSchema.nullable() }),
]);
export type FromBridgeMessage = z.infer<typeof fromBridgeMessageSchema>;

const envelopeBase = { channel: z.literal(BRIDGE_CHANNEL), token: z.string().min(16) };
export const toBridgeEnvelopeSchema = z.object({
  ...envelopeBase,
  from: z.literal('content'),
  msg: toBridgeMessageSchema,
});
export const fromBridgeEnvelopeSchema = z.object({
  ...envelopeBase,
  from: z.literal('bridge'),
  msg: fromBridgeMessageSchema,
});

/** Parses an untrusted postMessage payload; returns the inner message only if shape AND token match. */
export function openEnvelope<T>(
  schema: z.ZodType<{ token: string; msg: T }>,
  data: unknown,
  expectedToken: string,
): T | null {
  const parsed = schema.safeParse(data);
  if (!parsed.success || parsed.data.token !== expectedToken) return null;
  return parsed.data.msg;
}

// ---- chrome.runtime messaging ----

export const bridgeStatusSchema = z.object({
  reachable: z.boolean(),
  hookPresent: z.boolean(),
});
export type BridgeStatus = z.infer<typeof bridgeStatusSchema>;

export const tabStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('inactive') }),
  z.object({ state: z.literal('connected'), bridge: bridgeStatusSchema }),
  z.object({ state: z.literal('error'), message: z.string() }),
]);
export type TabStatus = z.infer<typeof tabStatusSchema>;

/** background or side panel -> content script */
export const toContentMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content/init'), token: z.string().min(16) }),
  z.object({ type: z.literal('content/ping') }),
  z.object({ type: z.literal('picker/start') }),
  z.object({ type: z.literal('picker/stop') }),
  z.object({ type: z.literal('selection/relative'), direction: z.enum(['parent', 'child']) }),
  z.object({ type: z.literal('selection/get') }),
  // The full change list; the content script makes the page match it.
  z.object({ type: z.literal('changes/apply'), changes: z.array(changeSchema).max(2000), enabled: z.boolean() }),
  // What the AI would be told about the selected element. Response: aiContextSchema or null.
  z.object({ type: z.literal('ai/context') }),
  // Hides the picker overlay while a screenshot is taken.
  z.object({ type: z.literal('overlay/set'), visible: z.boolean() }),
  // Switches all overrides on or off without changing the change list (before/after screenshots).
  z.object({ type: z.literal('changes/enabled'), enabled: z.boolean() }),
  // Viewport rects of tagged elements. Response: elementRectsSchema.
  z.object({ type: z.literal('export/rects'), tinkerIds: z.array(z.string().regex(/^[a-z0-9-]{1,64}$/)).max(200) }),
]);

const rectSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
export const elementRectsSchema = z.object({
  rects: z.record(z.string(), rectSchema.nullable()),
  devicePixelRatio: z.number().positive().max(8),
});

const detachedIds = z.array(z.string().max(64)).max(2000);
/** Response to changes/apply: tinkerIds whose element could not be found. */
export const applyResultSchema = z.object({ detached: detachedIds });
export type ToContentMessage = z.infer<typeof toContentMessageSchema>;

/** Response to content/ping: null until the bridge handshake has finished. */
export const contentPingResponseSchema = z.object({ bridge: bridgeStatusSchema.nullable() });

/** content script or extension page -> background */
export const toBackgroundMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content/ready'), bridge: bridgeStatusSchema }),
  z.object({ type: z.literal('panel/getStatus'), tabId: z.number().int().nonnegative() }),
  z.object({
    type: z.literal('ai/request'),
    tabId: z.number().int().nonnegative(),
    context: aiContextSchema,
    instruction: z.string().min(1).max(2000),
    count: z.union([z.literal(1), z.literal(3)]),
    screenshot: z.boolean(),
  }),
  // Where AI requests go (provider, host label, model). Response: aiDestinationSchema.
  z.object({ type: z.literal('ai/destination') }),
  z.object({
    type: z.literal('export/screenshots'),
    tabId: z.number().int().nonnegative(),
    tinkerIds: z.array(z.string().regex(/^[a-z0-9-]{1,64}$/)).min(1).max(50),
    /** Whether overrides should be on again when the captures are done. */
    restoreEnabled: z.boolean(),
  }),
]);

/** Response to export/screenshots: base64 PNGs per element, or why there are none. */
export const screenshotsResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    shots: z.array(z.object({ tinkerId: z.string(), before: z.string().nullable(), after: z.string().nullable() })),
  }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type ScreenshotsResult = z.infer<typeof screenshotsResultSchema>;

export const aiDestinationSchema = z.object({
  provider: z.enum(['anthropic', 'openai-compatible']),
  label: z.string().max(300),
  model: z.string().max(200),
});

/** Response to ai/request. Variants are schema-valid but their CSS values are not yet checked. */
export const aiResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    variants: z.array(aiVariantSchema),
    usage: usageSchema,
    model: z.string(),
    attempts: z.number(),
    /** 'attached', 'not-requested', or the reason the screenshot was left out. */
    screenshot: z.string(),
  }),
  z.object({ ok: z.literal(false), error: aiErrorSchema }),
]);
export type AiResult = z.infer<typeof aiResultSchema>;
export type ToBackgroundMessage = z.infer<typeof toBackgroundMessageSchema>;

/** background -> extension pages (broadcast) */
export const broadcastMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status/changed'),
    tabId: z.number().int().nonnegative(),
    status: tabStatusSchema,
  }),
]);
export type BroadcastMessage = z.infer<typeof broadcastMessageSchema>;

/** Response to selection/get, for a panel that opens after a selection was made. */
export const selectionSnapshotSchema = z.object({
  picking: z.boolean(),
  info: elementInfoSchema.nullable(),
  /** Storage key for this page's session; null for pages without a usable URL. */
  pageKey: z.string().max(4000).nullable(),
  tokens: z.array(designTokenSchema).max(500),
  /** Changes currently applied on the page (non-empty when the panel is reopened). */
  changes: z.array(changeSchema).max(2000),
  enabled: z.boolean(),
  detached: detachedIds,
});
export type SelectionSnapshot = z.infer<typeof selectionSnapshotSchema>;

/** content script -> extension pages (the panel filters on the sending tab). */
export const contentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('picker/changed'), picking: z.boolean() }),
  z.object({ type: z.literal('selection/changed'), info: elementInfoSchema.nullable() }),
  z.object({ type: z.literal('changes/status'), detached: detachedIds }),
]);
export type ContentEvent = z.infer<typeof contentEventSchema>;
