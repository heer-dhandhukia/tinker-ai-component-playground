import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page, Worker } from '@playwright/test';
import { expect, PLAYGROUND_URL } from './fixtures';
import { sessionTest as test } from './session';

// These tests never call Anthropic. The e2e build lets the service worker's API base be
// pointed at a local server that plays the Messages API.

const TEST_KEY = 'tinker-e2e-placeholder-key';
const muiButton = '[data-section="mui"] button';

interface Recorded {
  headers: http.IncomingHttpHeaders;
  body: any;
}
type Reply = { status?: number; json: unknown; headers?: Record<string, string>; delayMs?: number };

async function startMockApi(reply: (request: Recorded, index: number) => Reply) {
  const requests: Recorded[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const recorded = { headers: req.headers, body: JSON.parse(raw) };
      requests.push(recorded);
      const { status = 200, json, headers = {}, delayMs = 0 } = reply(recorded, requests.length - 1);
      setTimeout(() => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(json));
      }, delayMs);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://localhost:${port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

const message = (payload: unknown, usage = { input_tokens: 1840, output_tokens: 612 }): Reply => ({
  json: { type: 'message', content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }], stop_reason: 'end_turn', usage },
});
const variant = (name: string, changes: Record<string, string>) => ({
  name,
  rationale: `${name} direction.`,
  changes: Object.entries(changes).map(([property, after]) => ({ property, after })),
});
const THREE = {
  variants: [
    variant('Minimal', { 'border-radius': 'var(--radius-sm)', 'box-shadow': 'none' }),
    variant('Bold', { 'border-radius': '0px', 'font-weight': '900' }),
    variant('Soft', { 'border-radius': 'var(--radius-full)', 'letter-spacing': '1px' }),
  ],
};

async function configure(serviceWorker: Worker, apiBase: string, options: { key?: boolean; timeoutMs?: number } = {}) {
  await serviceWorker.evaluate(
    async ({ apiBase, key, timeoutMs, withKey }) => {
      if (withKey) await chrome.storage.local.set({ settings: { apiKey: key, model: 'claude-sonnet-5' } });
      const hook = (globalThis as any).__tinkerE2E;
      hook.overrideEndpoint({ apiBase, ...(timeoutMs ? { timeoutMs } : {}) });
    },
    { apiBase, key: TEST_KEY, timeoutMs: options.timeoutMs ?? 0, withKey: options.key !== false },
  );
}

async function ask(panel: Page, instruction: string, button: 'Apply change' | 'Give me 3 variants', confirm = true) {
  await panel.getByLabel('Instruction for the AI').fill(instruction);
  await panel.getByRole('button', { name: button }).click();
  if (confirm) await panel.getByTestId('ai-preview').getByRole('button', { name: 'Send' }).click();
}

test('3 variants on the MUI button: preview, live A/B/C switching, keep', async ({ open, serviceWorker }) => {
  const api = await startMockApi(() => message(THREE));
  await configure(serviceWorker, api.url);
  const { page, panel, pick } = await open(PLAYGROUND_URL);
  const button = page.locator(muiButton);
  await pick(button);
  await expect(panel.getByTestId('component-name')).toHaveText('SettingsDialog');

  // First request of the session stops at "what will be sent".
  await ask(panel, 'Make this button feel premium', 'Give me 3 variants', false);
  const preview = panel.getByTestId('ai-preview-user');
  await expect(preview).toContainText('Make this button feel premium');
  await expect(preview).toContainText('Selected element: <button> rendered by SettingsDialog (via Button)');
  await expect(preview).toContainText('Open settings');
  await expect(preview).toContainText('--radius-sm: 4px');
  await expect(preview).not.toContainText('Ada Lovelace'); // nothing from elsewhere on the page
  expect(api.requests).toHaveLength(0);
  const shownInPreview = await preview.innerText();

  await panel.getByTestId('ai-preview').getByRole('button', { name: 'Send' }).click();
  await expect(panel.getByRole('tab')).toHaveCount(3);

  // What was sent is what was shown, and the key travelled only in the header.
  const [sent] = api.requests;
  expect(sent?.headers['x-api-key']).toBe(TEST_KEY);
  expect(sent?.headers['anthropic-version']).toBe('2023-06-01');
  expect(sent?.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(sent?.body.model).toBe('claude-sonnet-5');
  expect(sent?.body.messages[0].content).toEqual([{ type: 'text', text: shownInPreview }]);
  expect(JSON.stringify(sent?.body)).not.toContain(TEST_KEY);
  mkdirSync('docs/phase-3', { recursive: true });
  writeFileSync('docs/phase-3/mui-button-request.json', `${JSON.stringify(sent?.body, null, 2)}\n`);

  // Variant A is live on the page straight away, but not in the change list.
  await expect(panel.getByTestId('ai-variant-name')).toHaveText('Minimal');
  await expect(button).toHaveCSS('border-radius', '4px');
  await expect(button).toHaveCSS('box-shadow', 'none');
  await expect(panel.getByTestId('change-list')).toContainText('Changes (0)');

  await panel.getByRole('tab', { name: /Bold/ }).click();
  await expect(button).toHaveCSS('border-radius', '0px');
  await expect(button).toHaveCSS('font-weight', '900');
  await expect(button).not.toHaveCSS('box-shadow', 'none'); // A's change is gone again

  await panel.getByRole('tab', { name: /Soft/ }).click();
  await expect(button).toHaveCSS('border-radius', '9999px');
  await expect(button).toHaveCSS('font-weight', '500');

  await panel.getByRole('button', { name: 'Keep this one' }).click();
  await expect(panel.getByTestId('change-list')).toContainText('Changes (2)');
  await expect(panel.locator('[data-change="border-radius"]')).toContainText('token');
  await expect(button).toHaveCSS('border-radius', '9999px');
  await expect(panel.getByTestId('ai-result')).toHaveCount(0);

  // The whole variant is one undo step.
  await panel.getByRole('button', { name: 'Undo' }).click();
  await expect(button).toHaveCSS('border-radius', '4px');
  await expect(button).not.toHaveCSS('letter-spacing', '1px');
  await api.close();
});

test('discarding variants leaves the page untouched', async ({ open, serviceWorker }) => {
  const api = await startMockApi(() => message(THREE));
  await configure(serviceWorker, api.url);
  const { page, panel, pick } = await open(PLAYGROUND_URL);
  await pick(page.locator(muiButton));
  await ask(panel, 'Try something', 'Give me 3 variants');
  await expect(page.locator(muiButton)).toHaveCSS('box-shadow', 'none');
  await panel.getByRole('button', { name: 'Discard' }).click();
  await expect(page.locator(muiButton)).not.toHaveCSS('box-shadow', 'none');
  await expect(panel.getByTestId('change-list')).toContainText('Changes (0)');
  await api.close();
});

test('"Apply change" applies one variant directly; usage and cost are shown; no second preview', async ({ open, serviceWorker }) => {
  const api = await startMockApi(() => message({ variants: [variant('Tighter', { 'padding-top': 'var(--space-2)', gap: '4px' })] }));
  await configure(serviceWorker, api.url);
  const { page, panel, pick } = await open(PLAYGROUND_URL);
  const article = page.locator('[data-section="css-modules"] article');
  await pick(article);

  await ask(panel, 'Tighter spacing', 'Apply change');
  await expect(panel.getByTestId('ai-variant-name')).toHaveText('Tighter');
  await expect(article).toHaveCSS('padding-top', '8px');
  await expect(article).toHaveCSS('gap', '4px');
  await expect(panel.getByTestId('change-list')).toContainText('Changes (2)');
  await expect(panel.getByTestId('ai-usage')).toHaveText('1,840 tokens in, 612 out · ≈ $0.0098 · claude-sonnet-5');
  expect(api.requests[0]?.body.system).toContain('Return exactly 1 variant as JSON');

  // Second request in the same session goes straight out.
  await ask(panel, 'Even tighter', 'Apply change', false);
  await expect(panel.getByTestId('ai-preview')).toHaveCount(0);
  await expect.poll(() => api.requests.length).toBe(2);
  // The model is told about the element as it is now, including the kept change.
  expect(api.requests[1]?.body.messages[0].content[0].text).toContain('padding-top: 8px');
  await api.close();
});

test('invalid model output is dropped and reported, valid changes still apply', async ({ open, serviceWorker }) => {
  const api = await startMockApi(() =>
    message({
      variants: [
        variant('Mixed', { position: 'fixed', color: 'banana', 'background-color': 'url(https://example.com/x.png)', 'border-radius': '20px' }),
      ],
    }),
  );
  await configure(serviceWorker, api.url);
  const { page, panel, pick } = await open(PLAYGROUND_URL);
  const article = page.locator('[data-section="css-modules"] article');
  await pick(article);
  await ask(panel, 'Anything', 'Apply change');

  await expect(article).toHaveCSS('border-radius', '20px');
  await expect(article).toHaveCSS('position', 'static');
  await expect(panel.getByTestId('change-list')).toContainText('Changes (1)');
  const dropped = panel.getByTestId('ai-dropped');
  await expect(dropped).toContainText('3 suggested changes were left out');
  await dropped.locator('summary').click();
  await expect(dropped).toContainText('position: fixed (property is not editable)');
  await expect(dropped).toContainText('color: banana (not a valid value for color)');
  await expect(dropped).toContainText('(unsafe value)');
  await api.close();
});

test('a response that fails validation is retried once with the error', async ({ open, serviceWorker }) => {
  const api = await startMockApi((_request, index) => (index === 0 ? message('Here are three ideas!') : message(THREE)));
  await configure(serviceWorker, api.url);
  const { page, panel, pick } = await open(PLAYGROUND_URL);
  await pick(page.locator(muiButton));
  await ask(panel, 'Premium', 'Give me 3 variants');

  await expect(panel.getByRole('tab')).toHaveCount(3);
  await expect(panel.getByTestId('ai-usage')).toContainText('3,680 tokens in, 1,224 out');
  await expect(panel.getByTestId('ai-usage')).toContainText('retried once');
  expect(api.requests).toHaveLength(2);
  expect(api.requests[1]?.body.messages).toHaveLength(3);
  expect(api.requests[1]?.body.messages[2].content[0].text).toContain('not valid JSON');
  await api.close();
});

test.describe('error states', () => {
  test('missing key: nothing is sent', async ({ open, serviceWorker }) => {
    const api = await startMockApi(() => message(THREE));
    await configure(serviceWorker, api.url, { key: false });
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator(muiButton));
    await ask(panel, 'Premium', 'Apply change');
    await expect(panel.getByTestId('ai-error')).toHaveAttribute('data-kind', 'no-key');
    await expect(panel.getByTestId('ai-error')).toContainText('Add an API key in settings');
    await expect(panel.getByRole('button', { name: 'Open settings' })).toBeVisible();
    expect(api.requests).toHaveLength(0);
    await api.close();
  });

  test('rate limit', async ({ open, serviceWorker }) => {
    const api = await startMockApi(() => ({
      status: 429,
      headers: { 'retry-after': '12' },
      json: { type: 'error', error: { type: 'rate_limit_error', message: 'Too many requests' } },
    }));
    await configure(serviceWorker, api.url);
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator(muiButton));
    await ask(panel, 'Premium', 'Apply change');
    await expect(panel.getByTestId('ai-error')).toHaveText('Rate limited. Try again in 12 seconds.');
    expect(api.requests).toHaveLength(1);
    await api.close();
  });

  test('rejected key', async ({ open, serviceWorker }) => {
    const api = await startMockApi(() => ({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }));
    await configure(serviceWorker, api.url);
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator(muiButton));
    await ask(panel, 'Premium', 'Apply change');
    await expect(panel.getByTestId('ai-error')).toHaveAttribute('data-kind', 'auth');
    await expect(panel.getByTestId('ai-error')).not.toContainText(TEST_KEY);
    await api.close();
  });

  test('timeout', async ({ open, serviceWorker }) => {
    const api = await startMockApi(() => ({ ...message(THREE), delayMs: 3000 }));
    await configure(serviceWorker, api.url, { timeoutMs: 400 });
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator(muiButton));
    await ask(panel, 'Premium', 'Apply change');
    await expect(panel.getByTestId('ai-error')).toHaveAttribute('data-kind', 'timeout');
    await expect(page.locator(muiButton)).toHaveCSS('border-radius', '4px');
    await api.close();
  });
});

test('a requested screenshot is skipped, with the reason, when the page is not the visible tab', async ({ open, serviceWorker }) => {
  const api = await startMockApi(() => message({ variants: [variant('Round', { 'border-radius': '12px' })] }));
  await configure(serviceWorker, api.url);
  const { page, panel, pick } = await open(PLAYGROUND_URL);
  await pick(page.locator(muiButton));
  await panel.bringToFront(); // in e2e the panel is an ordinary tab, so the page is now hidden
  await panel.getByLabel('Attach a screenshot of the element').check();
  await ask(panel, 'Rounder', 'Apply change');
  await expect(panel.getByTestId('ai-usage')).toContainText('screenshot skipped: the page is not the visible tab');
  expect(api.requests[0]?.body.messages[0].content).toHaveLength(1);
  await expect(page.locator(muiButton)).toHaveCSS('border-radius', '12px');
  await api.close();
});
