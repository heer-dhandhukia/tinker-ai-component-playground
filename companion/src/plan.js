// Turns a changeset into proposed source edits. The rule throughout: propose an edit only
// when exactly one place in the source matches; otherwise say why not. Nothing here writes.
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { findRules, parseStylesheet, setDeclarations, stringifyStylesheet } from './css.js';
import { attributeOf, collect, elementName, mergeObjectAttribute, parseSource, replaceStaticString, staticString, styledTarget } from './jsx.js';
import { createProject, hashOf } from './project.js';
import { EDITABLE_PROPERTIES, changesetSchema, isSafeValue } from './schema.js';
import { applyTailwind } from './tailwind.js';

const STYLESHEET_EXTENSIONS = ['.css', '.scss'];
const SCRIPT_EXTENSIONS = /\.[cm]?[jt]sx?$/;
const PLUGIN_HINT = 'Add the tinker-src Vite plugin to the project so elements carry their exact source line, then export again.';

/**
 * @typedef {(content: string) => { content: string } | { error: string }} Edit
 * @typedef {{ label: string, scope: 'shared' | 'element', file: string, edit: Edit } | { label: string, scope: 'shared' | 'element', reason: string }} Candidate
 */

const escapeClass = (className) => className.replace(/([^\w-])/g, '\\$1');
const CSS_MODULE_CLASS = /^[A-Za-z][A-Za-z0-9-]*_([A-Za-z][A-Za-z0-9-]*)__[\w-]{4,}$/;
const VITE_MODULE_CLASS = /^_([A-Za-z][\w-]*)_[a-z0-9]{4,}_\d+$/;

// ---- stylesheets ----

/** Stylesheets a script file imports, as root-relative paths. */
function importedStylesheets(project, scriptRel) {
  if (!scriptRel) return [];
  const code = project.read(scriptRel);
  const found = [];
  for (const match of code.matchAll(/(?:from\s+|import\s+)['"]([^'"]+\.s?css)['"]/g)) {
    const resolved = project.resolve(path.join(path.dirname(scriptRel), match[1]));
    if (resolved) found.push(resolved.rel);
  }
  return found;
}

/** An edit that updates the one rule in a stylesheet whose selector is exactly `selector`. */
function ruleEdit(selector, changes) {
  return (content) => {
    let root;
    try {
      root = parseStylesheet(content);
    } catch (error) {
      return { error: `the stylesheet could not be parsed (${error.reason ?? error.message})` };
    }
    const { exact } = findRules(root, selector);
    if (exact.length !== 1) return { error: `expected exactly one rule for \`${selector}\`, found ${exact.length}` };
    setDeclarations(exact[0], changes);
    return { content: stringifyStylesheet(root) };
  };
}

/** @returns {Candidate} */
function stylesheetCandidate(project, { selector, files, sourceRel, changes, label }) {
  const matches = [];
  const shared = [];
  for (const file of files) {
    let root;
    try {
      root = parseStylesheet(project.read(file));
    } catch {
      continue;
    }
    const found = findRules(root, selector);
    found.exact.forEach(() => matches.push(file));
    found.shared.forEach((selectors) => shared.push(`\`${selectors}\` in ${file}`));
  }

  let chosen = matches;
  if (new Set(matches).size > 1) {
    // Several stylesheets define the selector: only the one the component imports is unambiguous.
    const imported = new Set(importedStylesheets(project, sourceRel));
    chosen = matches.filter((file) => imported.has(file));
  }
  if (chosen.length === 1) {
    return { label: `${label} in ${chosen[0]}`, scope: 'shared', file: chosen[0], edit: ruleEdit(selector, changes) };
  }
  if (matches.length === 0) {
    const reason = shared.length
      ? `\`${selector}\` only appears in a rule shared with other selectors (${shared.join('; ')}); editing it would change those too`
      : `no rule with the selector \`${selector}\` was found in the project's stylesheets`;
    return { label, scope: 'shared', reason };
  }
  return { label, scope: 'shared', reason: `${matches.length} rules match \`${selector}\` (${[...new Set(matches)].join(', ')}); not guessing which one` };
}

// ---- JSX ----

/**
 * Finds the JSX element the changes belong to: by exact source position when the changeset has
 * one, otherwise only if `fallback` matches exactly one element in the file.
 * @returns {{ rel: string, find: (code: string) => { opening: any, ast: any } | { error: string } } | { error: string }}
 */
function jsxLocator(project, source, fallback) {
  if (!source) return { error: `the changeset has no source file for this element. ${PLUGIN_HINT}` };
  const resolved = project.resolve(source.file);
  if (!resolved) return { error: `source file \`${source.file}\` is not inside this project` };
  if (!SCRIPT_EXTENSIONS.test(resolved.rel)) return { error: `\`${resolved.rel}\` is not a script file` };

  const find = (code) => {
    let ast;
    try {
      ast = parseSource(code);
    } catch (error) {
      return { error: `\`${resolved.rel}\` could not be parsed (${error.message})` };
    }
    const openings = collect(ast, 'JSXOpeningElement');
    if (source.line !== undefined) {
      const atLine = openings.filter(
        (opening) => opening.loc.start.line === source.line && (source.column === undefined || opening.loc.start.column + 1 === source.column),
      );
      if (atLine.length === 1) return { opening: atLine[0], ast };
      return { error: `no single JSX element starts at ${resolved.rel}:${source.line}${source.column === undefined ? '' : `:${source.column}`} (found ${atLine.length}); the file may have changed since the export` };
    }
    const matching = openings.filter(fallback.matches);
    if (matching.length === 1) return { opening: matching[0], ast };
    return { error: `the source line is unknown and ${matching.length} elements in ${resolved.rel} match ${fallback.description}. ${PLUGIN_HINT}` };
  };

  const initial = find(project.read(resolved.rel));
  return 'error' in initial ? { error: initial.error } : { rel: resolved.rel, find };
}

/** @returns {Candidate} */
function objectPropCandidate(project, source, { attribute, label, scope, fallback, changes }) {
  const locator = jsxLocator(project, source, fallback);
  if ('error' in locator) return { label, scope, reason: locator.error };
  return {
    label: `${label} in ${locator.rel}`,
    scope,
    file: locator.rel,
    edit: (content) => {
      const found = locator.find(content);
      if ('error' in found) return found;
      const merged = mergeObjectAttribute(content, found.opening, attribute, changes);
      return 'error' in merged ? merged : { content: merged.code };
    },
  };
}

/** @returns {Candidate} */
function tailwindCandidate(project, meta, changes) {
  const label = 'Tailwind: the className on this element';
  const wanted = meta.classes.join(' ');
  const locator = jsxLocator(project, meta.source, {
    description: `the class list "${wanted}"`,
    matches: (opening) => staticString(attributeOf(opening, 'className'))?.text.trim().split(/\s+/).join(' ') === wanted,
  });
  if ('error' in locator) return { label, scope: 'element', reason: locator.error };
  return {
    label: `${label} in ${locator.rel}`,
    scope: 'element',
    file: locator.rel,
    edit: (content) => {
      const found = locator.find(content);
      if ('error' in found) return found;
      const literal = staticString(attributeOf(found.opening, 'className'));
      if (!literal) return { error: 'the className is not a plain string, so it cannot be edited safely' };
      const result = applyTailwind(literal.text.trim().split(/\s+/).filter(Boolean), changes);
      if ('error' in result) return result;
      return { content: replaceStaticString(content, literal.node, result.classes.join(' ')) };
    },
  };
}

/** @returns {Candidate} */
function styledCandidate(project, meta, changes, system) {
  const label = `${system === 'emotion' ? 'Emotion' : 'styled-components'}: the styled template for this <${meta.tag}>`;
  if (!meta.source) return { label, scope: 'shared', reason: `the changeset has no source file for this element. ${PLUGIN_HINT}` };
  const resolved = project.resolve(meta.source.file);
  if (!resolved || !SCRIPT_EXTENSIONS.test(resolved.rel)) return { label, scope: 'shared', reason: `source file \`${meta.source.file}\` is not a script inside this project` };

  const locate = (code) => {
    let ast;
    try {
      ast = parseSource(code);
    } catch (error) {
      return { error: `\`${resolved.rel}\` could not be parsed (${error.message})` };
    }
    const declarators = collect(ast, 'VariableDeclarator').filter((node) => node.init?.type === 'TaggedTemplateExpression' && styledTarget(node.init));
    // With an exact source line, the JSX element there names the styled component directly.
    if (meta.source.line !== undefined) {
      const used = collect(ast, 'JSXOpeningElement').find(
        (opening) => opening.loc.start.line === meta.source.line && (meta.source.column === undefined || opening.loc.start.column + 1 === meta.source.column),
      );
      const named = used && declarators.filter((node) => node.id.type === 'Identifier' && node.id.name === elementName(used));
      if (named?.length === 1) return { template: named[0].init };
    }
    const forTag = declarators.filter((node) => {
      const target = styledTarget(node.init);
      return target.kind === 'host' && target.name === meta.tag;
    });
    if (forTag.length === 1) return { template: forTag[0].init };
    return { error: `${forTag.length} styled templates for <${meta.tag}> were found in ${resolved.rel}${forTag.length > 1 ? `. ${PLUGIN_HINT}` : ''}` };
  };

  const initial = locate(project.read(resolved.rel));
  if ('error' in initial) return { label, scope: 'shared', reason: initial.error };

  return {
    label: `${label} in ${resolved.rel}`,
    scope: 'shared',
    file: resolved.rel,
    edit: (content) => {
      const found = locate(content);
      if ('error' in found) return found;
      const { quasis, expressions } = found.template.quasi;
      // Interpolations become placeholders so the template can be read as CSS, then are put back.
      let css = '';
      quasis.forEach((quasi, index) => {
        css += content.slice(quasi.start, quasi.end);
        if (index < expressions.length) css += `__TINKER_EXPR_${index}__`;
      });
      let root;
      try {
        root = parseStylesheet(css);
      } catch {
        return { error: 'the styled template could not be read as CSS (an interpolation stands where a declaration is expected)' };
      }
      setDeclarations(root, changes);
      let next = stringifyStylesheet(root);
      for (let index = 0; index < expressions.length; index++) {
        const placeholder = `__TINKER_EXPR_${index}__`;
        if (next.split(placeholder).length !== 2) return { error: 'an interpolation was lost while editing the template' };
        next = next.replace(placeholder, () => content.slice(quasis[index].end, quasis[index + 1].start));
      }
      return { content: content.slice(0, quasis[0].start) + next + content.slice(quasis.at(-1).end) };
    },
  };
}

// ---- per element ----

/** Every place the element's style changes could be written, most specific first. */
function candidatesFor(project, meta, changes) {
  /** @type {Candidate[]} */
  const candidates = [];
  const sourceRel = meta.source ? project.resolve(meta.source.file)?.rel : undefined;
  const stylesheets = project.list(STYLESHEET_EXTENSIONS);
  let hasSharedCandidate = false;

  for (const match of meta.styling) {
    const classes = match.classes ?? [];
    switch (match.system) {
      case 'css-modules':
        for (const className of [...classes].reverse()) {
          const local = CSS_MODULE_CLASS.exec(className)?.[1] ?? VITE_MODULE_CLASS.exec(className)?.[1];
          const label = `CSS Modules: \`.${local ?? className}\``;
          if (!local) {
            candidates.push({ label, scope: 'shared', reason: `cannot work out the local class name behind \`${className}\`` });
            continue;
          }
          const files = match.moduleFile
            ? stylesheets.filter((file) => path.posix.basename(file) === match.moduleFile)
            : stylesheets.filter((file) => /\.module\.s?css$/.test(file));
          candidates.push(stylesheetCandidate(project, { selector: `.${local}`, files, sourceRel, changes, label }));
          hasSharedCandidate = true;
        }
        break;
      case 'scss-or-plain-css':
        // The last class is usually the most specific one (a BEM modifier, say).
        for (const className of [...classes].reverse()) {
          const selector = `.${escapeClass(className)}`;
          const files = stylesheets.filter((file) => !/\.module\.s?css$/.test(file));
          candidates.push(stylesheetCandidate(project, { selector, files, sourceRel, changes, label: `Stylesheet rule \`${selector}\`` }));
          hasSharedCandidate = true;
        }
        break;
      case 'styled-components':
      case 'emotion':
        candidates.push(styledCandidate(project, meta, changes, match.system));
        hasSharedCandidate = true;
        break;
      case 'mui':
        candidates.push(
          objectPropCandidate(project, meta.source, {
            attribute: 'sx',
            label: `MUI: the \`sx\` prop on <${meta.via ?? 'the component'}>`,
            scope: 'element',
            changes,
            fallback: { description: `<${meta.via}>`, matches: (opening) => Boolean(meta.via) && elementName(opening) === meta.via },
          }),
        );
        break;
      case 'tailwind':
        candidates.push(tailwindCandidate(project, meta, changes));
        break;
      case 'inline':
        candidates.push(
          objectPropCandidate(project, meta.source, {
            attribute: 'style',
            label: `Inline style: the \`style\` prop on this <${meta.tag}>`,
            scope: 'element',
            changes,
            fallback: { description: `<${meta.tag}> with a style prop`, matches: (opening) => elementName(opening) === meta.tag && Boolean(attributeOf(opening, 'style')) },
          }),
        );
        break;
      default:
        break;
    }
  }

  // "This instance only": when the other options edit a rule shared by every element using it,
  // offer an inline style on this one JSX element instead. It needs the exact source position.
  if (hasSharedCandidate && meta.source?.line !== undefined && !meta.styling.some((match) => match.system === 'inline')) {
    candidates.push(
      objectPropCandidate(project, meta.source, {
        attribute: 'style',
        label: 'Only this element: an inline `style` prop',
        scope: 'element',
        changes,
        fallback: { description: 'nothing', matches: () => false },
      }),
    );
  }
  return candidates;
}

const diffOf = (file, before, after) => createTwoFilesPatch(file, file, before, after, '', '', { context: 3 }).replace(/^Index:.*\n=+\n/, '');

/**
 * @param {string} rootDirectory
 * @param {unknown} rawChangeset
 */
export function createPlan(rootDirectory, rawChangeset) {
  const changeset = changesetSchema.parse(rawChangeset);
  const project = createProject(rootDirectory);
  /** originals[file] = content the diffs were computed against */
  const originals = new Map();
  const edits = new Map();

  const elements = changeset.elements.map((entry, index) => {
    const meta = entry.element;
    const title = `${meta?.componentName ?? entry.target.componentPath?.at(-1) ?? 'Element'} <${meta?.tag ?? '?'}>`;
    const skipped = [];
    /** @type {{ property: string, after: string }[]} */
    const changes = [];
    for (const change of entry.changes) {
      if (change.kind === 'text') skipped.push(`Text change ("${change.before}" → "${change.after}") is not written automatically; edit the component by hand.`);
      else if (!EDITABLE_PROPERTIES.has(change.property)) skipped.push(`\`${change.property}\` is not a property the companion writes.`);
      else if (!isSafeValue(change.after)) skipped.push(`The value for \`${change.property}\` was refused as unsafe.`);
      else changes.push({ property: change.property, after: change.after.trim() });
    }

    let options = [];
    if (!meta) {
      skipped.push('The changeset has no details for this element, so there is nothing to map to source.');
    } else if (changes.length > 0) {
      options = candidatesFor(project, meta, changes).map((candidate, optionIndex) => {
        const id = `${index}:${optionIndex}`;
        const base = { id, label: candidate.label, scope: candidate.scope };
        if ('reason' in candidate) return { ...base, status: 'unresolved', reason: candidate.reason };
        const before = originals.get(candidate.file) ?? project.read(candidate.file);
        const result = candidate.edit(before);
        if ('error' in result) return { ...base, status: 'unresolved', reason: result.error };
        if (result.content === before) return { ...base, status: 'unresolved', reason: 'the source already has these values' };
        originals.set(candidate.file, before);
        edits.set(id, { file: candidate.file, edit: candidate.edit });
        return { ...base, status: 'ready', file: candidate.file, diff: diffOf(candidate.file, before, result.content) };
      });
    }

    return {
      index,
      title,
      cssPath: entry.target.cssPath,
      changes: changes.map(({ property, after }) => `${property}: ${after}`),
      skipped,
      options,
      // Pre-select only the most specific place. If that one is unavailable, a broader rule
      // (one that also styles other elements) has to be chosen by the user, not by default.
      defaultOption: options[0]?.status === 'ready' ? options[0].id : null,
    };
  });

  return {
    id: randomUUID(),
    root: project.root,
    pageUrl: changeset.page.url,
    elements,
    /** Not serialised: what apply needs. */
    internal: { project, edits, hashes: new Map([...originals].map(([file, content]) => [file, hashOf(content)])) },
  };
}

/** The plan without its internals, for sending to the review page. */
export const publicPlan = ({ internal: _internal, ...plan }) => plan;

/**
 * Writes the approved options. Edits to the same file are applied one after another, each on
 * the result of the previous. A file that changed on disk since the plan was made is skipped.
 * @param {ReturnType<typeof createPlan>} plan
 * @param {string[]} approvedOptionIds at most one per element
 */
export function applyPlan(plan, approvedOptionIds) {
  const { project, edits, hashes } = plan.internal;
  const perElement = new Set();
  /** @type {Map<string, Edit[]>} */
  const byFile = new Map();
  const failed = [];

  for (const id of approvedOptionIds) {
    const entry = edits.get(id);
    const element = id.split(':')[0];
    if (!entry) {
      failed.push({ option: id, reason: 'not an applicable option of this plan' });
      continue;
    }
    if (perElement.has(element)) {
      failed.push({ option: id, reason: 'another option was already chosen for this element' });
      continue;
    }
    perElement.add(element);
    byFile.set(entry.file, [...(byFile.get(entry.file) ?? []), entry.edit]);
  }

  const written = [];
  for (const [file, fileEdits] of byFile) {
    const current = project.read(file);
    if (hashOf(current) !== hashes.get(file)) {
      failed.push({ file, reason: 'the file changed since the plan was made; create a new plan' });
      continue;
    }
    let content = current;
    let error = null;
    for (const edit of fileEdits) {
      const result = edit(content);
      if ('error' in result) {
        error = result.error;
        break;
      }
      content = result.content;
    }
    if (error) {
      failed.push({ file, reason: error });
      continue;
    }
    project.write(file, content);
    hashes.set(file, hashOf(content));
    written.push({ file, diff: diffOf(file, current, content) });
  }
  return { written, failed };
}
