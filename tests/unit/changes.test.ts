import { describe, expect, it } from 'vitest';
import { buildOverrideCss, isSafeCssValue, pageKeyOf, parseSession } from '../../src/shared/changes';
import type { Change } from '../../src/shared/types';

const change = (over: Partial<Change>): Change => ({
  id: 'c1', target: { tinkerId: 'card0001', cssPath: 'article' }, kind: 'style',
  property: 'padding-top', before: '16px', after: '24px', origin: 'manual', createdAt: 1, ...over,
});

describe('buildOverrideCss', () => {
  it('writes one rule per element, with !important', () => {
    const css = buildOverrideCss([
      change({}),
      change({ id: 'c2', property: 'gap', after: 'var(--space-3)' }),
      change({ id: 'c3', target: { tinkerId: 'title001', cssPath: 'h2' }, property: 'color', after: 'red' }),
    ]);
    expect(css).toBe(
      '[data-tinker-id="card0001"] { padding-top: 24px !important; gap: var(--space-3) !important; }\n' +
        '[data-tinker-id="title001"] { color: red !important; }\n',
    );
  });

  it('skips text changes, unknown properties and unsafe values', () => {
    const css = buildOverrideCss([
      change({ kind: 'text', property: 'textContent', after: 'Hello' }),
      change({ property: 'behavior', after: 'url(x.htc)' }),
      change({ property: 'color', after: 'red; } body { display: none' }),
      change({ property: 'color', after: 'red !important' }),
      change({ target: { tinkerId: 'x"] , body [x="', cssPath: 'p' } }),
    ]);
    expect(css).toBe('');
  });

  it('returns an empty sheet for no changes', () => {
    expect(buildOverrideCss([])).toBe('');
  });
});

describe('isSafeCssValue', () => {
  it('accepts ordinary values', () => {
    for (const value of ['12px', 'var(--space-3)', 'rgb(0 0 0 / 0.1)', '0 4px 12px rgba(0,0,0,.1)', 'calc(100% - 8px)', '"Segoe UI", sans-serif']) {
      expect(isSafeCssValue(value)).toBe(true);
    }
  });
  it('rejects anything that could break out of the declaration', () => {
    for (const value of ['', 'red; color: blue', 'red } a {', 'red !important', 'url(https://evil.example/x)', '</style>', 'a\nb', 'x'.repeat(600)]) {
      expect(isSafeCssValue(value)).toBe(false);
    }
  });
});

describe('pageKeyOf', () => {
  it('uses origin and path, ignoring query and hash', () => {
    expect(pageKeyOf('http://localhost:5173/app/users?id=3#top')).toBe('http://localhost:5173/app/users');
    expect(pageKeyOf('not a url')).toBeNull();
  });
});

describe('parseSession', () => {
  it('reads a valid session', () => {
    const session = { version: 1, changes: [change({})], reapply: true, updatedAt: 5, elements: {} };
    expect(parseSession(session)).toEqual(session);
  });
  it('rejects other versions and corrupt data', () => {
    expect(parseSession({ version: 2, changes: [], reapply: false, updatedAt: 1 })).toBeNull();
    expect(parseSession({ version: 1, changes: [{ id: 1 }], reapply: false, updatedAt: 1 })).toBeNull();
    expect(parseSession(undefined)).toBeNull();
  });
});
