import type { StyleHints } from './detection';

const MODULE_FILE = /([^/\\]+\.module\.(?:css|scss|sass|less|styl))(?:\?|$)/;

function classNamesIn(sheet: CSSStyleSheet | null): string[] {
  const names = new Set<string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        for (const match of rule.selectorText.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) names.add(match[1]!);
      } else if ('cssRules' in rule) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  try {
    if (sheet) visit(sheet.cssRules);
  } catch {
    // Cross-origin stylesheet: rules are not readable. No hints from this one.
  }
  return [...names];
}

function sheetsOf(doc: Document, selector: string): string[] {
  return [...doc.querySelectorAll<HTMLStyleElement>(selector)].flatMap((tag) => classNamesIn(tag.sheet));
}

/** Reads the stylesheet facts detection needs. DOM access lives here; detection stays pure. */
export function collectStyleHints(doc: Document): StyleHints {
  const cssModuleFiles: Record<string, string> = {};
  for (const sheet of doc.styleSheets) {
    const owner = sheet.ownerNode instanceof Element ? sheet.ownerNode : null;
    // Vite dev tags its <style> elements with the source file; built sheets have an href.
    const origin = owner?.getAttribute('data-vite-dev-id') ?? sheet.href ?? '';
    const file = MODULE_FILE.exec(origin)?.[1];
    if (!file) continue;
    for (const className of classNamesIn(sheet)) cssModuleFiles[className] = file;
  }

  return {
    styledComponents: {
      present: doc.querySelector('style[data-styled]') !== null,
      classes: sheetsOf(doc, 'style[data-styled]'),
    },
    emotion: {
      present: doc.querySelector('style[data-emotion]') !== null,
      classes: sheetsOf(doc, 'style[data-emotion]'),
    },
    cssModuleFiles,
  };
}
