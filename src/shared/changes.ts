import { z } from 'zod';
import { COMPUTED_PROPERTIES } from './computed';
import { elementMetaSchema, targetRefSchema } from './element-info';

/** The only CSS properties Tinker will ever write to a page. */
export const EDITABLE_PROPERTIES: ReadonlySet<string> = new Set(COMPUTED_PROPERTIES);
export const TEXT_PROPERTY = 'textContent';

export const changeSchema = z.object({
  id: z.string().min(1).max(64),
  target: targetRefSchema,
  kind: z.enum(['style', 'text']),
  property: z.string().min(1).max(100),
  before: z.string().max(5000),
  after: z.string().max(5000),
  token: z.string().max(120).optional(),
  origin: z.enum(['manual', 'ai']),
  createdAt: z.number(),
});

export const SESSION_VERSION = 1;
export const sessionSchema = z.object({
  version: z.literal(SESSION_VERSION),
  changes: z.array(changeSchema).max(2000),
  /** User opted in to re-applying these changes automatically when the page reloads. */
  reapply: z.boolean(),
  updatedAt: z.number(),
  /** Details of the changed elements by tinkerId, kept for exports. */
  elements: z.record(z.string(), elementMetaSchema).default({}),
});
export type Session = z.infer<typeof sessionSchema>;

export function parseSession(raw: unknown): Session | null {
  const parsed = sessionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Sessions are stored per page: origin + path, ignoring query and hash. */
export function pageKeyOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    const origin = parsed.origin === 'null' ? `${parsed.protocol}//` : parsed.origin;
    return `${origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}
export const sessionStorageKey = (pageKey: string) => `session:${pageKey}`;

const TINKER_ID = /^[a-z0-9-]{1,64}$/;
const MAX_VALUE_LENGTH = 500;

/**
 * A value that can sit inside `prop: <value> !important;` without ending the declaration,
 * the rule or the style element. `url(` is refused so an override can never make the page
 * fetch something. Whether the value is valid for the property is a separate check
 * (`CSS.supports`), made where a DOM is available.
 */
export function isSafeCssValue(value: string): boolean {
  if (!value.trim() || value.length > MAX_VALUE_LENGTH) return false;
  if (/[;{}<>\\!\n\r]/.test(value)) return false;
  if (/\/\*|\*\/|url\s*\(|expression\s*\(/i.test(value)) return false;
  return true;
}

interface OverrideChange {
  target: { tinkerId: string };
  kind: 'style' | 'text';
  property: string;
  after: string;
}

/** The text of the override stylesheet. Anything not provably safe is left out. */
export function buildOverrideCss(changes: readonly OverrideChange[]): string {
  const byTarget = new Map<string, string[]>();
  for (const change of changes) {
    if (change.kind !== 'style') continue;
    if (!TINKER_ID.test(change.target.tinkerId)) continue;
    if (!EDITABLE_PROPERTIES.has(change.property) || !isSafeCssValue(change.after)) continue;
    const declarations = byTarget.get(change.target.tinkerId) ?? [];
    declarations.push(`${change.property}: ${change.after.trim()} !important;`);
    byTarget.set(change.target.tinkerId, declarations);
  }
  let css = '';
  for (const [tinkerId, declarations] of byTarget) {
    css += `[data-tinker-id="${tinkerId}"] { ${declarations.join(' ')} }\n`;
  }
  return css;
}
