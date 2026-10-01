import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyPlan, createPlan } from '../../companion/src/plan.js';
import { startServer } from '../../companion/src/server.js';
import { expect, PLAYGROUND_WITH_SOURCE_URL } from './fixtures';
import { sessionTest as test } from './session';

const FIXTURE_SRC = path.resolve('fixtures/playground-app/src');

/** A throwaway copy of the playground source; the companion must never write to the real fixture. */
function tempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tinker-e2e-'));
  fs.cpSync(FIXTURE_SRC, path.join(root, 'src'), { recursive: true });
  return root;
}

function positionOf(file: string, needle: string): string {
  const text = fs.readFileSync(path.join(FIXTURE_SRC, '..', file), 'utf8');
  const before = text.slice(0, text.indexOf(needle)).split('\n');
  return `${file}:${before.length}:${before.at(-1)!.length + 1}`;
}

test.describe('React 19 with the tinker-src plugin', () => {
  test('the inspector shows file:line:column for host elements and library components', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_WITH_SOURCE_URL);

    await pick(page.locator('[data-section="css-modules"] article'));
    await expect(panel.getByTestId('component-name')).toHaveText('UserCard');
    await expect(panel.getByTestId('source')).toHaveText(positionOf('src/components/UserCard.tsx', '<article className={styles.card}>'));

    // MUI forwards the attribute from <Button> to the DOM button, so the usage site is known.
    await pick(page.locator('[data-section="mui"] button'));
    await expect(panel.getByTestId('component-via')).toHaveText('Button');
    await expect(panel.getByTestId('source')).toHaveText(positionOf('src/components/SettingsDialog.tsx', '<Button variant="contained" onClick={() => setOpen(true)}>'));
  });

  test('full loop: edit the MUI button in the browser, export, plan, approve, source is updated', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_WITH_SOURCE_URL);
    await pick(page.locator('[data-section="mui"] button'));
    await setStyle('border-radius', '12px');
    await expect(page.locator('[data-section="mui"] button')).toHaveCSS('border-radius', '12px');
    await panel.getByRole('tab', { name: 'JSON changeset' }).click();
    const changeset = JSON.parse(await panel.getByTestId('export-output').inputValue());

    const root = tempProject();
    const plan = createPlan(root, changeset);
    const [option] = plan.elements[0]!.options;
    expect(option).toMatchObject({ status: 'ready', scope: 'element', file: 'src/components/SettingsDialog.tsx' });
    expect(option.diff).toContain(`+      <Button variant="contained" onClick={() => setOpen(true)} sx={{ borderRadius: '12px' }}>`);

    expect(applyPlan(plan, [option.id])).toMatchObject({ failed: [], written: [{ file: 'src/components/SettingsDialog.tsx' }] });
    const written = fs.readFileSync(path.join(root, 'src/components/SettingsDialog.tsx'), 'utf8');
    expect(written).toContain(`<Button variant="contained" onClick={() => setOpen(true)} sx={{ borderRadius: '12px' }}>`);
    // The other two <Button> elements in the file are untouched.
    expect(written.match(/sx=/g)).toHaveLength(1);
    // And the real fixture was not written to.
    expect(fs.readFileSync(path.join(FIXTURE_SRC, 'components/SettingsDialog.tsx'), 'utf8')).not.toContain('sx=');
  });
});

test.describe('companion review page', () => {
  test('shows the diff, writes nothing until approved, then writes the approved file', async ({ context }) => {
    const root = tempProject();
    const server = await startServer({ root, port: 0 });
    const file = path.join(root, 'src/components/UserCard.module.css');
    const page = await context.newPage();
    await page.goto(server.url);
    await expect(page.locator('#root')).toHaveText(root.replace(/^\/var\//, '/private/var/'));

    await page.getByLabel('Changeset JSON').fill(fs.readFileSync('tests/golden/css-modules-card.json', 'utf8'));
    await page.getByRole('button', { name: 'Show proposed edits' }).click();
    await expect(page.getByRole('heading', { name: '1. UserCard <article>' })).toBeVisible();
    await expect(page.locator('pre.diff')).toContainText('+  padding-top: var(--space-3);');
    await expect(page.locator('#summary')).toHaveText('1 of 1 elements will be written');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('padding-top');

    // Declining the confirmation writes nothing.
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: 'Apply approved changes' }).click();
    expect(fs.readFileSync(file, 'utf8')).not.toContain('padding-top');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Apply approved changes' }).click();
    await expect(page.getByRole('heading', { name: '1 file(s) written' })).toBeVisible();
    expect(fs.readFileSync(file, 'utf8')).toContain('  padding-top: var(--space-3);\n}');
    await server.close();
  });

  test('"Do not write this element" and unresolved options leave nothing to apply', async ({ context }) => {
    const root = tempProject();
    const server = await startServer({ root, port: 0 });
    const page = await context.newPage();
    await page.goto(server.url);
    await page.getByLabel('Changeset JSON').fill(fs.readFileSync('tests/golden/mui-button.json', 'utf8'));
    await page.getByRole('button', { name: 'Show proposed edits' }).click();
    await expect(page.locator('.reason')).toContainText('3 elements in src/components/SettingsDialog.tsx match <Button>');
    await expect(page.getByRole('button', { name: 'Apply approved changes' })).toBeDisabled();
    await server.close();
  });

  test('without the session token the page cannot plan', async ({ context }) => {
    const server = await startServer({ root: tempProject(), port: 0 });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.port}/`);
    await expect(page.getByRole('alert')).toContainText('Missing or wrong session token');
    await page.getByLabel('Changeset JSON').fill(fs.readFileSync('tests/golden/css-modules-card.json', 'utf8'));
    await page.getByRole('button', { name: 'Show proposed edits' }).click();
    await expect(page.getByRole('alert')).toContainText('Missing or wrong session token');
    await server.close();
  });
});
