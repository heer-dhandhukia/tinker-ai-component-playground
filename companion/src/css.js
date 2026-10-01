import postcss from 'postcss';
import scss from 'postcss-scss';

// postcss-scss also reads plain CSS (including native nesting), so it is used for both.
export const parseStylesheet = (text) => scss.parse(text);
export const stringifyStylesheet = (root) => root.toString(scss.stringify);

const CONDITIONAL_AT_RULES = new Set(['media', 'supports', 'container', 'keyframes', 'font-face', 'page']);

function isConditional(rule) {
  for (let parent = rule.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && CONDITIONAL_AT_RULES.has(parent.name.toLowerCase())) return true;
  }
  return false;
}

/** Full selectors of a rule with SCSS/CSS nesting expanded (`&__link` inside `.navbar`). */
export function resolvedSelectors(rule) {
  const own = rule.selectors.map((selector) => selector.trim());
  let parent = rule.parent;
  while (parent && parent.type !== 'rule' && parent.type !== 'root') parent = parent.parent;
  if (!parent || parent.type === 'root') return own;
  const outer = resolvedSelectors(parent);
  return outer.flatMap((outerSelector) =>
    own.map((selector) => (selector.includes('&') ? selector.replaceAll('&', outerSelector) : `${outerSelector} ${selector}`)),
  );
}

/**
 * Rules whose whole selector is exactly `selector`, outside conditional at-rules. A rule that
 * also lists other selectors (`.a:hover, .b`) is returned separately: editing it would change
 * more than the element asked for.
 */
export function findRules(root, selector) {
  const exact = [];
  const shared = [];
  root.walkRules((rule) => {
    if (isConditional(rule)) return;
    let selectors;
    try {
      selectors = resolvedSelectors(rule);
    } catch {
      return;
    }
    if (!selectors.includes(selector)) return;
    (selectors.length === 1 ? exact : shared).push(rule);
  });
  return { exact, shared: shared.map((rule) => resolvedSelectors(rule).join(', ')) };
}

/**
 * Sets declarations directly inside a rule (or a root, for styled-components templates).
 * An existing declaration of the same property is updated in place; a new one goes after the
 * last existing declaration, so it follows any shorthand it refines and stays above nested rules.
 * @param {import('postcss').Container} container
 * @param {{ property: string, after: string }[]} changes
 */
export function setDeclarations(container, changes) {
  for (const { property, after } of changes) {
    const declarations = (container.nodes ?? []).filter((node) => node.type === 'decl');
    const existing = declarations.filter((node) => node.prop.toLowerCase() === property).at(-1);
    if (existing) {
      existing.value = after;
      continue;
    }
    const declaration = postcss.decl({ prop: property, value: after });
    const last = declarations.at(-1);
    if (last) container.insertAfter(last, declaration);
    else container.prepend(declaration);
  }
}
