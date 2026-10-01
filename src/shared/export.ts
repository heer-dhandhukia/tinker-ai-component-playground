// Exports: a CSS override file, a change brief for a coding agent, and a JSON changeset.
// All three are pure functions of the change list plus what was known about each element.
import { z } from 'zod';
import { EDITABLE_PROPERTIES, changeSchema, isSafeCssValue } from './changes';
import { elementMetaSchema, targetRefSchema, type ElementMeta, type StylingMatch } from './element-info';
import type { Change, StylingSystem, TargetRef } from './types';

export interface ExportInput {
  pageUrl: string;
  changes: readonly Change[];
  /** Element details by tinkerId. Missing entries are exported with what the change itself knows. */
  elements: Readonly<Record<string, ElementMeta>>;
}

interface ElementGroup {
  target: TargetRef;
  meta: ElementMeta | undefined;
  changes: Change[];
}

/** Changes grouped per element, in the order each element was first changed. */
function groupByElement({ changes, elements }: ExportInput): ElementGroup[] {
  const groups = new Map<string, ElementGroup>();
  for (const change of changes) {
    const id = change.target.tinkerId;
    const group = groups.get(id) ?? { target: change.target, meta: elements[id], changes: [] };
    group.changes.push(change);
    groups.set(id, group);
  }
  return [...groups.values()];
}

const SYSTEM_LABELS: Record<StylingSystem, string> = {
  'css-modules': 'CSS Modules',
  'scss-or-plain-css': 'SCSS / plain CSS',
  'styled-components': 'styled-components',
  emotion: 'Emotion',
  mui: 'MUI',
  tailwind: 'Tailwind',
  inline: 'Inline style',
  unknown: 'Unknown',
};

const formatSource = (source: NonNullable<ElementMeta['source']>) =>
  source.line === undefined ? source.file : `${source.file}:${source.line}${source.column === undefined ? '' : `:${source.column}`}`;
const tagOf = (group: ElementGroup) => group.meta?.tag ?? group.target.cssPath.split(' > ').at(-1)?.replace(/[:#.].*$/, '') ?? 'element';
const componentOf = (group: ElementGroup) => group.meta?.componentName ?? group.target.componentPath?.at(-1);
const titleOf = (group: ElementGroup) => `${componentOf(group) ?? 'Element'} — \`<${tagOf(group)}>\``;

// ---- where an edit belongs, per styling system ----

/** Arbitrary-value Tailwind utility for one declaration, e.g. `pt-[48px]`. */
const TAILWIND_PREFIXES: Record<string, string> = {
  'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml',
  'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl',
  width: 'w', height: 'h', 'min-width': 'min-w', 'max-width': 'max-w', 'min-height': 'min-h', 'max-height': 'max-h',
  'font-size': 'text-[length:', 'font-weight': 'font', 'line-height': 'leading', 'letter-spacing': 'tracking',
  color: 'text-[color:', 'background-color': 'bg', 'border-color': 'border-[color:', 'border-width': 'border-[length:',
  'border-radius': 'rounded', 'box-shadow': 'shadow', opacity: 'opacity', gap: 'gap',
};
function tailwindUtility(property: string, value: string): string | null {
  const prefix = TAILWIND_PREFIXES[property];
  if (!prefix) return null;
  const arbitrary = value.trim().replace(/\s+/g, '_');
  return prefix.endsWith(':') ? `${prefix}${arbitrary}]` : `${prefix}-[${arbitrary}]`;
}

const CSS_MODULE_CLASS = /^([A-Za-z][A-Za-z0-9-]*)_([A-Za-z][A-Za-z0-9-]*)__[\w-]{4,}$/;
const VITE_MODULE_CLASS = /^_([A-Za-z][\w-]*)_[a-z0-9]{4,}_\d+$/;
const BEM_CLASS = /^([a-z0-9]+(?:-[a-z0-9]+)*)__([a-z0-9-]+?)(?:--([a-z0-9-]+))?$/i;
const MAX_CLASSES_PER_HINT = 3;

/** One line per place the agent should look, most specific first. */
export function editLocations(group: { meta: ElementMeta | undefined; changes: readonly Change[] }, tag: string): string[] {
  const meta = group.meta;
  if (!meta) return ['Element details were not recorded; locate the element by its DOM path and edit where it is styled.'];
  const where = meta.source ? `\`${formatSource(meta.source)}\`` : meta.componentName ? `the \`${meta.componentName}\` component` : 'the component that renders it';
  const classesOf = (match: StylingMatch) => (match.classes ?? []).slice(0, MAX_CLASSES_PER_HINT);

  return meta.styling.flatMap((match): string[] => {
    switch (match.system) {
      case 'css-modules':
        return classesOf(match).map((className) => {
          const named = CSS_MODULE_CLASS.exec(className);
          const local = named?.[2] ?? VITE_MODULE_CLASS.exec(className)?.[1];
          const file = match.moduleFile ?? (named ? `${named[1]}.module.(s)css` : "the component's `*.module.(s)css` file");
          return local
            ? `CSS Modules: class \`${className}\` → \`${file.replace(/`/g, '')}\` → \`.${local}\``
            : `CSS Modules: class \`${className}\` in \`${file.replace(/`/g, '')}\``;
        });
      case 'scss-or-plain-css':
        return classesOf(match).map((className) => {
          const bem = BEM_CLASS.exec(className);
          const nesting = bem?.[3]
            ? `\`&--${bem[3]}\` under \`&__${bem[2]}\` inside \`.${bem[1]}\``
            : `\`&__${bem?.[2]}\` inside \`.${bem?.[1]}\``;
          return bem
            ? `SCSS / plain CSS: the rule for \`.${className}\` (in SCSS often nested as ${nesting}); search the stylesheets for it`
            : `SCSS / plain CSS: the rule for \`.${className}\`; search the stylesheets for it`;
        });
      case 'styled-components':
        return [`styled-components: the ${meta.via ? `\`${meta.via}\`` : 'styled'} template literal that styles this \`<${tag}>\`, in ${where}`];
      case 'emotion':
        return [`Emotion: the \`css\` / \`styled\` call that styles this \`<${tag}>\`, in ${where}`];
      case 'mui': {
        const muiClasses = (match.classes ?? []).filter((className) => className.startsWith('Mui'));
        const slot = muiClasses.find((className) => meta.via && className.startsWith(`Mui${meta.via}-`)) ?? muiClasses[0];
        const component = meta.via ? `\`<${meta.via}>\`` : 'the MUI component';
        return [
          `MUI: the \`sx\` prop on ${component} in ${where}` +
            (slot ? `; if every ${meta.via ?? 'instance'} should change, a theme \`styleOverrides\` entry or \`styled()\` wrapper targeting \`.${slot}\`` : ''),
        ];
      }
      case 'tailwind': {
        const utilities = group.changes
          .filter((change) => change.kind === 'style')
          .map((change) => tailwindUtility(change.property, change.after))
          .filter((utility): utility is string => utility !== null);
        return [
          `Tailwind: the \`className\` on this \`<${tag}>\` in ${where}; replace the matching utilities` +
            (utilities.length ? ` (exact values as arbitrary utilities: ${utilities.map((utility) => `\`${utility}\``).join(', ')}; prefer the theme's named utilities where one matches)` : ''),
        ];
      }
      case 'inline':
        return [`Inline style: the \`style\` prop on this \`<${tag}>\` in ${where}`];
      case 'unknown':
        return [`No styling system was detected; find where this \`<${tag}>\` is styled, starting from ${where}`];
    }
  });
}

// ---- 1. CSS overrides ----

/** A selector for the override file: the element's own classes where they identify it, else its DOM path. */
function overrideSelector(group: ElementGroup): string {
  const identifying = group.meta?.styling.find(
    (match) => !['tailwind', 'inline', 'unknown'].includes(match.system) && (match.classes?.length ?? 0) > 0,
  );
  const classes = identifying?.classes?.slice(0, MAX_CLASSES_PER_HINT) ?? [];
  if (classes.length === 0) return group.target.cssPath;
  return classes.map((className) => `.${className.replace(/([^\w-])/g, '\\$1')}`).join('');
}

const cssComment = (text: string) => text.replace(/\*\//g, '* /');

export function exportCss(input: ExportInput): string {
  const blocks = groupByElement(input).map((group) => {
    const source = group.meta?.source ? ` — ${formatSource(group.meta.source)}` : '';
    const declarations = group.changes
      .filter((change) => change.kind === 'style' && EDITABLE_PROPERTIES.has(change.property) && isSafeCssValue(change.after))
      .map((change) => `  ${change.property}: ${change.after.trim()};`);
    const textNotes = group.changes
      .filter((change) => change.kind === 'text')
      .map((change) => `/* text: ${cssComment(JSON.stringify(change.before))} → ${cssComment(JSON.stringify(change.after))} (not expressible in CSS; edit the component) */`);
    return [
      `/* ${cssComment(`${componentOf(group) ?? 'Element'} <${tagOf(group)}>${source}`)} */`,
      ...(declarations.length ? [`${overrideSelector(group)} {`, ...declarations, '}'] : []),
      ...textNotes,
    ].join('\n');
  });

  const header = [
    `/* Tinker overrides for ${cssComment(input.pageUrl)}`,
    '   For reference and quick previews. The durable fix is to edit the source styles;',
    '   the change brief says where each one lives. */',
  ].join('\n');
  return `${[header, ...blocks].join('\n\n')}\n`;
}

// ---- 2. Change brief ----

const cell = (value: string) => `\`${value.replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\s+/g, ' ')}\``;

export function exportBrief(input: ExportInput): string {
  const groups = groupByElement(input);
  const sections = groups.map((group, index) => {
    const meta = group.meta;
    const tag = tagOf(group);
    const classAttribute = meta?.classes.length ? ` class="${meta.classes.join(' ')}"` : '';
    const owners = meta?.ownerChain?.length ? ` (owners: ${meta.ownerChain.join(' › ')})` : '';
    const component = componentOf(group);
    const styleChanges = group.changes.filter((change) => change.kind === 'style');
    const textChanges = group.changes.filter((change) => change.kind === 'text');
    const tokens = [...new Set(styleChanges.flatMap((change) => (change.token ? [change.token] : [])))];
    const systems = meta?.styling.map((match) =>
      match.confidence === undefined ? SYSTEM_LABELS[match.system] : `${SYSTEM_LABELS[match.system]} (${Math.round(match.confidence * 100)}% confidence)`,
    );

    return [
      `## ${index + 1}. ${titleOf(group)}`,
      '',
      `- **Component:** ${component ? `\`${component}\`${meta?.via ? ` (rendered through \`${meta.via}\`)` : ''}${owners}` : 'unknown (not a React element, or React info was unavailable)'}`,
      ...(meta?.reactBuild === 'production' && component
        ? [`  - This page runs a production build, so \`${component}\` is a minified name. Do not search the source for it; use the class names and DOM path instead.`]
        : []),
      `- **Source:** ${meta?.source ? `\`${formatSource(meta.source)}\`${meta.source.line === undefined ? ' (line unknown)' : ''}` : 'unknown'}`,
      `- **Element:** \`<${tag}${classAttribute}>\``,
      `- **DOM path:** \`${group.target.cssPath}\``,
      `- **Styling:** ${systems?.join(', ') ?? 'unknown'}`,
      '- **Where to edit:**',
      ...editLocations(group, tag).map((line) => `  - ${line}`),
      ...(styleChanges.length
        ? ['', '| Property | Before | After |', '| --- | --- | --- |', ...styleChanges.map((change) => `| ${cell(change.property)} | ${cell(change.before)} | ${cell(change.after)} |`)]
        : []),
      ...(textChanges.length
        ? ['', ...textChanges.map((change) => `- **Text:** change ${JSON.stringify(change.before)} to ${JSON.stringify(change.after)} (in the component's JSX or the data it renders)`)]
        : []),
      ...(tokens.length ? ['', `- **Design tokens used:** ${tokens.map((token) => `\`${token}\``).join(', ')} — keep these as \`var(...)\` references, do not inline their values`] : []),
    ].join('\n');
  });

  const intro = [
    '# Tinker change brief',
    '',
    `Page: ${input.pageUrl}`,
    `Elements changed: ${groups.length} · Changes: ${input.changes.length}`,
    '',
    'These changes were made live in the browser and need to be applied to the source code.',
    '',
    'Instructions:',
    '- Edit the existing source styles at the location given for each element. Do not add override rules, `!important`, or new inline styles to force the result.',
    '- "Before" is the computed value in the browser; the source may express it differently (shorthand, variable, utility class). Change the declaration that produces it.',
    '- If a location cannot be found from the hints, search for the class name or component name, and say so rather than guessing.',
    '- Keep the change scoped to the listed element. If the style is shared by other elements, ask whether to change this instance or all of them.',
  ].join('\n');
  return `${[intro, ...sections].join('\n\n')}\n`;
}

// ---- 3. JSON changeset ----

export const CHANGESET_VERSION = 1;

const changesetChangeSchema = changeSchema.pick({ kind: true, property: true, before: true, after: true, token: true, origin: true });
export const changesetSchema = z.object({
  version: z.literal(CHANGESET_VERSION),
  tool: z.literal('tinker'),
  exportedAt: z.string(),
  page: z.object({ url: z.string() }),
  elements: z.array(
    z.object({
      target: targetRefSchema,
      /** Null when element details were not recorded. */
      element: elementMetaSchema.nullable(),
      changes: z.array(changesetChangeSchema),
    }),
  ),
});
export type Changeset = z.infer<typeof changesetSchema>;

export function exportChangeset(input: ExportInput, exportedAt: string): Changeset {
  return {
    version: CHANGESET_VERSION,
    tool: 'tinker',
    exportedAt,
    page: { url: input.pageUrl },
    elements: groupByElement(input).map((group) => ({
      target: group.target,
      element: group.meta ?? null,
      changes: group.changes.map((change) => ({
        kind: change.kind,
        property: change.property,
        before: change.before,
        after: change.after,
        ...(change.token ? { token: change.token } : {}),
        origin: change.origin,
      })),
    })),
  };
}

export const serializeChangeset = (changeset: Changeset) => `${JSON.stringify(changeset, null, 2)}\n`;

/** Rebuilds the export input from a changeset (what the Phase 5 companion will start from). */
export function inputFromChangeset(changeset: Changeset): ExportInput {
  const elements: Record<string, ElementMeta> = {};
  const changes: Change[] = [];
  for (const entry of changeset.elements) {
    if (entry.element) elements[entry.target.tinkerId] = entry.element;
    entry.changes.forEach((change, index) => {
      changes.push({ ...change, id: `${entry.target.tinkerId}-${index}`, target: entry.target, createdAt: 0 });
    });
  }
  return { pageUrl: changeset.page.url, changes, elements };
}

