import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ElementMeta } from '../../src/shared/element-info';
import {
  changesetSchema,
  editLocations,
  exportBrief,
  exportChangeset,
  exportCss,
  inputFromChangeset,
  serializeChangeset,
  type ExportInput,
} from '../../src/shared/export';
import type { Change } from '../../src/shared/types';

const GOLDEN_DIR = path.resolve(import.meta.dirname, '../golden');
// One export per styling-system section of the playground (fixtures/MANIFEST.md). The files are
// produced from the real fixture by tests/e2e/export.spec.ts (UPDATE_GOLDEN=1) and reviewed.
const SECTIONS = ['css-modules-card', 'scss-navbar', 'styled-components-button', 'mui-button', 'tailwind-hero', 'inline-banner'];

describe('golden exports', () => {
  it('has a golden changeset, brief and CSS for every section', () => {
    const files = existsSync(GOLDEN_DIR) ? readdirSync(GOLDEN_DIR) : [];
    for (const section of SECTIONS) {
      for (const extension of ['json', 'md', 'css']) expect(files).toContain(`${section}.${extension}`);
    }
  });

  for (const section of SECTIONS) {
    const read = (extension: string) => readFileSync(path.join(GOLDEN_DIR, `${section}.${extension}`), 'utf8');

    it(`${section}: the changeset is valid v1 and round-trips`, () => {
      const changeset = changesetSchema.parse(JSON.parse(read('json')));
      expect(changeset.version).toBe(1);
      expect(serializeChangeset(exportChangeset(inputFromChangeset(changeset), changeset.exportedAt))).toBe(read('json'));
    });

    it(`${section}: the brief and CSS are reproduced from the changeset`, () => {
      const input = inputFromChangeset(changesetSchema.parse(JSON.parse(read('json'))));
      expect(exportBrief(input)).toBe(read('md'));
      expect(exportCss(input)).toBe(read('css'));
    });
  }
});

// ---- behaviour that the fixture sections do not cover ----

const change = (over: Partial<Change>): Change => ({
  id: 'c', target: { tinkerId: 'el000001', cssPath: 'main > div:nth-of-type(2)' }, kind: 'style',
  property: 'padding-top', before: '16px', after: '24px', origin: 'manual', createdAt: 1, ...over,
});
const meta = (over: Partial<ElementMeta>): ElementMeta => ({ tag: 'div', classes: [], styling: [{ system: 'unknown', evidence: [] }], ...over });
const input = (changes: Change[], elements: Record<string, ElementMeta> = {}): ExportInput => ({ pageUrl: 'http://localhost:3000/app', changes, elements });

describe('editLocations', () => {
  const locate = (m: ElementMeta, changes: Change[] = [change({})]) => editLocations({ meta: m, changes }, m.tag);

  it("maps a CSS Module class to its file and local name, as in SPEC.md's example", () => {
    expect(locate(meta({ styling: [{ system: 'css-modules', evidence: [], classes: ['Card_title__x7Ab2'] }] }))).toEqual([
      'CSS Modules: class `Card_title__x7Ab2` → `Card.module.(s)css` → `.title`',
    ]);
  });

  it('uses the real file name when the stylesheet was readable', () => {
    const [line] = locate(meta({ styling: [{ system: 'css-modules', evidence: [], classes: ['Card_title__x7Ab2'], moduleFile: 'Card.module.scss' }] }));
    expect(line).toBe('CSS Modules: class `Card_title__x7Ab2` → `Card.module.scss` → `.title`');
  });

  it("handles Vite's default CSS Module names", () => {
    const [line] = locate(meta({ styling: [{ system: 'css-modules', evidence: [], classes: ['_title_1a2b3_7'] }] }));
    expect(line).toContain('→ `.title`');
  });

  it('points BEM classes at their SCSS nesting', () => {
    const [line] = locate(meta({ styling: [{ system: 'scss-or-plain-css', evidence: [], classes: ['navbar__link--active'] }] }));
    expect(line).toContain('`&--active` under `&__link` inside `.navbar`');
    const [plain] = locate(meta({ styling: [{ system: 'scss-or-plain-css', evidence: [], classes: ['navbar__link'] }] }));
    expect(plain).toContain('nested as `&__link` inside `.navbar`');
  });

  it('names the MUI slot class of the placed component', () => {
    const [line] = locate(meta({ via: 'Dialog', componentName: 'SettingsDialog', styling: [{ system: 'mui', evidence: [], classes: ['MuiPaper-root', 'MuiDialog-paper', 'css-x'] }] }));
    expect(line).toContain('`sx` prop on `<Dialog>`');
    expect(line).toContain('`.MuiDialog-paper`');
  });

  it('suggests typed arbitrary utilities for Tailwind', () => {
    const [line] = locate(meta({ styling: [{ system: 'tailwind', evidence: [], confidence: 0.9, classes: ['px-4'] }] }), [
      change({ property: 'color', after: 'var(--color-primary)' }),
      change({ property: 'font-size', after: '18px' }),
      change({ property: 'box-shadow', after: '0 1px 2px rgb(0 0 0 / 0.1)' }),
    ]);
    expect(line).toContain('`text-[color:var(--color-primary)]`');
    expect(line).toContain('`text-[length:18px]`');
    expect(line).toContain('`shadow-[0_1px_2px_rgb(0_0_0_/_0.1)]`');
  });

  it('reports every system on an element', () => {
    expect(
      locate(meta({ styling: [{ system: 'css-modules', evidence: [], classes: ['A_b__12345'] }, { system: 'inline', evidence: [] }] })),
    ).toHaveLength(2);
  });
});

describe('exports without recorded element details', () => {
  const bare = input([change({})]);

  it('still produce a usable brief, CSS and changeset', () => {
    expect(exportBrief(bare)).toContain('## 1. Element — `<div>`');
    expect(exportBrief(bare)).toContain('Element details were not recorded');
    expect(exportCss(bare)).toContain('main > div:nth-of-type(2) {\n  padding-top: 24px;\n}');
    expect(exportChangeset(bare, 'now').elements[0]?.element).toBeNull();
  });
});

describe('exportCss', () => {
  it('has no !important and never writes unsafe values', () => {
    const css = exportCss(input([change({}), change({ property: 'color', after: 'red; } body { display: none' })]));
    expect(css).not.toContain('!important');
    expect(css).not.toContain('display: none');
  });

  it('cannot be broken out of through comments', () => {
    const css = exportCss(
      input([change({ kind: 'text', property: 'textContent', before: 'a */ b', after: 'c' })], { el000001: meta({ componentName: 'X*/Y' }) }),
    );
    expect(css.match(/\*\//g)?.length).toBe(css.match(/\/\*/g)?.length);
  });

  it('escapes class names with special characters in selectors', () => {
    const css = exportCss(input([change({})], { el000001: meta({ styling: [{ system: 'scss-or-plain-css', evidence: [], classes: ['md:card'] }] }) }));
    expect(css).toContain('.md\\:card {');
  });
});

describe('exportBrief', () => {
  it('keeps table cells intact when values contain pipes or backticks', () => {
    const brief = exportBrief(input([change({ property: 'box-shadow', before: 'none', after: 'a | b `c`' })]));
    expect(brief).toContain("| `box-shadow` | `none` | `a \\| b 'c'` |");
  });

  it('lists tokens once and tells the agent to keep them as variables', () => {
    const brief = exportBrief(input([
      change({ after: 'var(--space-3)', token: 'var(--space-3)' }),
      change({ id: 'd', property: 'padding-bottom', after: 'var(--space-3)', token: 'var(--space-3)' }),
    ]));
    expect(brief.match(/`var\(--space-3\)` —/g)).toHaveLength(1);
  });

  it('numbers elements in the order they were first changed', () => {
    const other = { tinkerId: 'el000002', cssPath: 'header' };
    const brief = exportBrief(input([change({}), change({ id: 'x', target: other }), change({ id: 'y', property: 'gap' })]));
    expect(brief).toContain('Elements changed: 2 · Changes: 3');
    expect(brief.indexOf('## 1.')).toBeLessThan(brief.indexOf('## 2.'));
  });

  it('warns that component names from a production build are minified', () => {
    const brief = exportBrief(input([change({})], { el000001: meta({ componentName: 'Vf', reactBuild: 'production' }) }));
    expect(brief).toContain('`Vf` is a minified name. Do not search the source for it');
    const dev = exportBrief(input([change({})], { el000001: meta({ componentName: 'UserCard', reactBuild: 'development' }) }));
    expect(dev).not.toContain('minified');
  });

  it('tells the agent to edit source, not add overrides', () => {
    expect(exportBrief(input([change({})]))).toContain('Do not add override rules');
  });
});
