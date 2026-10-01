import { describe, expect, it } from 'vitest';
import { safeSerialize } from '../../src/bridge/serialize';

describe('safeSerialize', () => {
  it('keeps primitives and plain data', () => {
    expect(safeSerialize({ a: 1, b: 'x', c: true, d: null, e: [1, 2] })).toEqual({ a: 1, b: 'x', c: true, d: null, e: [1, 2] });
  });

  it('replaces functions, symbols and bigints', () => {
    expect(safeSerialize({ onClick() {}, s: Symbol('k'), n: 10n })).toEqual({ onClick: '[fn]', s: '[symbol]', n: '10n' });
  });

  it('limits depth', () => {
    expect(safeSerialize({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({ a: { b: { c: '[object]' } } });
  });

  it('survives cycles', () => {
    const loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;
    expect(safeSerialize(loop)).toEqual({ name: 'loop', self: '[circular]' });
  });

  it('summarises React elements instead of walking them', () => {
    const element = { $$typeof: Symbol.for('react.transitional.element'), type: 'span', props: { children: 'hi' } };
    expect(safeSerialize({ children: element })).toEqual({ children: '[element <span>]' });
  });

  it('never passes DOM nodes through', () => {
    const node = { nodeType: 1, nodeName: 'DIV', parentNode: {} };
    expect(safeSerialize({ ref: node })).toEqual({ ref: '[DOM node]' });
  });

  it('truncates long strings, arrays and wide objects', () => {
    const out = safeSerialize({
      text: 'x'.repeat(500),
      list: Array.from({ length: 50 }, (_, i) => i),
      wide: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i])),
    }) as { text: string; list: unknown[]; wide: Record<string, unknown> };
    expect(out.text.length).toBeLessThanOrEqual(201);
    expect(out.list).toHaveLength(21);
    expect(out.list.at(-1)).toBe('… 30 more');
    expect(Object.keys(out.wide)).toHaveLength(31);
  });

  it('swallows throwing getters', () => {
    const hostile = Object.defineProperty({ ok: 1 }, 'boom', { enumerable: true, get() { throw new Error('nope'); } });
    expect(safeSerialize(hostile)).toEqual({ ok: 1, boom: '[unreadable]' });
  });

  it('output survives structured clone', () => {
    const out = safeSerialize({ fn() {}, nested: { s: Symbol('x') }, date: new Date(0) });
    expect(() => structuredClone(out)).not.toThrow();
  });
});
