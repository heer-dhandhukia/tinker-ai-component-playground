import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyPlan, createPlan, publicPlan } from '../src/plan.js';
import { changedLines, golden, positionOf, read, tempProject, write } from './helpers';

let root: string;
beforeEach(() => {
  root = tempProject();
});

const optionsOf = (plan: ReturnType<typeof createPlan>, element = 0) => plan.elements[element]!.options;
const ready = (plan: ReturnType<typeof createPlan>, element = 0) => optionsOf(plan, element).filter((option: any) => option.status === 'ready');
const snapshotTree = (dir: string): Record<string, string> =>
  Object.fromEntries(
    fs.readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [path.join(entry.parentPath, entry.name), fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8')]),
  );

describe('planning from the golden changesets (React 19, no source lines)', () => {
  it('CSS Modules card: edits the .card rule in UserCard.module.css', () => {
    const plan = createPlan(root, golden('css-modules-card'));
    const [option] = optionsOf(plan);
    expect(option).toMatchObject({ status: 'ready', scope: 'shared', file: 'src/components/UserCard.module.css' });
    expect(changedLines(option.diff)).toEqual([
      '-  border-radius: var(--radius-md);',
      '+  border-radius: 16px;',
      '+  padding-top: var(--space-3);', // new longhand goes last, so it wins over the `padding` shorthand
    ]);
    expect(plan.elements[0]!.defaultOption).toBe(option.id);
  });

  it('SCSS navbar: appends to .navbar above its nested rules', () => {
    const plan = createPlan(root, golden('scss-navbar'));
    const [option] = optionsOf(plan, 0);
    expect(option).toMatchObject({ status: 'ready', file: 'src/components/Navbar.scss' });
    expect(changedLines(option.diff)).toEqual(['+  padding-left: 32px;']);
    expect(option.diff).toMatch(/box-shadow: var\(--shadow-sm\);\n\+  padding-left: 32px;\n \n   &__brand/);
  });

  it('SCSS navbar link: refuses the rule shared with :hover, offers the nested &__link rule', () => {
    const plan = createPlan(root, golden('scss-navbar'));
    const [modifier, base] = optionsOf(plan, 1);
    expect(modifier.status).toBe('unresolved');
    expect(modifier.reason).toContain('shared with other selectors');
    expect(modifier.reason).toContain('.navbar__link:hover, .navbar__link--active');
    expect(base).toMatchObject({ status: 'ready', label: 'Stylesheet rule `.navbar__link` in src/components/Navbar.scss' });
    expect(changedLines(base.diff)).toEqual(['+    font-weight: 700;']);
    // The broader rule would restyle every link, so it is offered but not pre-selected.
    expect(plan.elements[1]!.defaultOption).toBeNull();
  });

  it('styled-components button: edits the styled.button template, keeping &:hover below', () => {
    const plan = createPlan(root, golden('styled-components-button'));
    const [option] = optionsOf(plan);
    expect(option).toMatchObject({ status: 'ready', scope: 'shared', file: 'src/components/PrimaryButton.tsx' });
    expect(changedLines(option.diff)).toEqual([
      '-  border-radius: var(--radius-md);',
      '+  border-radius: 20px;',
      '+  letter-spacing: 0.5px;',
    ]);
    expect(option.diff).toMatch(/cursor: pointer;\n\+  letter-spacing: 0\.5px;\n \n   &:hover/);
  });

  it('MUI button: three <Button> elements and no source line means unresolved, not a guess', () => {
    const plan = createPlan(root, golden('mui-button'));
    expect(ready(plan)).toEqual([]);
    const [option] = optionsOf(plan);
    expect(option.reason).toContain('3 elements in src/components/SettingsDialog.tsx match <Button>');
    expect(option.reason).toContain('tinker-src Vite plugin');
    expect(plan.elements[0]!.defaultOption).toBeNull();
  });

  it('Tailwind hero: swaps rounded-xl and adds a pt utility, leaving py-10', () => {
    const plan = createPlan(root, golden('tailwind-hero'));
    const [option] = optionsOf(plan);
    expect(option).toMatchObject({ status: 'ready', scope: 'element', file: 'src/components/Hero.tsx' });
    expect(changedLines(option.diff)).toEqual([
      '-    <div className="rounded-xl bg-indigo-600 px-8 py-10 text-white shadow-lg">',
      '+    <div className="bg-indigo-600 px-8 py-10 text-white shadow-lg pt-[48px] rounded-[24px]">',
    ]);
  });

  it('inline banner: adds paddingTop to the style object; the text change is reported, not written', () => {
    const plan = createPlan(root, golden('inline-banner'));
    const [option] = optionsOf(plan);
    expect(option).toMatchObject({ status: 'ready', file: 'src/components/PromoBanner.tsx' });
    expect(changedLines(option.diff)).toEqual(["+        paddingTop: '20px',"]);
    expect(plan.elements[0]!.skipped.join(' ')).toContain('Text change');
    expect(optionsOf(plan)).toHaveLength(1); // already inline: no separate "only this element" option
  });

  it('planning never writes', () => {
    const before = snapshotTree(root);
    for (const name of ['css-modules-card', 'scss-navbar', 'styled-components-button', 'mui-button', 'tailwind-hero', 'inline-banner']) {
      createPlan(root, golden(name));
    }
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe('planning with exact source positions (tinker-src plugin, or React 18)', () => {
  const withSource = (name: string, source: { file: string; line: number; column: number }) => {
    const changeset = golden(name);
    changeset.elements[0].element.source = source;
    return changeset;
  };

  it('MUI button: adds an sx prop to the <Button> at that position', () => {
    const source = positionOf(root, 'src/components/SettingsDialog.tsx', '<Button variant="contained" onClick={() => setOpen(true)}>');
    const plan = createPlan(root, withSource('mui-button', source));
    const [option] = optionsOf(plan);
    expect(option).toMatchObject({ status: 'ready', scope: 'element', file: 'src/components/SettingsDialog.tsx' });
    expect(changedLines(option.diff)).toEqual([
      '-      <Button variant="contained" onClick={() => setOpen(true)}>',
      "+      <Button variant=\"contained\" onClick={() => setOpen(true)} sx={{ borderRadius: '12px', fontWeight: '700' }}>",
    ]);
  });

  it('offers "only this element" next to the shared rule when the position is known', () => {
    const source = positionOf(root, 'src/components/UserCard.tsx', '<article className={styles.card}>');
    const plan = createPlan(root, withSource('css-modules-card', source));
    const [shared, instance] = optionsOf(plan);
    expect(shared).toMatchObject({ status: 'ready', scope: 'shared', file: 'src/components/UserCard.module.css' });
    expect(instance).toMatchObject({ status: 'ready', scope: 'element', label: 'Only this element: an inline `style` prop in src/components/UserCard.tsx' });
    expect(changedLines(instance.diff)).toEqual([
      '-    <article className={styles.card}>',
      "+    <article className={styles.card} style={{ paddingTop: 'var(--space-3)', borderRadius: '16px' }}>",
    ]);
    expect(plan.elements[0]!.defaultOption).toBe(shared.id);
  });

  it('accepts an absolute path inside the project (React 18 reports those)', () => {
    const source = positionOf(root, 'src/components/Hero.tsx', '<div className="rounded-xl');
    const real = fs.realpathSync(root);
    const plan = createPlan(root, withSource('tailwind-hero', { ...source, file: path.join(real, source.file) }));
    expect(optionsOf(plan)[0]).toMatchObject({ status: 'ready', file: 'src/components/Hero.tsx' });
  });

  it('reports a position that no longer points at an element', () => {
    const plan = createPlan(root, withSource('tailwind-hero', { file: 'src/components/Hero.tsx', line: 1, column: 1 }));
    expect(optionsOf(plan)[0].reason).toContain('no single JSX element starts at src/components/Hero.tsx:1:1');
  });

  it('uses the styled component named at the position when a file has several', () => {
    write(root, 'src/components/Two.tsx', [
      "import styled from 'styled-components';",
      'const Primary = styled.button`',
      '  color: red;',
      '`;',
      'const Ghost = styled.button`',
      '  color: ${(props) => props.color};',
      '  border-radius: 2px;',
      '`;',
      'export const Two = () => (<><Primary>a</Primary><Ghost>b</Ghost></>);',
    ].join('\n'));
    const changeset = golden('styled-components-button');
    changeset.elements[0].element.source = { file: 'src/components/Two.tsx' };
    expect(optionsOf(createPlan(root, changeset))[0].reason).toContain('2 styled templates for <button>');

    changeset.elements[0].element.source = positionOf(root, 'src/components/Two.tsx', '<Ghost>');
    const [option] = optionsOf(createPlan(root, changeset));
    expect(changedLines(option.diff)).toEqual(['-  border-radius: 2px;', '+  border-radius: 20px;', '+  letter-spacing: 0.5px;']);
    // The interpolation survives untouched.
    const { written } = applyPlan(createPlan(root, changeset), [option.id]);
    expect(written).toHaveLength(1);
    expect(read(root, 'src/components/Two.tsx')).toContain('color: ${(props) => props.color};\n  border-radius: 20px;\n  letter-spacing: 0.5px;\n`;');
  });
});

describe('never guessing', () => {
  it('two stylesheets with the same module file name: unresolved unless the component imports one', () => {
    write(root, 'src/other/UserCard.module.css', '.card { color: red; }\n');
    const changeset = golden('css-modules-card');
    // The component file imports ./UserCard.module.css, which settles it.
    expect(optionsOf(createPlan(root, changeset))[0]).toMatchObject({ status: 'ready', file: 'src/components/UserCard.module.css' });
    // Without a source file there is nothing to settle it with.
    delete changeset.elements[0].element.source;
    const [option] = optionsOf(createPlan(root, changeset));
    expect(option.status).toBe('unresolved');
    expect(option.reason).toContain('2 rules match `.card`');
  });

  it('the same class defined in two global stylesheets', () => {
    write(root, 'src/styles/legacy.css', '.navbar { color: red; }\n');
    const changeset = golden('scss-navbar');
    delete changeset.elements[0].element.source;
    expect(optionsOf(createPlan(root, changeset), 0)[0].reason).toContain('not guessing which one');
  });

  it('a rule that only exists inside a media query is not used', () => {
    write(root, 'src/components/Navbar.scss', '@media (min-width: 600px) { .navbar { padding: 0; } }\n');
    expect(optionsOf(createPlan(root, golden('scss-navbar')), 0)[0].reason).toContain('no rule with the selector `.navbar`');
  });

  it('a className or style prop that is not a literal is refused', () => {
    write(root, 'src/components/Hero.tsx', 'const cls = "x";\nexport const Hero = () => <div className={cls} />;\n');
    const changeset = golden('tailwind-hero');
    changeset.elements[0].element.source = { file: 'src/components/Hero.tsx', line: 2, column: 27 };
    expect(optionsOf(createPlan(root, changeset))[0].reason).toContain('className is not a plain string');

    write(root, 'src/components/PromoBanner.tsx', 'const s = {};\nexport const PromoBanner = () => <aside style={s} />;\n');
    expect(optionsOf(createPlan(root, golden('inline-banner')))[0].reason).toContain('`style` prop is not an object literal');
  });

  it('source files outside the project, or in node_modules, are refused', () => {
    write(root, 'node_modules/pkg/Button.tsx', 'export const B = () => <button style={{}} />;\n');
    const changeset = golden('inline-banner');
    for (const file of ['/etc/passwd', '../outside.tsx', 'node_modules/pkg/Button.tsx']) {
      changeset.elements[0].element.source = { file, line: 1, column: 1 };
      expect(optionsOf(createPlan(root, changeset))[0].reason).toContain('is not inside this project');
    }
  });

  it('elements without details, unknown properties and unsafe values are reported', () => {
    const changeset = golden('css-modules-card');
    changeset.elements[0].changes.push(
      { kind: 'style', property: 'position', before: 'static', after: 'fixed', origin: 'ai' },
      { kind: 'style', property: 'color', before: 'red', after: 'red; } body { display: none', origin: 'ai' },
    );
    changeset.elements.push({ target: { tinkerId: 'x', cssPath: 'p' }, element: null, changes: [{ kind: 'style', property: 'gap', before: '0', after: '1px', origin: 'manual' }] });
    const plan = createPlan(root, changeset);
    expect(plan.elements[0]!.skipped).toEqual(['`position` is not a property the companion writes.', 'The value for `color` was refused as unsafe.']);
    expect(optionsOf(plan, 0)[0].diff).not.toContain('display: none');
    expect(plan.elements[1]!.options).toEqual([]);
    expect(plan.elements[1]!.skipped[0]).toContain('no details for this element');
  });

  it('rejects anything that is not a version 1 changeset', () => {
    expect(() => createPlan(root, { ...golden('css-modules-card'), version: 2 })).toThrow();
    expect(() => createPlan(root, { hello: 'world' })).toThrow();
  });

  it('a source that already has the values produces no edit', () => {
    const plan = createPlan(root, golden('css-modules-card'));
    applyPlan(plan, [plan.elements[0]!.defaultOption!]);
    expect(optionsOf(createPlan(root, golden('css-modules-card')))[0].reason).toBe('the source already has these values');
  });
});

describe('applying', () => {
  it('writes exactly the approved option and nothing else', () => {
    const before = snapshotTree(root);
    const plan = createPlan(root, golden('css-modules-card'));
    const result = applyPlan(plan, [plan.elements[0]!.defaultOption!]);
    expect(result.failed).toEqual([]);
    expect(result.written.map((entry) => entry.file)).toEqual(['src/components/UserCard.module.css']);

    const after = snapshotTree(root);
    const changed = Object.keys(after).filter((file) => after[file] !== before[file]);
    expect(changed.map((file) => path.basename(file))).toEqual(['UserCard.module.css']);
    const css = read(root, 'src/components/UserCard.module.css');
    expect(css).toContain('  padding: var(--space-4);\n'); // the shorthand is left as it was
    expect(css).toContain('  border-radius: 16px;\n  box-shadow: var(--shadow-md);\n  padding-top: var(--space-3);\n}');
    expect(css).toContain('.title {\n  margin: 0;'); // the rest of the file is byte-identical
    expect(fs.readdirSync(path.join(root, 'src/components')).filter((name) => name.includes('.tmp'))).toEqual([]);
  });

  it('composes two approved edits to the same file', () => {
    const plan = createPlan(root, golden('scss-navbar'));
    const linkRule = optionsOf(plan, 1).find((option: any) => option.status === 'ready');
    const result = applyPlan(plan, [plan.elements[0]!.defaultOption!, linkRule.id]);
    expect(result).toMatchObject({ failed: [], written: [{ file: 'src/components/Navbar.scss' }] });
    const scss = read(root, 'src/components/Navbar.scss');
    expect(scss).toContain('  padding-left: 32px;\n');
    expect(scss).toMatch(/&__link \{\n    color: var\(--color-text-muted\);\n    text-decoration: none;\n    font-weight: 700;\n/);
  });

  it('applies nothing by default, and at most one option per element', () => {
    const source = positionOf(root, 'src/components/UserCard.tsx', '<article className={styles.card}>');
    const changeset = golden('css-modules-card');
    changeset.elements[0].element.source = source;
    const plan = createPlan(root, changeset);
    expect(applyPlan(plan, [])).toEqual({ written: [], failed: [] });
    const [shared, instance] = optionsOf(plan);
    const result = applyPlan(plan, [shared.id, instance.id, 'nope']);
    expect(result.written.map((entry) => entry.file)).toEqual(['src/components/UserCard.module.css']);
    expect(result.failed.map((entry) => entry.reason)).toEqual(['another option was already chosen for this element', 'not an applicable option of this plan']);
  });

  it('refuses to write a file that changed after the plan was made', () => {
    const plan = createPlan(root, golden('css-modules-card'));
    const file = 'src/components/UserCard.module.css';
    write(root, file, `${read(root, file)}\n/* edited by hand */\n`);
    const result = applyPlan(plan, [plan.elements[0]!.defaultOption!]);
    expect(result.written).toEqual([]);
    expect(result.failed[0]).toMatchObject({ file, reason: expect.stringContaining('changed since the plan') });
    expect(read(root, file)).toContain('/* edited by hand */');
    expect(read(root, file)).not.toContain('padding-top');
  });

  it('the public plan carries no file contents or functions', () => {
    const view = publicPlan(createPlan(root, golden('css-modules-card')));
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    expect(view).not.toHaveProperty('internal');
  });
});
