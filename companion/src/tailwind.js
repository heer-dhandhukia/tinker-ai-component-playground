// Maps a CSS declaration to a Tailwind utility, and knows which existing utilities it replaces.
// Only utilities for the same property and with no variant prefix are replaced; shorthands such
// as `py-10` are left alone because the longhand utility (`pt-[48px]`) overrides them.

const SIZES = 'xs|sm|base|lg|xl|\\dxl';
const arbitrary = (value) => value.trim().replace(/\s+/g, '_');
const scaled = (prefix) => ({ utility: (value) => `${prefix}-[${arbitrary(value)}]`, replaces: new RegExp(`^-?${prefix}-`) });

const KEYWORDS = {
  display: { block: 'block', inline: 'inline', 'inline-block': 'inline-block', flex: 'flex', 'inline-flex': 'inline-flex', grid: 'grid', 'inline-grid': 'inline-grid', none: 'hidden', contents: 'contents' },
  'flex-direction': { row: 'flex-row', 'row-reverse': 'flex-row-reverse', column: 'flex-col', 'column-reverse': 'flex-col-reverse' },
  'align-items': { normal: 'items-normal', stretch: 'items-stretch', 'flex-start': 'items-start', center: 'items-center', 'flex-end': 'items-end', baseline: 'items-baseline' },
  'justify-content': { normal: 'justify-normal', 'flex-start': 'justify-start', center: 'justify-center', 'flex-end': 'justify-end', 'space-between': 'justify-between', 'space-around': 'justify-around', 'space-evenly': 'justify-evenly' },
  'border-style': { none: 'border-none', solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted', double: 'border-double' },
};
const keyword = (property) => ({
  utility: (value) => KEYWORDS[property][value.trim()] ?? null,
  replaces: new RegExp(`^(?:${Object.values(KEYWORDS[property]).join('|')})$`),
});

/** @type {Record<string, { utility: (value: string) => string | null, replaces: RegExp }>} */
const HANDLERS = {
  'margin-top': scaled('mt'), 'margin-right': scaled('mr'), 'margin-bottom': scaled('mb'), 'margin-left': scaled('ml'),
  'padding-top': scaled('pt'), 'padding-right': scaled('pr'), 'padding-bottom': scaled('pb'), 'padding-left': scaled('pl'),
  width: scaled('w'), height: scaled('h'),
  'min-width': scaled('min-w'), 'max-width': scaled('max-w'), 'min-height': scaled('min-h'), 'max-height': scaled('max-h'),
  'line-height': scaled('leading'), 'letter-spacing': scaled('tracking'), opacity: scaled('opacity'),
  gap: { utility: (value) => `gap-[${arbitrary(value)}]`, replaces: /^gap-(?![xy]-)/ },
  'grid-template-columns': scaled('grid-cols'),
  'font-size': { utility: (value) => `text-[length:${arbitrary(value)}]`, replaces: new RegExp(`^text-(?:${SIZES}|\\[length:.*\\]|\\[[\\d.].*\\])$`) },
  color: {
    utility: (value) => `text-[color:${arbitrary(value)}]`,
    replaces: new RegExp(`^text-(?!(?:${SIZES}|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$|\\[length:|\\[[\\d.])`),
  },
  'font-weight': { utility: (value) => `font-[${arbitrary(value)}]`, replaces: /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[.*\])$/ },
  'background-color': {
    utility: (value) => `bg-[${arbitrary(value)}]`,
    replaces: /^bg-(?!(?:fixed|local|scroll|no-repeat|repeat|repeat-x|repeat-y|cover|contain|auto|center|top|bottom|left|right|none)$|clip-|origin-|gradient-|linear-|radial-|conic-|blend-|\[url)/,
  },
  'border-color': {
    utility: (value) => `border-[color:${arbitrary(value)}]`,
    replaces: /^border-(?!\d|\[length:|[trblxyse]$|[trblxyse]-|(?:solid|dashed|dotted|double|none|hidden|collapse|separate)$|spacing)/,
  },
  'border-width': { utility: (value) => `border-[length:${arbitrary(value)}]`, replaces: /^border(?:-\d+|-\[length:.*\])?$/ },
  'border-radius': { utility: (value) => `rounded-[${arbitrary(value)}]`, replaces: new RegExp(`^rounded(?:-(?:none|${SIZES}|md|full|\\[.*\\]))?$`) },
  'box-shadow': { utility: (value) => `shadow-[${arbitrary(value)}]`, replaces: new RegExp(`^shadow(?:-(?:${SIZES}|md|none|inner|\\[.*\\]))?$`) },
  display: keyword('display'),
  'flex-direction': keyword('flex-direction'),
  'align-items': keyword('align-items'),
  'justify-content': keyword('justify-content'),
  'border-style': keyword('border-style'),
};

/** A colon before any `[` is a variant separator; inside brackets it is part of the value. */
const hasVariant = (name) => /^[^[]*:/.test(name);

/**
 * @param {string[]} classes
 * @param {{ property: string, after: string }[]} changes
 * @returns {{ classes: string[] } | { error: string }}
 */
export function applyTailwind(classes, changes) {
  let next = [...classes];
  for (const { property, after } of changes) {
    const handler = HANDLERS[property];
    const utility = handler?.utility(after);
    if (!handler || !utility) return { error: `no Tailwind utility is known for \`${property}: ${after}\`` };
    // Variant-prefixed utilities (hover:, md:) describe other states and are kept.
    next = next.filter((name) => hasVariant(name) || !handler.replaces.test(name));
    next.push(utility);
  }
  return { classes: next };
}
