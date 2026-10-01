import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, PLAYGROUND_URL } from './fixtures';
import { sessionTest as test, type Session } from './session';

// Golden files: one export per styling-system section of the playground, produced from the
// real page. Regenerate with `UPDATE_GOLDEN=1 npm run test:e2e -- export` and review the diff.
const GOLDEN_DIR = path.resolve('tests/golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

async function readExport(panel: Page, tab: 'Change brief' | 'CSS overrides' | 'JSON changeset'): Promise<string> {
  await panel.getByRole('tab', { name: tab }).click();
  return panel.getByTestId('export-output').inputValue();
}

/** Random ids and the timestamp are the only parts of an export that differ between runs. */
function normaliseChangeset(json: string): string {
  const ids = [...new Set([...json.matchAll(/"tinkerId": "([^"]+)"/g)].map((match) => match[1]!))];
  let out = json.replace(/"exportedAt": "[^"]+"/, '"exportedAt": "2026-01-01T00:00:00.000Z"');
  ids.forEach((id, index) => (out = out.replaceAll(`"tinkerId": "${id}"`, `"tinkerId": "id-${index + 1}"`)));
  return out;
}

function compare(name: string, actual: string) {
  const file = path.join(GOLDEN_DIR, name);
  if (UPDATE || !existsSync(file)) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, actual);
    if (!UPDATE) throw new Error(`Golden file ${name} did not exist and was created; review it and re-run.`);
    return;
  }
  expect(actual, `${name} differs from its golden file`).toBe(readFileSync(file, 'utf8'));
}

async function expectGolden(panel: Page, section: string) {
  compare(`${section}.md`, await readExport(panel, 'Change brief'));
  compare(`${section}.css`, await readExport(panel, 'CSS overrides'));
  compare(`${section}.json`, normaliseChangeset(await readExport(panel, 'JSON changeset')));
}

const SECTIONS: { name: string; edit: (session: Session) => Promise<void> }[] = [
  {
    name: 'css-modules-card',
    edit: async ({ page, panel, pick, setStyle }) => {
      await pick(page.locator('[data-section="css-modules"] article'));
      await setStyle('padding-top', '13px');
      await panel.getByTestId('suggestion-padding-top').getByRole('button', { name: 'Use token' }).click();
      await setStyle('border-radius', '16px');
    },
  },
  {
    name: 'scss-navbar',
    edit: async ({ page, pick, setStyle }) => {
      await pick(page.locator('nav.navbar'));
      await setStyle('padding-left', '32px');
      await pick(page.locator('.navbar__link--active'));
      await setStyle('font-weight', '700');
    },
  },
  {
    name: 'styled-components-button',
    edit: async ({ page, pick, setStyle }) => {
      await pick(page.locator('[data-section="styled-components"] button'));
      await setStyle('border-radius', '20px');
      await setStyle('letter-spacing', '0.5px');
    },
  },
  {
    name: 'mui-button',
    edit: async ({ page, pick, setStyle }) => {
      await pick(page.locator('[data-section="mui"] button'));
      await setStyle('border-radius', '12px');
      await setStyle('font-weight', '700');
    },
  },
  {
    name: 'tailwind-hero',
    edit: async ({ page, pick, setStyle }) => {
      await pick(page.locator('[data-section="tailwind"] > div'));
      await setStyle('padding-top', '48px');
      await setStyle('border-radius', '24px');
    },
  },
  {
    name: 'inline-banner',
    edit: async ({ page, panel, pick, setStyle }) => {
      await page.getByRole('button', { name: 'Show promo' }).click();
      await pick(page.getByTestId('promo-banner'));
      await setStyle('padding-top', '20px');
      await panel.getByLabel('Text').fill('Launch month: every plan is 20% off.');
      await panel.getByLabel('Text').blur();
    },
  },
];

test.describe('golden exports from the playground', () => {
  for (const section of SECTIONS) {
    test(section.name, async ({ open }) => {
      const session = await open(PLAYGROUND_URL);
      await section.edit(session);
      await expect(session.panel.getByTestId('change-list')).toContainText('Changes (2)');
      await expectGolden(session.panel, section.name);
    });
  }
});

test('nothing to export until a change is made', async ({ open }) => {
  const { page, panel, pick } = await open(PLAYGROUND_URL);
  await pick(page.locator('nav.navbar'));
  await expect(panel.getByTestId('export-panel')).toContainText('Make a change to export it.');
});

test('copy puts the brief on the clipboard', async ({ open }) => {
  const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
  await pick(page.locator('[data-section="css-modules"] article'));
  await setStyle('border-radius', '16px');

  await panel.bringToFront();
  const shown = await readExport(panel, 'Change brief');
  await panel.getByTestId('export-panel').getByRole('button', { name: 'Copy' }).click();
  await expect(panel.getByTestId('export-status')).toHaveText('Change brief copied to the clipboard.');
  // Read the clipboard back by pasting into a text field.
  const scratch = panel.getByLabel('Instruction for the AI');
  await scratch.focus();
  await panel.keyboard.press('ControlOrMeta+V');
  await expect(scratch).toHaveValue(shown);
});

test('download saves each format as a file', async ({ open }) => {
  const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
  await pick(page.locator('[data-section="css-modules"] article'));
  await setStyle('border-radius', '16px');

  for (const [tab, filename] of [['Change brief', 'tinker-brief.md'], ['CSS overrides', 'tinker-overrides.css'], ['JSON changeset', 'tinker-changeset.json']] as const) {
    const shown = await readExport(panel, tab);
    const [file] = await Promise.all([
      panel.waitForEvent('download'),
      panel.getByTestId('export-panel').getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(file.suggestedFilename()).toBe(filename);
    expect(readFileSync(await file.path(), 'utf8')).toBe(shown);
  }
});

test('the export follows undo, and survives a reload and restore', async ({ open, activateOn }) => {
  const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
  await pick(page.locator('[data-section="css-modules"] article'));
  await setStyle('border-radius', '16px');
  await setStyle('padding-top', '40px');
  expect(await readExport(panel, 'CSS overrides')).toContain('padding-top: 40px;');
  await panel.getByRole('button', { name: 'Undo' }).click();
  const css = await readExport(panel, 'CSS overrides');
  expect(css).not.toContain('padding-top');
  const brief = await readExport(panel, 'Change brief');

  // Element details are saved with the session, so the brief is the same after a restore
  // even though nothing has been selected again.
  await page.reload();
  await activateOn(PLAYGROUND_URL);
  await panel.getByRole('button', { name: 'Restore' }).click();
  await expect(panel.getByTestId('change-list')).toContainText('Changes (1)');
  expect(await readExport(panel, 'Change brief')).toBe(brief);
});

test('before/after screenshots report why they are unavailable when the page is hidden', async ({ open }) => {
  const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
  await pick(page.locator('[data-section="css-modules"] article'));
  await setStyle('border-radius', '16px');
  await panel.bringToFront(); // in e2e the panel is an ordinary tab, so the page is hidden
  await panel.getByRole('button', { name: 'Before / after screenshots' }).click();
  await expect(panel.getByTestId('export-status')).toHaveText('No screenshots: the page is not the visible tab.');
  await expect(page.locator('[data-section="css-modules"] article')).toHaveCSS('border-radius', '16px');
});
