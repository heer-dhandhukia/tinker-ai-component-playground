// The JSON changeset contract, version 1. This mirrors `changesetSchema` in the extension
// (src/shared/export.ts); tests/schema.test.ts checks that both accept the same golden files.
import { z } from 'zod';

const name = z.string().max(200);
const sourceSchema = z.object({
  file: z.string().min(1).max(2000),
  line: z.number().int().positive().optional(),
  column: z.number().int().nonnegative().optional(),
});
const stylingMatchSchema = z.object({
  system: z.enum(['css-modules', 'scss-or-plain-css', 'styled-components', 'emotion', 'mui', 'tailwind', 'inline', 'unknown']),
  evidence: z.array(z.string()),
  confidence: z.number().optional(),
  classes: z.array(z.string().max(300)).max(200).optional(),
  moduleFile: z.string().max(300).optional(),
});
const elementSchema = z.object({
  tag: z.string().max(100),
  classes: z.array(z.string().max(300)).max(200),
  componentName: name.optional(),
  via: name.optional(),
  ownerChain: z.array(name).max(100).optional(),
  source: sourceSchema.optional(),
  reactBuild: z.enum(['development', 'production']).optional(),
  styling: z.array(stylingMatchSchema),
});
const changeSchema = z.object({
  kind: z.enum(['style', 'text']),
  property: z.string().min(1).max(100),
  before: z.string().max(5000),
  after: z.string().max(5000),
  token: z.string().max(120).optional(),
  origin: z.enum(['manual', 'ai']),
});

export const changesetSchema = z.object({
  version: z.literal(1),
  tool: z.literal('tinker'),
  exportedAt: z.string(),
  page: z.object({ url: z.string() }),
  elements: z
    .array(
      z.object({
        target: z.object({
          tinkerId: z.string().min(1).max(64),
          cssPath: z.string().max(4000),
          componentPath: z.array(name).max(100).optional(),
          textSnippet: z.string().max(80).optional(),
        }),
        element: elementSchema.nullable(),
        changes: z.array(changeSchema).max(200),
      }),
    )
    .max(500),
});

/** @typedef {z.infer<typeof changesetSchema>} Changeset */
/** @typedef {Changeset['elements'][number]} ChangesetElement */
/** @typedef {{ property: string, after: string }} StyleChange */

// The only properties the companion will write; the same set the extension can edit.
export const EDITABLE_PROPERTIES = new Set([
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'color', 'background-color', 'border-color',
  'border-width', 'border-style', 'border-radius',
  'box-shadow', 'opacity',
  'display', 'flex-direction', 'gap', 'align-items', 'justify-content', 'grid-template-columns',
]);

/** A value that cannot end the declaration, rule or string it is written into. */
export function isSafeValue(value) {
  if (!value.trim() || value.length > 500) return false;
  if (/[;{}<>\\!\n\r`$]/.test(value)) return false;
  return !/\/\*|\*\/|url\s*\(|expression\s*\(/i.test(value);
}
