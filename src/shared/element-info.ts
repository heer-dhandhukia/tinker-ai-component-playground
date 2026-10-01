import { z } from 'zod';

export const STYLING_SYSTEMS = [
  'css-modules',
  'scss-or-plain-css',
  'styled-components',
  'emotion',
  'mui',
  'tailwind',
  'inline',
  'unknown',
] as const;

const name = z.string().max(200);

export const targetRefSchema = z.object({
  tinkerId: z.string().min(1).max(64),
  cssPath: z.string().max(4000),
  componentPath: z.array(name).max(100).optional(),
  textSnippet: z.string().max(80).optional(),
});

export const sourceSchema = z.object({
  file: z.string().min(1).max(2000),
  // Optional: React 19 only tells us the file reliably (see DECISIONS.md).
  line: z.number().int().positive().optional(),
  column: z.number().int().nonnegative().optional(),
});

/** What the MAIN-world bridge reports about one element. Untrusted until parsed. */
export const reactInfoSchema = z.object({
  /** Nearest component written in app code. */
  componentName: name.optional(),
  /** Library component the app placed between `componentName` and the element, e.g. MUI `Button`. */
  via: name.optional(),
  /** App-code components, outermost first, ending with `componentName`. */
  ownerChain: z.array(name).max(100),
  props: z.record(z.string(), z.unknown()).optional(),
  source: sourceSchema.optional(),
  build: z.enum(['development', 'production']),
});
export type ReactInfo = z.infer<typeof reactInfoSchema>;

export const stylingMatchSchema = z.object({
  system: z.enum(STYLING_SYSTEMS),
  evidence: z.array(z.string()),
  /** Only set for heuristic matches (Tailwind). */
  confidence: z.number().min(0).max(1).optional(),
  /** The element's classes that belong to this system. */
  classes: z.array(z.string().max(300)).max(200).optional(),
  /** CSS Modules only: the stylesheet file the class was found in, when known. */
  moduleFile: z.string().max(300).optional(),
});
export type StylingMatch = z.infer<typeof stylingMatchSchema>;

export const elementInfoSchema = z.object({
  target: targetRefSchema,
  tag: z.string(),
  classes: z.array(z.string()),
  componentName: name.optional(),
  via: name.optional(),
  ownerChain: z.array(name).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  source: sourceSchema.optional(),
  /** Absent when the page is not a React app (or the bridge is unreachable). */
  reactBuild: z.enum(['development', 'production']).optional(),
  styling: z.array(stylingMatchSchema),
  computed: z.record(z.string(), z.string()),
  /** The element's text, present only when it has no child elements (so it can be edited). */
  text: z.string().max(2000).optional(),
  hasParent: z.boolean(),
  hasChild: z.boolean(),
});

/** What an export needs to know about a changed element, captured when it is edited. */
export const elementMetaSchema = z.object({
  tag: z.string().max(100),
  classes: z.array(z.string().max(300)).max(200),
  componentName: name.optional(),
  via: name.optional(),
  ownerChain: z.array(name).max(100).optional(),
  source: sourceSchema.optional(),
  /** 'production' means component names are whatever the minifier left. */
  reactBuild: z.enum(['development', 'production']).optional(),
  styling: z.array(stylingMatchSchema),
});
export type ElementMeta = z.infer<typeof elementMetaSchema>;
