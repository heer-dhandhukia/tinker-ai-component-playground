import { describe, expect, it } from 'vitest';
import { callSiteFromStack, describeFiber, findFiber } from '../../src/bridge/react';

// --- helpers that build fibers shaped like the ones scripts/dump-fibers.mjs observed ---
const FORWARD_REF = Symbol.for('react.forward_ref');
const MEMO = Symbol.for('react.memo');
const fn = (name: string) => Object.defineProperty(() => null, 'name', { value: name });
const forwardRef = (displayName: string) => ({ $$typeof: FORWARD_REF, displayName, render: () => null });

const stack19 = (creator: string, component: string, url: string) => ({
  stack: [
    'Error: react-stack-top-frame',
    `    at exports.${creator} (http://localhost:5173/node_modules/.vite/deps/react.js?v=328e60f8:197:25)`,
    component ? `    at ${component} (${url})` : `    at ${url}`,
    '    at Object.react_stack_bottom_frame (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=328e60f8:14142:12)',
  ].join('\n'),
});

interface FakeFiber {
  tag: number;
  type: unknown;
  return: FakeFiber | null;
  memoizedProps: unknown;
  _debugOwner?: FakeFiber | null;
  _debugStack?: { stack: string };
  _debugSource?: { fileName: string; lineNumber: number; columnNumber?: number } | null;
}

/** React 19: every fiber has _debugOwner and _debugStack. */
function fiber19(type: unknown, owner: FakeFiber | null, stack: { stack: string }, props: unknown = {}): FakeFiber {
  return { tag: typeof type === 'string' ? 5 : 0, type, return: owner, memoizedProps: props, _debugOwner: owner, _debugStack: stack };
}
/** React 18: _debugOwner and _debugSource (undefined for elements created inside libraries). */
function fiber18(type: unknown, owner: FakeFiber | null, source: FakeFiber['_debugSource'], props: unknown = {}): FakeFiber {
  return { tag: typeof type === 'string' ? 5 : 0, type, return: owner, memoizedProps: props, _debugOwner: owner, _debugSource: source };
}

const SRC = 'http://localhost:5173/src';
const DEPS = 'http://localhost:5173/node_modules/.vite/deps';

describe('callSiteFromStack', () => {
  it('returns the frame after the JSX factory', () => {
    expect(callSiteFromStack(stack19('jsxDEV', 'Navbar', `${SRC}/components/Navbar.tsx:10:25`).stack)).toEqual({
      file: 'src/components/Navbar.tsx',
    });
  });

  it('handles anonymous frames and strips the query string', () => {
    expect(callSiteFromStack(stack19('createElement', '', `${DEPS}/styled-components.js?v=328e60f8:1469:178`).stack)).toEqual({
      file: 'node_modules/.vite/deps/styled-components.js',
    });
  });

  it('returns null for stacks it cannot read', () => {
    expect(callSiteFromStack('')).toBeNull();
    expect(callSiteFromStack('Error: react-stack-top-frame\n    at exports.jsxDEV (x.js:1:1)')).toBeNull();
  });
});

describe('describeFiber on React 19 fibers', () => {
  const app = fiber19(fn('App'), null, stack19('jsxDEV', '', `${SRC}/main.tsx:8:5`));

  it('host element written directly in an app component', () => {
    const card = fiber19(fn('UserCard'), app, stack19('jsxDEV', 'App', `${SRC}/App.tsx:20:11`), {
      name: 'Ada Lovelace', role: 'Staff Engineer', team: 'Platform',
    });
    const h2 = fiber19('h2', card, stack19('jsxDEV', 'UserCard', `${SRC}/components/UserCard.tsx:8:20`));
    expect(describeFiber(h2, 'full')).toEqual({
      componentName: 'UserCard',
      ownerChain: ['App', 'UserCard'],
      props: { name: 'Ada Lovelace', role: 'Staff Engineer', team: 'Platform' },
      source: { file: 'src/components/UserCard.tsx' },
      build: 'development',
    });
  });

  it('styled-components button resolves to the app component, via styled.button', () => {
    const primary = fiber19(fn('PrimaryButton'), app, stack19('jsxDEV', 'App', `${SRC}/App.tsx:30:11`), { onClick: () => {} });
    const styled = fiber19(forwardRef('styled.button'), primary, stack19('jsxDEV', 'PrimaryButton', `${SRC}/components/PrimaryButton.tsx:22:10`));
    const button = fiber19('button', styled, stack19('createElement', 'y', `${DEPS}/styled-components.js?v=328e60f8:1470:4`));
    const info = describeFiber(button, 'full');
    expect(info.componentName).toBe('PrimaryButton');
    expect(info.via).toBe('styled.button');
    expect(info.ownerChain).toEqual(['App', 'PrimaryButton']);
    expect(info.source).toEqual({ file: 'src/components/PrimaryButton.tsx' });
    expect(info.props).toEqual({ onClick: '[fn]' });
  });

  it('MUI button skips four library layers', () => {
    const lib = (name: string) => stack19('createElement', name, `${DEPS}/DefaultPropsProvider-PuQ0Jb6B.js?v=328e60f8:3267:10`);
    const dialog = fiber19(fn('SettingsDialog'), app, stack19('jsxDEV', 'App', `${SRC}/App.tsx:40:11`));
    const button = fiber19(forwardRef('Button'), dialog, stack19('jsxDEV', 'SettingsDialog', `${SRC}/components/SettingsDialog.tsx:14:7`));
    const root = fiber19(forwardRef('MuiButtonRoot'), button, lib('Button'));
    const base = fiber19(forwardRef('ButtonBase'), root, lib('MuiButton-root'));
    const baseRoot = fiber19(forwardRef('MuiButtonBaseRoot'), base, lib('ButtonBase'));
    const host = fiber19('button', baseRoot, lib('MuiButtonBase-root'));
    const info = describeFiber(host, 'name');
    expect(info.componentName).toBe('SettingsDialog');
    expect(info.via).toBe('Button');
    expect(info.ownerChain).toEqual(['App', 'SettingsDialog']);
    expect(info.props).toBeUndefined(); // 'name' detail skips props
  });
});

describe('describeFiber on React 18 fibers', () => {
  const ROOT = '/Users/dev/app/src';
  const app = fiber18(fn('App'), null, { fileName: `${ROOT}/main.tsx`, lineNumber: 8, columnNumber: 5 });
  const card = fiber18(fn('ProfileCard'), app, { fileName: `${ROOT}/App.tsx`, lineNumber: 7, columnNumber: 7 }, { name: 'Grace Hopper' });

  it('reads file, line and column from _debugSource', () => {
    const div = fiber18('div', card, { fileName: `${ROOT}/components/ProfileCard.tsx`, lineNumber: 11, columnNumber: 5 });
    expect(describeFiber(div, 'full')).toEqual({
      componentName: 'ProfileCard',
      ownerChain: ['App', 'ProfileCard'],
      props: { name: 'Grace Hopper' },
      source: { file: `${ROOT}/components/ProfileCard.tsx`, line: 11, column: 5 },
      build: 'development',
    });
  });

  it('treats elements without _debugSource as library-created', () => {
    const lib = fiber18(forwardRef('Tooltip'), card, { fileName: `${ROOT}/components/ProfileCard.tsx`, lineNumber: 14, columnNumber: 9 });
    const host = fiber18('span', lib, undefined);
    const info = describeFiber(host, 'name');
    expect(info.componentName).toBe('ProfileCard');
    expect(info.via).toBe('Tooltip');
    expect(info.source).toEqual({ file: `${ROOT}/components/ProfileCard.tsx`, line: 14, column: 9 });
  });

  it('falls back to the nearest owner when no element has source info', () => {
    const bare = fiber18(fn('Widget'), null, undefined);
    const host = fiber18('div', bare, undefined);
    const info = describeFiber(host, 'name');
    expect(info.componentName).toBe('Widget');
    expect(info.ownerChain).toEqual(['Widget']);
    expect(info.source).toBeUndefined();
  });
});

describe('describeFiber on production fibers', () => {
  it('uses the return chain and flags the build', () => {
    const app: FakeFiber = { tag: 0, type: fn('a'), return: null, memoizedProps: {} };
    const card: FakeFiber = { tag: 0, type: fn('Xe'), return: app, memoizedProps: { id: 3 } };
    const wrapper: FakeFiber = { tag: 5, type: 'section', return: card, memoizedProps: {} };
    const host: FakeFiber = { tag: 5, type: 'h2', return: wrapper, memoizedProps: {} };
    expect(describeFiber(host, 'full')).toEqual({
      componentName: 'Xe',
      ownerChain: ['a', 'Xe'],
      props: { id: 3 },
      build: 'production',
    });
  });

  it('reports no component for a host element outside any component', () => {
    const host: FakeFiber = { tag: 5, type: 'div', return: { tag: 3, type: null, return: null, memoizedProps: null }, memoizedProps: {} };
    expect(describeFiber(host, 'name')).toEqual({ ownerChain: [], build: 'production' });
  });
});

describe('component names', () => {
  const host = (type: unknown): FakeFiber => {
    const owner: FakeFiber = { tag: 0, type, return: null, memoizedProps: {} };
    return { tag: 5, type: 'div', return: owner, memoizedProps: {} };
  };
  it('prefers displayName, unwraps memo and forwardRef, and names anonymous components', () => {
    expect(describeFiber(host(Object.assign(fn('x'), { displayName: 'Fancy' })), 'name').componentName).toBe('Fancy');
    expect(describeFiber(host({ $$typeof: MEMO, type: fn('Row') }), 'name').componentName).toBe('Row');
    expect(describeFiber(host({ $$typeof: FORWARD_REF, render: fn('Input') }), 'name').componentName).toBe('Input');
    expect(describeFiber(host(fn('')), 'name').componentName).toBe('Anonymous');
  });
});

describe('findFiber', () => {
  it('matches the fiber key by prefix', () => {
    const fiber = { tag: 5 };
    expect(findFiber({ __reactProps$abc: {}, __reactFiber$abc: fiber })).toBe(fiber);
  });
  it('returns null on nodes React does not own', () => {
    expect(findFiber({})).toBeNull();
    expect(findFiber({ __reactFiber$abc: 'not a fiber' })).toBeNull();
  });
});
