import type { StylingMatch } from '../shared/element-info';

/** Facts gathered from the page's stylesheets (see style-hints.ts). Detection itself stays pure. */
export interface StyleHints {
  /** `<style data-styled>` present, and the class names its rules define. */
  styledComponents: { present: boolean; classes: string[] };
  /** `<style data-emotion>` present, and the class names its rules define. */
  emotion: { present: boolean; classes: string[] };
  /** class name -> stylesheet file, for classes defined in `*.module.(css|scss|…)` sheets. */
  cssModuleFiles: Record<string, string>;
}

export interface DetectionInput {
  classes: string[];
  /** Property names set by the element's `style` attribute. */
  inlineStyleProps: string[];
  hints: StyleHints;
}

// Card_title__x7Ab2 (CRA, Next, css-loader) and _title_1a2b3_7 (Vite's default).
const CSS_MODULE_PATTERNS = [
  /^[A-Za-z][A-Za-z0-9-]*_[A-Za-z][A-Za-z0-9-]*__[\w-]{4,}$/,
  /^_[A-Za-z][\w-]*_[a-z0-9]{4,}_\d+$/,
];
const STYLED_COMPONENT_ID = /^sc-[A-Za-z0-9]+$/;
const EMOTION_CLASS = /^css-[a-z0-9]+(-[\w-]+)?$/;
const MUI_CLASS = /^Mui[A-Z][A-Za-z0-9]*-[A-Za-z0-9]+$/;

// ---- Tailwind ----

const TW_COLOURS =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const TW_COLOUR_PREFIXES =
  'bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|accent|caret|shadow|placeholder';
const TW_SCALED_PREFIXES =
  'p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|max-w|min-h|max-h|inset|inset-x|inset-y|top|right|bottom|left|z|basis|order|col-span|row-span|grid-cols|grid-rows|opacity|duration|delay|scale|rotate|translate-x|translate-y|border|border-[trblxy]|ring|outline|line-clamp';
const TW_SCALE_VALUE = '\\d+(?:\\.5)?|\\d+\\/\\d+|px|auto|full|screen|min|max|fit|none';
const TW_SIZE_VALUE = 'xs|sm|base|md|lg|xl|[2-9]xl|none|full';

const TW_COLOUR_SCALE = new RegExp(
  `^(?:${TW_COLOUR_PREFIXES})-(?:${TW_COLOURS})-(?:50|[1-9]00|950)(?:\\/\\d+)?$`,
);
const TW_STRONG = [
  new RegExp(`^(?:${TW_SCALED_PREFIXES})-(?:${TW_SCALE_VALUE})$`),
  new RegExp(`^(?:${TW_COLOUR_PREFIXES})-(?:white|black|transparent|current|inherit)(?:\\/\\d+)?$`),
  new RegExp(`^(?:text|rounded(?:-[trblse]{1,2})?|shadow|blur|max-w|font)-(?:${TW_SIZE_VALUE})$`),
  /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|sans|serif|mono)$/,
  /^text-(?:left|center|right|justify)$/,
  /^(?:leading|tracking)-(?:none|tight|tighter|snug|normal|relaxed|loose|wide|wider|widest|\d+)$/,
];
const TW_ARBITRARY = /^[a-z][a-z-]*-\[.+\]$/;
// Common words that are Tailwind utilities but prove nothing on their own.
const TW_WEAK = [
  /^(?:flex|inline-flex|grid|inline-grid|block|inline-block|inline|hidden|contents|relative|absolute|fixed|sticky|static|underline|no-underline|uppercase|lowercase|capitalize|italic|truncate|sr-only|antialiased|rounded|shadow|border|transition)$/,
  /^(?:items|justify|self|content|place|flex|grid|overflow|cursor|object|whitespace|transition|ease|pointer-events|select|align|break|list|decoration|bg|aspect)-[a-z0-9-]+$/,
];

interface TailwindClass {
  strong: boolean;
  specific: boolean; // could hardly be anything but Tailwind
  weak: boolean;
}

function classifyTailwind(className: string): TailwindClass {
  // Split variants on ":" outside brackets, e.g. "md:hover:bg-[color:red]".
  const parts = className.split(/:(?![^[]*\])/);
  const hasVariant = parts.length > 1;
  const utility = (parts.at(-1) ?? '').replace(/^!/, '').replace(/^-/, '');
  const specific = TW_ARBITRARY.test(utility) || TW_COLOUR_SCALE.test(utility);
  const strong = specific || TW_STRONG.some((pattern) => pattern.test(utility));
  return {
    strong,
    specific: strong && (specific || hasVariant),
    weak: !strong && TW_WEAK.some((pattern) => pattern.test(utility)),
  };
}

const TW_BASE_CONFIDENCE = [0, 0.4, 0.6, 0.8];
const TW_MIN_CONFIDENCE = 0.5;

function tailwindConfidence(strongCount: number, anySpecific: boolean): number {
  const base = TW_BASE_CONFIDENCE[strongCount] ?? 0.9;
  return Math.min(0.95, Math.round((base + (anySpecific ? 0.1 : 0)) * 100) / 100);
}

// ---- detection ----

/**
 * Works out which styling systems produced an element's styles, with the evidence for each.
 * Every class is claimed by at most one system; whatever is left over is plain CSS/SCSS.
 */
export function detectStyling({ classes, inlineStyleProps, hints }: DetectionInput): StylingMatch[] {
  const matches: StylingMatch[] = [];
  const unclaimed = new Set(classes);
  const claim = (predicate: (className: string) => string | null) => {
    const evidence: string[] = [];
    const claimed: string[] = [];
    for (const className of [...unclaimed]) {
      const reason = predicate(className);
      if (reason !== null) {
        evidence.push(reason);
        claimed.push(className);
        unclaimed.delete(className);
      }
    }
    return { evidence, classes: claimed };
  };

  const cssModules = claim((className) => {
    const file = hints.cssModuleFiles[className];
    if (file) return `class "${className}" (defined in ${file})`;
    return CSS_MODULE_PATTERNS.some((pattern) => pattern.test(className))
      ? `class "${className}" matches the CSS Modules naming pattern`
      : null;
  });
  if (cssModules.classes.length) {
    const moduleFile = cssModules.classes.map((className) => hints.cssModuleFiles[className]).find(Boolean);
    matches.push({ system: 'css-modules', ...cssModules, ...(moduleFile ? { moduleFile } : {}) });
  }

  if (hints.styledComponents.present) {
    const generated = new Set(hints.styledComponents.classes);
    const styled = claim((className) => {
      if (generated.has(className)) return `class "${className}" (defined in <style data-styled>)`;
      return STYLED_COMPONENT_ID.test(className) ? `class "${className}" (component id)` : null;
    });
    if (styled.classes.length) matches.push({ system: 'styled-components', ...styled });
  }

  const emotionClasses = new Set(hints.emotion.classes);
  const isEmotionClass = (className: string) =>
    hints.emotion.present && (emotionClasses.has(className) || EMOTION_CLASS.test(className));

  const muiNames = [...unclaimed].filter((className) => MUI_CLASS.test(className));
  if (muiNames.length) {
    muiNames.forEach((className) => unclaimed.delete(className));
    const engine = claim((className) =>
      isEmotionClass(className) ? `class "${className}" (Emotion, MUI's styling engine)` : null,
    );
    matches.push({
      system: 'mui',
      evidence: [`classes ${muiNames.join(', ')}`, ...engine.evidence],
      classes: [...muiNames, ...engine.classes],
    });
  }

  const emotion = claim((className) =>
    isEmotionClass(className) ? `class "${className}" (defined in <style data-emotion>)` : null,
  );
  if (emotion.classes.length) matches.push({ system: 'emotion', ...emotion });

  const tailwind = [...unclaimed].map((className) => ({ className, ...classifyTailwind(className) }));
  const strong = tailwind.filter((entry) => entry.strong);
  const confidence = tailwindConfidence(strong.length, strong.some((entry) => entry.specific));
  if (confidence >= TW_MIN_CONFIDENCE) {
    const utilities = tailwind.filter((entry) => entry.strong || entry.weak);
    utilities.forEach((entry) => unclaimed.delete(entry.className));
    matches.push({
      system: 'tailwind',
      evidence: [`utility classes: ${utilities.map((entry) => entry.className).join(', ')}`],
      confidence,
      classes: utilities.map((entry) => entry.className),
    });
  }

  if (inlineStyleProps.length) {
    matches.push({ system: 'inline', evidence: [`style attribute sets ${inlineStyleProps.join(', ')}`] });
  }

  if (unclaimed.size) {
    matches.push({
      system: 'scss-or-plain-css',
      evidence: [...unclaimed].map((className) => `class "${className}"`),
      classes: [...unclaimed],
    });
  }

  if (!matches.length) {
    matches.push({ system: 'unknown', evidence: ['no classes and no style attribute'] });
  }
  return matches;
}
