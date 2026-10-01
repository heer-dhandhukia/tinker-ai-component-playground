import { expect, test } from './fixtures';

const FAKE_KEY = 'tinker-e2e-placeholder-key';

test('options page stores the API key and model', async ({ context, extensionId, serviceWorker }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByTestId('key-state')).toHaveText('No API key saved.');

  await options.getByLabel('Anthropic API key').fill(FAKE_KEY);
  await options.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(options.getByTestId('key-state')).toContainText('API key saved.');
  // The key is not echoed back into the form.
  await expect(options.getByLabel('Anthropic API key')).toHaveValue('');

  const stored = await serviceWorker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    return settings;
  });
  expect(stored).toEqual({ provider: 'anthropic', apiKey: FAKE_KEY, model: 'claude-sonnet-5' });

  await options.reload();
  await expect(options.getByTestId('key-state')).toHaveText('API key saved.');
});
