import { classifyToken, type DesignToken } from '../shared/tokens';

const MAX_TOKENS = 400;
const ROOT_SELECTORS = new Set([':root', 'html']);
// Containers that do not make their contents conditional on the viewport or device.
const TRANSPARENT_RULES = new Set(['CSSLayerBlockRule', 'CSSSupportsRule']);

/**
 * Custom properties declared on :root in the page's readable stylesheets. The stylesheets
 * only tell us which names exist; each value is read from the root's computed style, because
 * that is where the cascade (layers, order, specificity) has already been resolved.
 */
export function extractTokens(doc: Document): DesignToken[] {
  const found = new Map<string, string>();
  const rootStyle = getComputedStyle(doc.documentElement);

  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const onRoot = rule.selectorText.split(',').some((selector) => ROOT_SELECTORS.has(selector.trim()));
        if (!onRoot) continue;
        for (const name of rule.style) {
          if (name.startsWith('--')) found.set(name, rule.style.getPropertyValue(name).trim());
        }
      } else if (TRANSPARENT_RULES.has(rule.constructor.name)) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };

  for (const sheet of doc.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin stylesheet: not readable.
    }
  }

  for (const [name, declared] of found) {
    found.set(name, rootStyle.getPropertyValue(name).trim() || declared);
  }

  return [...found]
    .filter(([name, value]) => /^--[\w-]{1,100}$/.test(name) && value.length > 0 && value.length <= 500)
    .slice(0, MAX_TOKENS)
    .map(([name, value]) => ({ name, value, category: classifyToken(name, value) }));
}
