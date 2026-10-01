import { describe, expect, it } from 'vitest';
import { chooseMatch, type Candidate } from '../../src/content/refind';
import type { TargetRef } from '../../src/shared/types';

const banner: TargetRef = {
  tinkerId: 'aaaa1111',
  cssPath: '#root > div > section:nth-of-type(4) > aside',
  componentPath: ['App', 'PromoBanner'],
  textSnippet: 'Launch week: every plan is 20% off.',
};
const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  viaCssPath: true,
  componentPath: ['App', 'PromoBanner'],
  textSnippet: 'Launch week: every plan is 20% off.',
  taggedAs: null,
  ...over,
});

describe('chooseMatch', () => {
  it('accepts the single element at the same path with the same component and text', () => {
    expect(chooseMatch(banner, [candidate()])).toBe(0);
  });

  it('returns null when nothing is there', () => {
    expect(chooseMatch(banner, [])).toBeNull();
  });

  it('rejects an element at the same path that belongs to another component', () => {
    expect(chooseMatch(banner, [candidate({ componentPath: ['App', 'Hero'] })])).toBeNull();
  });

  it('rejects an element at the same path whose text differs', () => {
    // e.g. a list item removed: the path now points at the next item.
    expect(chooseMatch(banner, [candidate({ textSnippet: 'Update changelog' })])).toBeNull();
  });

  it('rejects when React info is expected but unavailable', () => {
    expect(chooseMatch(banner, [candidate({ componentPath: undefined })])).toBeNull();
  });

  it('rejects an element already tagged as a different target', () => {
    expect(chooseMatch(banner, [candidate({ taggedAs: 'bbbb2222' })])).toBeNull();
    expect(chooseMatch(banner, [candidate({ taggedAs: 'aaaa1111' })])).toBe(0);
  });

  it('refuses to guess between two equally good candidates', () => {
    expect(chooseMatch(banner, [candidate(), candidate()])).toBeNull();
  });

  it('prefers the path match over an off-path lookalike', () => {
    expect(chooseMatch(banner, [candidate({ viaCssPath: false }), candidate()])).toBe(1);
  });

  it('accepts a unique off-path element only when both component and text identify it', () => {
    // e.g. a list item that moved: path changed, but component + text are unique.
    expect(chooseMatch(banner, [candidate({ viaCssPath: false })])).toBe(0);
    const noText: TargetRef = { ...banner, textSnippet: undefined };
    expect(chooseMatch(noText, [candidate({ viaCssPath: false, textSnippet: undefined })])).toBeNull();
    const noComponent: TargetRef = { ...banner, componentPath: undefined };
    expect(chooseMatch(noComponent, [candidate({ viaCssPath: false, componentPath: undefined })])).toBeNull();
  });

  it('on a non-React page, matches on path and text alone', () => {
    const plain: TargetRef = { tinkerId: 'cccc3333', cssPath: 'body > p', textSnippet: 'Hello' };
    expect(chooseMatch(plain, [candidate({ componentPath: undefined, textSnippet: 'Hello' })])).toBe(0);
    expect(chooseMatch(plain, [candidate({ componentPath: undefined, textSnippet: 'Bye' })])).toBeNull();
  });

  it('a target that had no text only matches an element with no text', () => {
    const empty: TargetRef = { ...banner, textSnippet: undefined };
    expect(chooseMatch(empty, [candidate({ textSnippet: undefined })])).toBe(0);
    expect(chooseMatch(empty, [candidate({ textSnippet: 'now has text' })])).toBeNull();
  });
});
