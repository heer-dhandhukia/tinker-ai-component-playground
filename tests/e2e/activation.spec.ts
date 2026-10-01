import { expect, PLAYGROUND_URL, REACT18_URL, test } from './fixtures';

test('side panel reports inactive before the extension is activated', async ({
  page,
  serviceWorker,
  openPanel,
}) => {
  await page.goto(PLAYGROUND_URL);
  const tabId = await serviceWorker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return tab!.id!;
  }, PLAYGROUND_URL);

  const panel = await openPanel(tabId);
  await expect(panel.getByTestId('connection-status')).toHaveText('Not active on this page');
});

test('activating on the React 19 playground connects the side panel', async ({
  page,
  activateOn,
  openPanel,
}) => {
  await page.goto(PLAYGROUND_URL);
  await expect(page.getByRole('heading', { name: 'Ship UI faster' })).toBeVisible();

  const tabId = await activateOn(PLAYGROUND_URL);
  const panel = await openPanel(tabId);

  await expect(panel.getByRole('heading', { name: 'Tinker' })).toBeVisible();
  await expect(panel.getByTestId('connection-status')).toHaveText('Connected');
  // Proves the token-stamped round trip through the MAIN-world bridge, not just injection.
  await expect(panel.getByTestId('connection-detail')).toContainText('Page bridge ready');
});

test('an already-open side panel updates live when the page is activated', async ({
  page,
  serviceWorker,
  activateOn,
  openPanel,
}) => {
  await page.goto(PLAYGROUND_URL);
  const tabId = await serviceWorker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    return tab!.id!;
  }, PLAYGROUND_URL);
  const panel = await openPanel(tabId);
  await expect(panel.getByTestId('connection-status')).toHaveText('Not active on this page');

  await activateOn(PLAYGROUND_URL);
  await expect(panel.getByTestId('connection-status')).toHaveText('Connected');

  // Activating twice must not break the connection.
  await activateOn(PLAYGROUND_URL);
  await expect(panel.getByTestId('connection-detail')).toContainText('Page bridge ready');

  // A reload discards the injected scripts.
  await page.reload();
  await expect(panel.getByTestId('connection-status')).toHaveText('Not active on this page');
});

test('activating on the React 18 fixture connects the side panel', async ({
  page,
  activateOn,
  openPanel,
}) => {
  await page.goto(REACT18_URL);
  await expect(page.getByRole('heading', { name: 'React 18 fixture' })).toBeVisible();

  const panel = await openPanel(await activateOn(REACT18_URL));
  await expect(panel.getByTestId('connection-status')).toHaveText('Connected');
  await expect(panel.getByTestId('connection-detail')).toContainText('Page bridge ready');
});

test('the bridge leaves no token behind on the page', async ({ page, activateOn, openPanel }) => {
  await page.goto(PLAYGROUND_URL);
  const panel = await openPanel(await activateOn(PLAYGROUND_URL));
  await expect(panel.getByTestId('connection-status')).toHaveText('Connected');
  expect(await page.evaluate(() => '__tinkerBoot' in window)).toBe(false);
});
