import { expect, PLAYGROUND_URL } from './fixtures';
import { sessionTest as test } from './session';

const RED = 'rgb(255, 0, 0)';
const card = '[data-section="css-modules"] article';

test.describe('edits survive React updates', () => {
  test('timer re-rendering every second keeps its override', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    const timer = page.getByTestId('timer');
    await pick(timer);
    await setStyle('padding-top', '40px');
    await expect(timer).toHaveCSS('padding-top', '40px');

    const before = await timer.innerText();
    await expect(timer).not.toHaveText(before, { timeout: 5000 }); // it re-rendered
    await page.waitForTimeout(1200);
    await expect(timer).toHaveCSS('padding-top', '40px');
    await expect(panel.getByTestId('detached-notice')).toHaveCount(0);
  });

  test('list re-ordering and growth: the override follows its item', async ({ open }) => {
    const { page, pick, setStyle } = await open(PLAYGROUND_URL);
    const items = page.getByTestId('todo-items').locator('li');
    await pick(items.nth(1));
    await setStyle('background-color', RED);
    const edited = items.filter({ hasText: 'Update changelog' });
    await expect(edited).toHaveCSS('background-color', RED);

    await page.getByRole('button', { name: 'Reverse order' }).click();
    await expect(items.nth(2)).toHaveText('Update changelog');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(items).toHaveCount(5);

    await expect(edited).toHaveCSS('background-color', RED);
    const colours = await items.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
    expect(colours.filter((colour) => colour === 'rgb(255, 0, 0)')).toHaveLength(1);
  });

  test('a removed element is detached, and its change never lands on a neighbour', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    const items = page.getByTestId('todo-items').locator('li');
    await pick(items.nth(0));
    await setStyle('background-color', RED);
    await expect(items.nth(0)).toHaveCSS('background-color', RED);

    await page.getByRole('button', { name: 'Remove first' }).click();
    await expect(items).toHaveCount(3);
    await expect(panel.getByTestId('detached-notice')).toContainText('1 element is not on the page');
    await expect(panel.locator('[data-change="background-color"]')).toHaveAttribute('data-detached', 'true');
    const colours = await items.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
    expect(colours).not.toContain('rgb(255, 0, 0)');
  });

  test('a conditionally rendered element is re-found when it mounts again', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    await page.getByRole('button', { name: 'Show promo' }).click();
    await pick(page.getByTestId('promo-banner'));
    await setStyle('padding-top', '30px');
    await expect(page.getByTestId('promo-banner')).toHaveCSS('padding-top', '30px');

    await page.getByRole('button', { name: 'Hide promo' }).click();
    await expect(panel.getByTestId('detached-notice')).toBeVisible();

    await page.getByRole('button', { name: 'Show promo' }).click();
    await expect(page.getByTestId('promo-banner')).toHaveCSS('padding-top', '30px');
    await expect(panel.getByTestId('detached-notice')).toHaveCount(0);
    // The selection follows the re-mounted element.
    await expect(panel.getByTestId('component-name')).toHaveText('PromoBanner');
  });
});

test.describe('change list', () => {
  test('undo, redo, show original and clear all', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    const article = page.locator(card);
    await pick(article);
    await setStyle('padding-top', '40px');
    await setStyle('border-radius', '20px');
    await expect(article).toHaveCSS('padding-top', '40px');
    await expect(article).toHaveCSS('border-radius', '20px');
    await expect(panel.getByTestId('change-list')).toContainText('Changes (2)');

    await panel.getByRole('button', { name: 'Undo' }).click();
    await expect(article).toHaveCSS('border-radius', '8px');
    await expect(panel.locator('input[data-property="border-radius"]')).toHaveValue('8px');
    await panel.getByRole('button', { name: 'Redo' }).click();
    await expect(article).toHaveCSS('border-radius', '20px');

    await panel.getByLabel('Show original').check();
    await expect(article).toHaveCSS('padding-top', '16px');
    await expect(article).toHaveCSS('border-radius', '8px');
    await panel.getByLabel('Show original').uncheck();
    await expect(article).toHaveCSS('padding-top', '40px');

    await panel.getByRole('button', { name: 'Clear all' }).click();
    await expect(article).toHaveCSS('padding-top', '16px');
    await expect(panel.getByTestId('change-list')).toContainText('Changes (0)');
    await panel.getByRole('button', { name: 'Undo' }).click();
    await expect(article).toHaveCSS('padding-top', '40px');
    await expect(article).toHaveCSS('border-radius', '20px');

    await panel.getByRole('button', { name: 'Reset padding-top' }).click();
    await expect(article).toHaveCSS('padding-top', '16px');
    await expect(article).toHaveCSS('border-radius', '20px');
  });

  test('invalid values are refused', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    await pick(page.locator(card));
    await setStyle('padding-top', 'banana');
    await expect(panel.getByRole('alert')).toHaveText('Not a valid value for padding-top.');
    await setStyle('padding-top', '5px; color: red');
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(page.locator(card)).toHaveCSS('padding-top', '16px');
    await expect(panel.getByTestId('change-list')).toContainText('Changes (0)');
  });

  test('text edit is applied and undone', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    const title = page.locator(`${card} h2`);
    await pick(title);
    await panel.getByLabel('Text').fill('Grace Hopper');
    await panel.getByLabel('Text').blur();
    await expect(title).toHaveText('Grace Hopper');
    await panel.getByRole('button', { name: 'Undo' }).click();
    await expect(title).toHaveText('Ada Lovelace');
  });
});

test.describe('design tokens', () => {
  test('a typed value is snapped to the nearest token on request', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    await pick(page.locator(card));
    await setStyle('padding-top', '13px');
    await expect(page.locator(card)).toHaveCSS('padding-top', '13px');
    const suggestion = panel.getByTestId('suggestion-padding-top');
    await expect(suggestion).toContainText('13px → var(--space-3) (12px)');

    await suggestion.getByRole('button', { name: 'Use token' }).click();
    await expect(page.locator(card)).toHaveCSS('padding-top', '12px');
    await expect(panel.locator('input[data-property="padding-top"]')).toHaveValue('var(--space-3)');
    await expect(panel.locator('[data-change="padding-top"]')).toContainText('token');
    await expect(panel.locator('[data-change="padding-top"]')).toContainText('16px → var(--space-3)');
  });

  test('colour token picker', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator(`${card} h2`));
    await panel.getByLabel('color token', { exact: true }).selectOption('--color-primary');
    await expect(page.locator(`${card} h2`)).toHaveCSS('color', 'rgb(79, 70, 229)');
  });
});

test.describe('per-URL sessions', () => {
  test('after a reload the saved session is offered, not applied', async ({ open, activateOn }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    await pick(page.locator(card));
    await setStyle('padding-top', '40px');
    await expect(page.locator(card)).toHaveCSS('padding-top', '40px');

    await page.reload();
    await expect(panel.getByTestId('connection-status')).toHaveText('Not active on this page');
    await activateOn(PLAYGROUND_URL);
    await expect(panel.getByTestId('pending-session')).toContainText('1 saved change');
    await expect(page.locator(card)).toHaveCSS('padding-top', '16px');

    await panel.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator(card)).toHaveCSS('padding-top', '40px');
    await expect(panel.getByTestId('detached-notice')).toHaveCount(0);
  });

  test('with "Re-apply on reload" the changes come back without activating', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    await pick(page.locator(card));
    await setStyle('padding-top', '40px');
    await panel.getByLabel('Re-apply on reload').check();
    await expect(panel.getByLabel('Re-apply on reload')).toBeChecked();

    await page.reload();
    await expect(page.locator(card)).toHaveCSS('padding-top', '40px');
    await expect(panel.getByTestId('connection-status')).toHaveText('Connected');
    await expect(panel.getByTestId('change-list')).toContainText('Changes (1)');
  });

  test('a reopened panel picks up the changes already on the page', async ({ open, openPanel }) => {
    const { page, panel, pick, setStyle, tabId } = await open(PLAYGROUND_URL);
    await pick(page.locator(card));
    await setStyle('padding-top', '40px');
    await expect(page.locator(card)).toHaveCSS('padding-top', '40px');
    await panel.close();

    const reopened = await openPanel(tabId);
    await expect(reopened.getByTestId('change-list')).toContainText('Changes (1)');
    await expect(reopened.getByTestId('component-name')).toHaveText('UserCard');
    await expect(page.locator(card)).toHaveCSS('padding-top', '40px');
  });
});

test('re-tagging on a 5,000-node page', async ({ open, serviceWorker }) => {
  const { page, tabId } = await open(`${PLAYGROUND_URL}stress.html`);
  expect(await page.evaluate(() => document.querySelectorAll('#grid *').length)).toBe(5000);

  // 20 targets spread over the page, applied the way a restored session is.
  const rows = Array.from({ length: 20 }, (_, index) => index * 50 + 1);
  const detached = await serviceWorker.evaluate(
    async ({ tabId, rows }) => {
      const changes = rows.map((row) => ({
        id: `stress-${row}`,
        target: { tinkerId: `stress-${row}`, cssPath: `#grid > div:nth-of-type(${row})`, textSnippet: `row ${row - 1}abc` },
        kind: 'style', property: 'background-color', before: 'rgba(0, 0, 0, 0)', after: 'rgb(255, 0, 0)',
        origin: 'manual', createdAt: 1,
      }));
      const result = await chrome.tabs.sendMessage(tabId, { type: 'changes/apply', changes, enabled: true });
      return result.detached as string[];
    },
    { tabId, rows },
  );
  expect(detached).toEqual([]);
  const overrides = page.locator('#tinker-overrides');
  await expect(page.locator('#grid > div:nth-of-type(51)')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  const initialMs = Number(await overrides.getAttribute('data-reconcile-ms'));

  // An in-place update (the common React case) must not trigger a reconcile at all.
  const countBefore = await overrides.getAttribute('data-reconcile-count');
  await page.locator('#touch').click();
  await page.waitForTimeout(300);
  expect(await overrides.getAttribute('data-reconcile-count')).toBe(countBefore);

  // Replace all 5,000 nodes: every target is lost and has to be re-found and re-tagged.
  await page.locator('#remount').click();
  await expect(overrides).toHaveAttribute('data-retagged', '20');
  await expect(page.locator('#grid > div:nth-of-type(951)')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  const remountMs = Number(await overrides.getAttribute('data-reconcile-ms'));
  expect(await page.locator('[data-tinker-id]').count()).toBe(20);

  console.log(`[perf] 5,000 nodes, 20 targets: first tagging ${initialMs} ms, re-tagging after full remount ${remountMs} ms`);
  expect(remountMs).toBeLessThan(100);
});

test('token values follow the cascade when two stylesheets declare the same name', async ({ open }) => {
  // Tailwind's @layer theme also declares --radius-md (0.375rem); the unlayered 8px wins.
  const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
  await pick(page.locator(card));
  await setStyle('border-radius', '7px');
  await expect(panel.getByTestId('suggestion-border-radius')).toContainText('7px → var(--radius-md) (8px)');
});
