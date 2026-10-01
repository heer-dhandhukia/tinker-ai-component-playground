import { COMPUTED_PROPERTIES } from '../shared/computed';
import type { ReactInfo } from '../shared/element-info';
import type { ElementInfo } from '../shared/types';
import { detectStyling } from './detection';
import { collectStyleHints } from './style-hints';

export const TINKER_ID_ATTRIBUTE = 'data-tinker-id';
// Optional `file:line[:column]` attribute written by the Phase 5 dev plugin.
const SOURCE_ATTRIBUTE = 'data-tinker-src';

/** A DOM path that finds the element again as long as the structure has not changed. */
export function cssPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== current.ownerDocument.documentElement) {
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const tag = current.localName;
    const parent: Element | null = current.parentElement;
    const sameTag = parent ? [...parent.children].filter((child) => child.localName === tag) : [];
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})` : tag);
    current = parent;
  }
  return parts.join(' > ');
}

function sourceFromAttribute(element: Element): ElementInfo['source'] {
  const match = /^(.+?):(\d+)(?::(\d+))?$/.exec(element.getAttribute(SOURCE_ATTRIBUTE) ?? '');
  if (!match || Number(match[2]) < 1) return undefined;
  return {
    file: match[1]!,
    line: Number(match[2]),
    ...(match[3] !== undefined ? { column: Number(match[3]) } : {}),
  };
}

/** First ~40 characters of an element's text, used to tell lookalike elements apart. */
export function textSnippetOf(element: Element): string | undefined {
  return (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || undefined;
}

export function ensureTinkerId(element: Element): string {
  const existing = element.getAttribute(TINKER_ID_ATTRIBUTE);
  if (existing) return existing;
  const id = crypto.randomUUID().slice(0, 8);
  element.setAttribute(TINKER_ID_ATTRIBUTE, id);
  return id;
}

/**
 * `originalText` is the element's text before a Tinker text edit, when one is applied; the
 * target's snippet must describe the page's own text so the element can be found again.
 */
export function buildElementInfo(element: Element, react: ReactInfo | null, originalText?: string): ElementInfo {
  const classes = [...element.classList];
  const inlineStyleProps = element instanceof HTMLElement || element instanceof SVGElement ? [...element.style] : [];
  const computedStyle = getComputedStyle(element);
  const computed: Record<string, string> = {};
  for (const property of COMPUTED_PROPERTIES) computed[property] = computedStyle.getPropertyValue(property);

  const text = originalText === undefined ? textSnippetOf(element) : originalText.trim().replace(/\s+/g, ' ').slice(0, 40) || undefined;
  const editableText = element.childElementCount === 0 ? (element.textContent ?? '').slice(0, 2000) : undefined;
  const source = sourceFromAttribute(element) ?? react?.source;

  return {
    target: {
      tinkerId: ensureTinkerId(element),
      cssPath: cssPath(element),
      ...(react?.ownerChain.length ? { componentPath: react.ownerChain } : {}),
      ...(text ? { textSnippet: text } : {}),
    },
    tag: element.localName,
    classes,
    ...(react?.componentName ? { componentName: react.componentName } : {}),
    ...(react?.via ? { via: react.via } : {}),
    ...(react ? { ownerChain: react.ownerChain, reactBuild: react.build } : {}),
    ...(react?.props ? { props: react.props } : {}),
    ...(source ? { source } : {}),
    styling: detectStyling({ classes, inlineStyleProps, hints: collectStyleHints(element.ownerDocument) }),
    computed,
    ...(editableText !== undefined ? { text: editableText } : {}),
    hasParent: element.parentElement !== null && element !== element.ownerDocument.body,
    hasChild: element.firstElementChild !== null,
  };
}
