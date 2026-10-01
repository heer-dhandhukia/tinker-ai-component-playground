import { describe, expect, it } from 'vitest';
import { classifyToken, parseColour, parseLengthPx, suggestToken, type DesignToken } from '../../src/shared/tokens';

const token = (name: string, value: string): DesignToken => ({ name, value, category: classifyToken(name, value) });
// The playground's token sheet (fixtures/playground-app/src/styles/tokens.css).
const TOKENS: DesignToken[] = [
  token('--color-bg', '#f7f7f9'), token('--color-surface', '#ffffff'), token('--color-text', '#1c1d22'),
  token('--color-primary', '#4f46e5'), token('--color-primary-strong', '#3730a3'), token('--color-accent', '#0d9488'),
  token('--space-1', '4px'), token('--space-2', '8px'), token('--space-3', '12px'), token('--space-4', '16px'),
  token('--space-5', '24px'), token('--space-6', '32px'), token('--space-7', '48px'),
  token('--radius-sm', '4px'), token('--radius-md', '8px'), token('--radius-lg', '16px'), token('--radius-full', '9999px'),
  token('--shadow-sm', '0 1px 2px rgb(0 0 0 / 0.08)'), token('--shadow-md', '0 4px 12px rgb(0 0 0 / 0.1)'),
  token('--font-sans', "system-ui, -apple-system, 'Segoe UI', sans-serif"),
  token('--font-size-sm', '13px'), token('--font-size-md', '15px'), token('--font-size-lg', '20px'),
];

describe('parsing', () => {
  it('reads px and rem lengths', () => {
    expect(parseLengthPx('13px')).toBe(13);
    expect(parseLengthPx('0.75rem')).toBe(12);
    expect(parseLengthPx('0')).toBe(0);
    expect(parseLengthPx('1.5em')).toBeNull();
    expect(parseLengthPx('auto')).toBeNull();
    expect(parseLengthPx('12px 8px')).toBeNull();
  });

  it('reads hex and rgb colours', () => {
    expect(parseColour('#4f46e5')).toEqual({ r: 79, g: 70, b: 229, a: 1 });
    expect(parseColour('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour('#00000080')?.a).toBeCloseTo(0.5, 1);
    expect(parseColour('rgb(79, 70, 229)')).toEqual({ r: 79, g: 70, b: 229, a: 1 });
    expect(parseColour('rgba(0, 0, 0, 0.1)')).toEqual({ r: 0, g: 0, b: 0, a: 0.1 });
    expect(parseColour('rgb(0 0 0 / 0.08)')).toEqual({ r: 0, g: 0, b: 0, a: 0.08 });
    expect(parseColour('var(--x)')).toBeNull();
    expect(parseColour('tomato')).toBeNull();
  });
});

describe('classifyToken', () => {
  it('groups the playground tokens', () => {
    const byCategory = (category: string) => TOKENS.filter((t) => t.category === category).map((t) => t.name);
    expect(byCategory('colour')).toHaveLength(6);
    expect(byCategory('spacing')).toEqual(['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7']);
    expect(byCategory('radius')).toEqual(['--radius-sm', '--radius-md', '--radius-lg', '--radius-full']);
    expect(byCategory('shadow')).toEqual(['--shadow-sm', '--shadow-md']);
    expect(byCategory('font')).toEqual(['--font-sans', '--font-size-sm', '--font-size-md', '--font-size-lg']);
  });

  it('leaves unrelated variables as other', () => {
    expect(classifyToken('--navbar-height', '56px')).toBe('other');
    expect(classifyToken('--Paper-shadow', 'none')).toBe('shadow');
    expect(classifyToken('--z-modal', '1300')).toBe('other');
  });
});

describe('suggestToken', () => {
  it('snaps 13px padding to --space-3 (12px), as in SPEC.md', () => {
    expect(suggestToken('padding-top', '13px', TOKENS)).toEqual({ name: '--space-3', value: '12px', exact: false });
  });

  it('reports exact matches', () => {
    expect(suggestToken('margin-left', '16px', TOKENS)).toEqual({ name: '--space-4', value: '16px', exact: true });
    expect(suggestToken('gap', '0.5rem', TOKENS)).toEqual({ name: '--space-2', value: '8px', exact: true });
  });

  it('does not snap values that are not close to any token', () => {
    expect(suggestToken('padding-top', '20px', TOKENS)).toBeNull();
    expect(suggestToken('padding-top', '100px', TOKENS)).toBeNull();
  });

  it('breaks ties towards the smaller token, deterministically', () => {
    expect(suggestToken('padding-top', '10px', TOKENS)?.name).toBe('--space-2');
    expect(suggestToken('padding-top', '10px', [...TOKENS].reverse())?.name).toBe('--space-2');
  });

  it('uses the category that fits the property', () => {
    expect(suggestToken('border-radius', '7px', TOKENS)?.name).toBe('--radius-md');
    expect(suggestToken('font-size', '14px', TOKENS)?.name).toBe('--font-size-sm');
    expect(suggestToken('padding-top', '9999px', TOKENS)).toBeNull(); // radius token, wrong category
    expect(suggestToken('width', '12px', TOKENS)).toBeNull(); // sizes are not spacing
  });

  it('snaps colours to the nearest colour token', () => {
    expect(suggestToken('color', '#4f46e5', TOKENS)).toEqual({ name: '--color-primary', value: '#4f46e5', exact: true });
    expect(suggestToken('background-color', 'rgb(80, 72, 230)', TOKENS)).toEqual({ name: '--color-primary', value: '#4f46e5', exact: false });
    expect(suggestToken('color', '#ff0000', TOKENS)).toBeNull();
  });

  it('matches shadows only when identical', () => {
    expect(suggestToken('box-shadow', '0 4px  12px rgb(0 0 0 / 0.1)', TOKENS)?.name).toBe('--shadow-md');
    expect(suggestToken('box-shadow', '0 4px 14px rgb(0 0 0 / 0.1)', TOKENS)).toBeNull();
  });

  it('suggests nothing for values that already use a variable, or cannot be parsed', () => {
    expect(suggestToken('padding-top', 'var(--space-3)', TOKENS)).toBeNull();
    expect(suggestToken('padding-top', 'auto', TOKENS)).toBeNull();
    expect(suggestToken('padding-top', '13px', [])).toBeNull();
  });
});
