import { parse } from '@babel/parser';

const SKIPPED_KEYS = new Set(['loc', 'start', 'end', 'range', 'extra', 'leadingComments', 'trailingComments', 'innerComments', 'errors', 'tokens', 'comments']);

export function parseSource(code) {
  return parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
}

/** Depth-first walk over every AST node (no @babel/traverse dependency). */
export function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (!SKIPPED_KEYS.has(key)) {
      const value = node[key];
      if (value && typeof value === 'object') walk(value, visit);
    }
  }
}

export function collect(ast, type) {
  const found = [];
  walk(ast, (node) => node.type === type && found.push(node));
  return found;
}

/** `div`, `Button`, or `Motion.div` for member expressions. */
export function elementName(opening) {
  const read = (name) => {
    if (name.type === 'JSXIdentifier') return name.name;
    if (name.type === 'JSXMemberExpression') return `${read(name.object)}.${read(name.property)}`;
    if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`;
    return '';
  };
  return read(opening.name);
}

export const attributeOf = (opening, attributeName) =>
  opening.attributes.find((attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === attributeName);

/** The static string of a `className="…"`, `className={'…'}` or `className={`…`}`; null otherwise. */
export function staticString(attribute) {
  let value = attribute?.value;
  if (value?.type === 'JSXExpressionContainer') value = value.expression;
  if (value?.type === 'StringLiteral') return { node: value, text: value.value };
  if (value?.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return { node: value, text: value.quasis[0].value.cooked ?? value.quasis[0].value.raw };
  }
  return null;
}

const splice = (code, start, end, text) => code.slice(0, start) + text + code.slice(end);
const quote = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const camelCase = (property) => property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const lineIndent = (code, index) => /^[ \t]*/.exec(code.slice(code.lastIndexOf('\n', index - 1) + 1))?.[0] ?? '';

/**
 * Sets keys on an object-literal JSX prop (`style={{…}}`, `sx={{…}}`), adding the prop when
 * the element does not have it. Anything that is not a plain object literal is refused.
 * @returns {{ code: string } | { error: string }}
 */
export function mergeObjectAttribute(code, opening, attributeName, changes) {
  const entries = changes.map(({ property, after }) => ({ key: camelCase(property), value: quote(after) }));
  const attribute = attributeOf(opening, attributeName);

  if (!attribute) {
    const insertAt = opening.attributes.at(-1)?.end ?? opening.typeParameters?.end ?? opening.typeArguments?.end ?? opening.name.end;
    const body = entries.map(({ key, value }) => `${key}: ${value}`).join(', ');
    return { code: splice(code, insertAt, insertAt, ` ${attributeName}={{ ${body} }}`) };
  }

  const object = attribute.value?.type === 'JSXExpressionContainer' ? attribute.value.expression : null;
  if (object?.type !== 'ObjectExpression') {
    return { error: `the \`${attributeName}\` prop is not an object literal, so it cannot be edited safely` };
  }

  /** @type {{ start: number, end: number, text: string }[]} */
  const operations = [];
  const added = [];
  for (const entry of entries) {
    const existing = object.properties
      .filter((property) => property.type === 'ObjectProperty' && !property.computed)
      .filter((property) => (property.key.type === 'Identifier' ? property.key.name : property.key.value) === entry.key)
      .at(-1);
    if (existing) operations.push({ start: existing.value.start, end: existing.value.end, text: entry.value });
    else added.push(entry);
  }

  if (added.length) {
    const last = object.properties.at(-1);
    if (!last) {
      operations.push({ start: object.start, end: object.end, text: `{ ${added.map(({ key, value }) => `${key}: ${value}`).join(', ')} }` });
    } else {
      const multiline = object.loc.start.line !== object.loc.end.line;
      const hasTrailingComma = /^\s*,/.test(code.slice(last.end, object.end));
      if (multiline) {
        const indent = lineIndent(code, last.start);
        const lines = added.map(({ key, value }) => `\n${indent}${key}: ${value},`).join('');
        const at = hasTrailingComma ? code.indexOf(',', last.end) + 1 : last.end;
        operations.push({ start: at, end: at, text: hasTrailingComma ? lines : `,${lines.slice(0, -1)}` });
      } else {
        operations.push({ start: last.end, end: last.end, text: added.map(({ key, value }) => `, ${key}: ${value}`).join('') });
      }
    }
  }

  let next = code;
  for (const operation of operations.sort((a, b) => b.start - a.start)) {
    next = splice(next, operation.start, operation.end, operation.text);
  }
  return { code: next };
}

/** Replaces the text of a static className, keeping its quoting. */
export function replaceStaticString(code, node, text) {
  const open = code[node.start];
  const safe = open === '`' ? text.replace(/[`\\$]/g, '\\$&') : text.replace(/\\/g, '\\\\').replaceAll(open, `\\${open}`);
  return splice(code, node.start, node.end, `${open}${safe}${open}`);
}

/** `styled.button`…``, `styled(Button)`…`` or `styled.button.attrs(…)`…``: what the template styles. */
export function styledTarget(tagged) {
  let tag = tagged.tag;
  // styled.x.attrs(...) / styled(X).withConfig(...)
  while (tag.type === 'CallExpression' && tag.callee.type === 'MemberExpression' && ['attrs', 'withConfig'].includes(tag.callee.property.name)) {
    tag = tag.callee.object;
  }
  if (tag.type === 'MemberExpression' && tag.object.type === 'Identifier' && tag.object.name === 'styled') {
    return { kind: 'host', name: tag.property.name };
  }
  if (tag.type === 'CallExpression' && tag.callee.type === 'Identifier' && tag.callee.name === 'styled') {
    const argument = tag.arguments[0];
    if (argument?.type === 'StringLiteral') return { kind: 'host', name: argument.value };
    if (argument?.type === 'Identifier') return { kind: 'component', name: argument.name };
  }
  return null;
}
