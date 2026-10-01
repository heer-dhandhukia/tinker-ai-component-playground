// Dev-only Vite plugin: stamps every JSX element with `data-tinker-src="file:line:column"`,
// so Tinker (and the companion) know exactly where an element was written. React 19 no
// longer exposes that itself.
import path from 'node:path';
import { collect, elementName, attributeOf, parseSource } from './jsx.js';

export const SOURCE_ATTRIBUTE = 'data-tinker-src';
// React built-ins that reject or ignore unknown props.
const SKIPPED = new Set(['Fragment', 'StrictMode', 'Suspense', 'Profiler']);

/**
 * @param {string} code
 * @param {string} file path to record, relative to the project root, with forward slashes
 */
export function addSourceAttributes(code, file) {
  let ast;
  try {
    ast = parseSource(code);
  } catch {
    return code;
  }
  const insertions = [];
  for (const opening of collect(ast, 'JSXOpeningElement')) {
    // Member expressions (<Ctx.Provider>, <motion.div>) are left alone: providers reject extra props.
    if (opening.name.type !== 'JSXIdentifier' || SKIPPED.has(elementName(opening))) continue;
    if (attributeOf(opening, SOURCE_ATTRIBUTE)) continue;
    const at = opening.typeParameters?.end ?? opening.typeArguments?.end ?? opening.name.end;
    const { line, column } = opening.loc.start;
    insertions.push({ at, text: ` ${SOURCE_ATTRIBUTE}="${file}:${line}:${column + 1}"` });
  }
  let next = code;
  for (const { at, text } of insertions.sort((a, b) => b.at - a.at)) next = next.slice(0, at) + text + next.slice(at);
  return next;
}

/** @returns {import('vite').Plugin} */
export default function tinkerSrc() {
  let root = process.cwd();
  return {
    name: 'tinker-src',
    enforce: 'pre',
    apply: 'serve', // never in production builds
    configResolved(config) {
      root = config.root;
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!/\.[jt]sx$/.test(file) || file.includes('/node_modules/')) return null;
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (relative.startsWith('..')) return null;
      const next = addSourceAttributes(code, relative);
      // Attributes are inserted on existing lines, so line numbers in stack traces are unchanged.
      return next === code ? null : { code: next, map: null };
    },
  };
}
