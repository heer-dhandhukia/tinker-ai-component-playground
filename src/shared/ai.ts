import { z } from 'zod';
import jsonShape from '../prompts/json-shape.md?raw';
import systemTemplate from '../prompts/system.md?raw';
import userTemplate from '../prompts/user.md?raw';
import { EDITABLE_PROPERTIES, isSafeCssValue } from './changes';
import { targetRefSchema } from './element-info';
import { designTokenSchema } from './tokens';
import type { Provider } from './settings';
import type { Variant } from './types';

export const HTML_CAP = 4000;
const MAX_TOKENS_IN_PROMPT = 150;
const TRUNCATION_MARK = '\n<!-- truncated -->';

// ---- what the content script gathers about the selected element ----

const computedRecord = z.record(z.string(), z.string());
export const aiContextSchema = z.object({
  target: targetRefSchema,
  tag: z.string().max(100),
  classes: z.array(z.string().max(300)).max(200),
  /** outerHTML, Tinker attributes removed, capped at HTML_CAP. */
  html: z.string().max(HTML_CAP + TRUNCATION_MARK.length),
  componentName: z.string().max(200).optional(),
  via: z.string().max(200).optional(),
  /** JSON summary of the component's props, capped. */
  props: z.string().max(700).optional(),
  computed: computedRecord,
  parent: z.object({ tag: z.string().max(100), computed: computedRecord }).nullable(),
  tokens: z.array(designTokenSchema).max(500),
  /** Viewport rect of the element in CSS pixels, for cropping a screenshot. */
  rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  devicePixelRatio: z.number().positive().max(8),
});
export type AiContext = z.infer<typeof aiContextSchema>;

export function prepareHtml(html: string, cap: number): string {
  const cleaned = html.replace(/\sdata-tinker-(?:id|probe)="[^"]*"/g, '');
  return cleaned.length > cap ? `${cleaned.slice(0, cap)}${TRUNCATION_MARK}` : cleaned;
}

// ---- the request ----

export interface AiRequest {
  system: string;
  user: string;
  /** How many variants the response must contain. */
  count: number;
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
const lines = (record: Record<string, string>) =>
  Object.entries(record)
    .filter(([, value]) => value !== '')
    .map(([property, value]) => `${property}: ${value}`)
    .join('\n') || '(none found)';

/**
 * The exact text sent to the model. The panel's "what will be sent" preview shows this output.
 * Anthropic enforces the response schema itself; other providers are told the shape in the prompt.
 */
export function buildAiRequest(context: AiContext, instruction: string, count: number, provider: Provider = 'anthropic'): AiRequest {
  const component = context.componentName
    ? ` rendered by ${context.componentName}${context.via ? ` (via ${context.via})` : ''}${context.props ? `, props ${context.props}` : ''}`
    : '';
  const tokens = context.tokens
    .filter((token) => token.category !== 'other')
    .slice(0, MAX_TOKENS_IN_PROMPT)
    .map((token) => `${token.name}: ${token.value}`)
    .join('\n');

  return {
    system: fill(provider === 'anthropic' ? systemTemplate : `${systemTemplate}${jsonShape}`, {
      count: String(count),
      variantWord: count === 1 ? 'variant' : 'variants',
      properties: [...EDITABLE_PROPERTIES].join(', '),
    }).trim(),
    user: fill(userTemplate, {
      instruction: instruction.trim(),
      tag: context.tag,
      componentLine: component,
      classes: context.classes.join(' ') || '(none)',
      computed: lines(context.computed),
      parentTag: context.parent?.tag ?? 'none',
      parentComputed: context.parent ? lines(context.parent.computed) : '(none found)',
      tokens: tokens || '(none found)',
      html: context.html,
    }).trim(),
    count,
  };
}

// ---- the response ----

export const aiVariantSchema = z.object({
  name: z.string().min(1).max(60),
  rationale: z.string().max(400),
  changes: z.array(z.object({ property: z.string().max(100), after: z.string().max(500) })).max(40),
});
export type AiVariant = z.infer<typeof aiVariantSchema>;

export const aiResponseSchema = (count: number) =>
  z.object({ variants: z.array(aiVariantSchema).length(count) });

/** JSON Schema for the API's structured output (same shape as aiResponseSchema). */
export const AI_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string' },
          changes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                property: { type: 'string', enum: [...EDITABLE_PROPERTIES] },
                after: { type: 'string' },
              },
              required: ['property', 'after'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'rationale', 'changes'],
        additionalProperties: false,
      },
    },
  },
  required: ['variants'],
  additionalProperties: false,
} as const;

export interface DroppedChange {
  variant: string;
  property: string;
  value: string;
  reason: string;
}

/**
 * Filters model output down to changes that are safe and valid to apply.
 * `supports` is CSS.supports, injected because it only exists where there is a DOM.
 */
export function validateAiVariants(
  variants: readonly AiVariant[],
  supports: (property: string, value: string) => boolean,
): { variants: AiVariant[]; dropped: DroppedChange[] } {
  const dropped: DroppedChange[] = [];
  const cleaned = variants.map((variant) => {
    const kept = new Map<string, string>();
    for (const { property, after } of variant.changes) {
      const reject = (reason: string) => dropped.push({ variant: variant.name, property, value: after, reason });
      if (!EDITABLE_PROPERTIES.has(property)) reject('property is not editable');
      else if (!isSafeCssValue(after)) reject('unsafe value');
      else if (!supports(property, after)) reject(`not a valid value for ${property}`);
      else {
        kept.delete(property); // a repeated property keeps its last value, in its last position
        kept.set(property, after.trim());
      }
    }
    return { ...variant, changes: [...kept].map(([property, after]) => ({ property, after })) };
  });
  return { variants: cleaned, dropped };
}

const TOKEN_VALUE = /^var\(--[\w-]+\)$/;

/** Binds validated model output to the selected element, as spec'd Variants. */
export function toVariants(variants: readonly AiVariant[], context: AiContext, makeId: () => string): Variant[] {
  return variants.map((variant) => ({
    id: makeId(),
    name: variant.name,
    rationale: variant.rationale,
    changes: variant.changes.map(({ property, after }) => ({
      target: context.target,
      kind: 'style' as const,
      property,
      before: context.computed[property] ?? '',
      after,
      ...(TOKEN_VALUE.test(after) ? { token: after } : {}),
      origin: 'ai' as const,
    })),
  }));
}

// ---- usage and cost ----

export const usageSchema = z.object({ inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative() });
export type Usage = z.infer<typeof usageSchema>;

/** USD per million tokens [input, output]. First-party API list prices, September 2026. */
const PRICES: Record<string, readonly [number, number]> = {
  'claude-fable-5-1': [10, 50],
  'claude-fable-5': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-4-5': [1, 5],
};

/** Estimated cost in USD, or null when the model's price is not known. */
export function estimateCost(model: string, usage: Usage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (usage.inputTokens * price[0] + usage.outputTokens * price[1]) / 1_000_000;
}

// ---- screenshot cropping ----

const MAX_IMAGE_SIDE = 1568;

/** Source rectangle (image pixels) for cropping a tab capture to the element, or null if off-screen. */
export function cropRegion(
  rect: AiContext['rect'],
  devicePixelRatio: number,
  imageWidth: number,
  imageHeight: number,
): { sx: number; sy: number; sw: number; sh: number; scale: number } | null {
  const sx = Math.max(0, Math.round(rect.x * devicePixelRatio));
  const sy = Math.max(0, Math.round(rect.y * devicePixelRatio));
  const sw = Math.min(imageWidth, Math.round((rect.x + rect.width) * devicePixelRatio)) - sx;
  const sh = Math.min(imageHeight, Math.round((rect.y + rect.height) * devicePixelRatio)) - sy;
  if (sw <= 0 || sh <= 0) return null;
  return { sx, sy, sw, sh, scale: Math.min(1, MAX_IMAGE_SIDE / Math.max(sw, sh)) };
}

// ---- errors ----

export const aiErrorSchema = z.object({
  kind: z.enum(['no-key', 'auth', 'rate-limit', 'timeout', 'network', 'api', 'invalid-response', 'refusal']),
  message: z.string(),
  retryAfterSeconds: z.number().optional(),
});
export type AiError = z.infer<typeof aiErrorSchema>;
