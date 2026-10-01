import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, PLAYGROUND_URL } from './fixtures';
import { sessionTest as test } from './session';

// A local server standing in for an OpenAI-compatible provider (Groq, OpenRouter, Ollama, …).
async function startCompatibleMock(content: string) {
  const requests: { url: string; headers: http.IncomingHttpHeaders; body: any }[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      requests.push({ url: req.url ?? '', headers: req.headers, body: JSON.parse(raw) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 120 } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  const host = `localhost:${(server.address() as AddressInfo).port}`;
  return { host, baseUrl: `http://${host}/v1`, requests, close: () => server.close() };
}

test('a keyless OpenAI-compatible provider, set up in options, serves AI edits', async ({ open, context, extensionId, serviceWorker }) => {
  const reply = { variants: [{ name: 'Tighter', rationale: 'Less padding.', changes: [{ property: 'padding-top', after: 'var(--space-2)' }] }] };
  // Free models often wrap their JSON in a code fence.
  const api = await startCompatibleMock(`\`\`\`json\n${JSON.stringify(reply, null, 2)}\n\`\`\``);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel('OpenAI-compatible').check();
  await options.getByLabel('Preset').selectOption('ollama');
  await expect(options.getByLabel('Base URL')).toHaveValue('http://localhost:11434/v1');
  await expect(options.getByText('OLLAMA_ORIGINS=chrome-extension://*')).toBeVisible();
  await options.getByLabel('Base URL').fill(api.baseUrl);
  await options.getByLabel('Model name').fill('test-model');
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.getByTestId('key-state')).toHaveText('No API key saved. Settings saved.');
  const stored = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  expect(stored).toEqual({ provider: 'openai-compatible', model: 'claude-sonnet-5', compatible: { baseUrl: api.baseUrl, model: 'test-model' } });

  const { page, panel, pick } = await open(PLAYGROUND_URL);
  const article = page.locator('[data-section="css-modules"] article');
  await pick(article);
  await panel.getByLabel('Instruction for the AI').fill('Tighter spacing');
  await panel.getByRole('button', { name: 'Apply change' }).click();

  // The preview names the real destination and shows the prompt this provider gets.
  await expect(panel.getByTestId('ai-destination')).toHaveText(`This is what will be sent to ${api.host} (model test-model).`);
  await panel.getByTestId('ai-preview').getByText('Fixed instructions to the model').click();
  await expect(panel.getByTestId('ai-preview')).toContainText('Output format: respond with one JSON object');
  const shown = await panel.getByTestId('ai-preview-user').innerText();
  await panel.getByTestId('ai-preview').getByRole('button', { name: 'Send' }).click();

  await expect(article).toHaveCSS('padding-top', '8px');
  await expect(panel.getByTestId('change-list')).toContainText('Changes (1)');
  await expect(panel.getByTestId('ai-usage')).toHaveText('900 tokens in, 120 out · cost unknown for this model · test-model');

  const [sent] = api.requests;
  expect(sent?.url).toBe('/v1/chat/completions');
  expect(sent?.headers.authorization).toBeUndefined();
  expect(sent?.headers['x-api-key']).toBeUndefined();
  expect(sent?.body.model).toBe('test-model');
  expect(sent?.body.messages[0].role).toBe('system');
  expect(sent?.body.messages[1]).toEqual({ role: 'user', content: shown });
  api.close();
});

test('options: an invalid base URL is refused, and switching back to Anthropic keeps both setups', async ({ context, extensionId, serviceWorker }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel('OpenAI-compatible').check();
  await options.getByLabel('Base URL').fill('not a url');
  await options.getByLabel('Model name').fill('m');
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.getByTestId('key-state')).toContainText('Enter a valid http(s) base URL.');

  await options.getByLabel('Preset').selectOption('groq');
  await options.getByLabel('API key (leave empty for a local server)').fill('tinker-e2e-placeholder-key');
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.getByTestId('key-state')).toHaveText('API key saved. Settings saved.');
  await expect(options.getByLabel('API key (leave empty for a local server)')).toHaveValue('');

  await options.getByLabel('Anthropic (paid API key)').check();
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  const stored = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
  expect(stored).toEqual({
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    compatible: { baseUrl: 'https://api.groq.com/openai/v1', model: 'm', apiKey: 'tinker-e2e-placeholder-key' },
  });
});
