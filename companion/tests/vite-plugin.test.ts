import { describe, expect, it } from 'vitest';
import tinkerSrc, { addSourceAttributes } from '../src/vite-plugin.js';

describe('addSourceAttributes', () => {
  it('stamps host elements and components with file:line:column (1-based)', () => {
    const code = ['export function Card() {', '  return (', '    <article className="card">', '      <Button variant="x">Go</Button>', '    </article>', '  );', '}'].join('\n');
    expect(addSourceAttributes(code, 'src/Card.tsx').split('\n').slice(2, 4)).toEqual([
      '    <article data-tinker-src="src/Card.tsx:3:5" className="card">',
      '      <Button data-tinker-src="src/Card.tsx:4:7" variant="x">Go</Button>',
    ]);
  });

  it('keeps every element on its original line', () => {
    const code = 'const a = (\n  <ul>\n    <li>one</li>\n    <li>two</li>\n  </ul>\n);\n';
    expect(addSourceAttributes(code, 'a.tsx').split('\n')).toHaveLength(code.split('\n').length);
  });

  it('leaves fragments, React built-ins and member expressions alone', () => {
    const code = 'const a = <><Fragment><Ctx.Provider value={1}><motion.div /></Ctx.Provider></Fragment><Suspense /></>;';
    expect(addSourceAttributes(code, 'a.tsx')).toBe(code);
  });

  it('handles generic components and self-closing elements', () => {
    expect(addSourceAttributes('const a = <List<string> items={x} />;', 'a.tsx')).toBe('const a = <List<string> data-tinker-src="a.tsx:1:11" items={x} />;');
    expect(addSourceAttributes('const a = <br/>;', 'a.tsx')).toBe('const a = <br data-tinker-src="a.tsx:1:11"/>;');
  });

  it('does not stamp twice, and returns unparseable code unchanged', () => {
    const once = addSourceAttributes('const a = <p>x</p>;', 'a.tsx');
    expect(addSourceAttributes(once, 'a.tsx')).toBe(once);
    expect(addSourceAttributes('const a = <p', 'a.tsx')).toBe('const a = <p');
  });
});

describe('tinkerSrc plugin', () => {
  const plugin = tinkerSrc() as any;
  plugin.configResolved({ root: '/project' });

  it('is dev-only and runs before other transforms', () => {
    expect(plugin.apply).toBe('serve');
    expect(plugin.enforce).toBe('pre');
  });

  it('transforms project JSX files with root-relative paths', () => {
    expect(plugin.transform('const a = <p>x</p>;', '/project/src/App.tsx?v=1').code).toContain('data-tinker-src="src/App.tsx:1:11"');
  });

  it('skips non-JSX files, node_modules and files outside the root', () => {
    expect(plugin.transform('const a = 1;', '/project/src/a.ts')).toBeNull();
    expect(plugin.transform('const a = <p/>;', '/project/node_modules/x/a.jsx')).toBeNull();
    expect(plugin.transform('const a = <p/>;', '/elsewhere/a.tsx')).toBeNull();
    expect(plugin.transform('const a = 1;', '/project/src/a.tsx')).toBeNull();
  });
});
