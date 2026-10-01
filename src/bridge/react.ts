// Reads React's internals for one element. Field names here were verified against the fixtures
// (React 19.3 and 18.3 dev builds) with scripts/dump-fibers.mjs; see DECISIONS.md.
import type { ReactInfo } from '../shared/element-info';
import { safeSerialize } from './serialize';

type Internal = Record<string, unknown>;

const FIBER_KEY_PREFIX = '__reactFiber$';
// FunctionComponent, ClassComponent, ForwardRef, MemoComponent, SimpleMemoComponent
const COMPOSITE_TAGS = new Set([0, 1, 11, 14, 15]);
const MAX_WALK = 500;

const isObject = (value: unknown): value is Internal => typeof value === 'object' && value !== null;
const isFiber = (value: unknown): value is Internal => isObject(value) && typeof value.tag === 'number';
const isAppPath = (file: string) => !/(^|[\\/])node_modules[\\/]/.test(file);

/** The fiber React attached to a DOM node, or null if React does not own it. */
export function findFiber(node: object): Internal | null {
  const key = Object.keys(node).find((name) => name.startsWith(FIBER_KEY_PREFIX));
  if (!key) return null;
  const fiber = (node as Internal)[key];
  return isFiber(fiber) ? fiber : null;
}

function typeName(type: unknown): string | null {
  if (typeof type === 'function') {
    return (type as { displayName?: string }).displayName || type.name || null;
  }
  if (isObject(type)) {
    if (typeof type.displayName === 'string' && type.displayName) return type.displayName;
    // forwardRef wraps `render`, memo wraps `type`.
    return typeName(type.render) ?? typeName(type.type);
  }
  return null;
}

/** Owners are fibers, or (React 19 server components) plain `{ name, owner }` records. */
function ownerName(owner: Internal): string {
  const name = typeof owner.tag === 'number' ? typeName(owner.type) : owner.name;
  return typeof name === 'string' && name ? name.slice(0, 200) : 'Anonymous';
}

/**
 * React 19 dev: `_debugStack` is an Error captured where the element was created. Its first
 * frame is the JSX factory, the second is the call site. Line/column point into the bundler's
 * transformed output, not the source file, so only the file is returned.
 */
export function callSiteFromStack(stack: string): { file: string } | null {
  const frames = stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
  const frame = frames[1];
  if (!frame) return null;
  const inParens = /\((.*)\)$/.exec(frame);
  const location = (inParens?.[1] ?? frame.slice(3)).replace(/:\d+(?::\d+)?$/, '');
  if (!location) return null;
  try {
    // A dev-server URL: its path is relative to the project root, so drop the leading slash
    // (an absolute-looking "/src/App.tsx" would be misread as a filesystem path).
    return { file: decodeURI(new URL(location).pathname).replace(/^\/+/, '') };
  } catch {
    return { file: location };
  }
}

interface Placement {
  /** The JSX that created this element was written in app code (not node_modules). */
  app: boolean;
  source?: ReactInfo['source'];
}

function placementOf(element: Internal): Placement {
  if ('_debugSource' in element) {
    // React <= 18. Undefined for elements created without the JSX source transform (libraries).
    const source = element._debugSource;
    if (!isObject(source) || typeof source.fileName !== 'string') return { app: false };
    return {
      app: isAppPath(source.fileName),
      source: {
        file: source.fileName,
        ...(typeof source.lineNumber === 'number' && source.lineNumber > 0 ? { line: source.lineNumber } : {}),
        ...(typeof source.columnNumber === 'number' && source.columnNumber >= 0 ? { column: source.columnNumber } : {}),
      },
    };
  }
  const debugStack = element._debugStack ?? element.debugStack;
  if (isObject(debugStack) && typeof debugStack.stack === 'string') {
    const site = callSiteFromStack(debugStack.stack);
    if (site) return { app: isAppPath(site.file), source: site };
  }
  return { app: false };
}

function ownersOf(fiber: Internal): Internal[] {
  const owners: Internal[] = [];
  let owner = fiber._debugOwner;
  while (isObject(owner) && owners.length < MAX_WALK) {
    owners.push(owner);
    owner = owner._debugOwner ?? owner.owner;
  }
  return owners;
}

function compositeAncestors(fiber: Internal): Internal[] {
  const ancestors: Internal[] = [];
  let current = fiber.return;
  for (let steps = 0; isFiber(current) && steps < MAX_WALK; steps++) {
    if (COMPOSITE_TAGS.has(current.tag as number)) ancestors.push(current);
    current = current.return;
  }
  return ancestors;
}

function propsOf(owner: Internal | undefined): ReactInfo['props'] {
  const props = owner && isFiber(owner) ? owner.memoizedProps : undefined;
  if (!isObject(props)) return undefined;
  return safeSerialize(props) as Record<string, unknown>;
}

/**
 * Describes the component behind a host fiber.
 * `componentName` is the nearest component written in app code: the owner of the nearest
 * element (walking outwards through owners) whose JSX lives outside node_modules.
 */
export function describeFiber(hostFiber: object, detail: 'name' | 'full'): ReactInfo {
  const host = hostFiber as Internal;
  const withProps = (owner: Internal | undefined) => (detail === 'full' ? { props: propsOf(owner) } : {});

  if (!('_debugOwner' in host)) {
    // Production build: no owner or source info, and names are whatever the minifier left.
    const composites = compositeAncestors(host);
    const nearest = composites[0];
    return {
      ...(nearest ? { componentName: ownerName(nearest) } : {}),
      ownerChain: composites.map(ownerName).reverse(),
      ...(nearest ? withProps(nearest) : {}),
      build: 'production',
    };
  }

  const owners = ownersOf(host);
  // candidates[i] is the element owned by owners[i].
  const candidates = [host, ...owners];
  const placements = candidates.map(placementOf);
  const placed = placements.findIndex((placement) => placement.app);

  if (placed === -1) {
    // No usable source info at all (e.g. JSX compiled without the dev transform).
    const nearest = owners[0];
    return {
      ...(nearest ? { componentName: ownerName(nearest) } : {}),
      ownerChain: owners.map(ownerName).reverse(),
      ...(nearest ? withProps(nearest) : {}),
      build: 'development',
    };
  }

  const component = owners[placed];
  const via = placed > 0 ? candidates[placed] : undefined;
  const source = placements[placed]?.source;
  return {
    ...(component ? { componentName: ownerName(component) } : {}),
    ...(via ? { via: ownerName(via) } : {}),
    ownerChain: owners.filter((_, index) => placements[index]?.app).map(ownerName).reverse(),
    ...(component ? withProps(component) : {}),
    ...(source ? { source } : {}),
    build: 'development',
  };
}
