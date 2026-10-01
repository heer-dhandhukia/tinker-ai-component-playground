import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, PLAYGROUND_URL } from './fixtures';
import { sessionTest as test } from './session';

// Opt-in: calls the real Anthropic API and costs money. Run with
//   TINKER_REAL_API=1 ANTHROPIC_API_KEY=... npx playwright test real-api
// Optional: TINKER_MODEL=claude-sonnet-5
const enabled = process.env.TINKER_REAL_API === '1' && Boolean(process.env.ANTHROPIC_API_KEY);

test.describe('real Anthropic API', () => {
  test.skip(!enabled, 'set TINKER_REAL_API=1 and ANTHROPIC_API_KEY to run');
  test.setTimeout(300_000);

  test('3 variants for the MUI button', async ({ open, serviceWorker }) => {
    await serviceWorker.evaluate(
      (settings) => chrome.storage.local.set({ settings }),
      { apiKey: process.env.ANTHROPIC_API_KEY!, model: process.env.TINKER_MODEL ?? 'claude-sonnet-5' },
    );
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator('[data-section="mui"] button'));

    await panel.getByLabel('Instruction for the AI').fill('Make this button feel premium');
    await panel.getByRole('button', { name: 'Give me 3 variants' }).click();
    const payload = await panel.getByTestId('ai-preview-user').innerText();
    await panel.getByTestId('ai-preview').getByRole('button', { name: 'Send' }).click();

    await expect(panel.getByTestId('ai-result').or(panel.getByTestId('ai-error'))).toBeVisible({ timeout: 240_000 });
    await expect(panel.getByTestId('ai-error')).toHaveCount(0);
    await expect(panel.getByRole('tab')).toHaveCount(3);

    const variants: { tab: string; name: string; changes: string[] }[] = [];
    for (const tab of await panel.getByRole('tab').all()) {
      await tab.click();
      variants.push({
        tab: await tab.innerText(),
        name: await panel.getByTestId('ai-variant-name').innerText(),
        changes: await panel.getByTestId('ai-variant-changes').locator('li').allInnerTexts(),
      });
    }
    const usage = await panel.getByTestId('ai-usage').innerText();
    expect(variants.every((variant) => variant.changes.length > 0)).toBe(true);

    mkdirSync('docs/phase-3', { recursive: true });
    writeFileSync('docs/phase-3/real-api-result.json', `${JSON.stringify({ payload, variants, usage }, null, 2)}\n`);
    console.log(`[real-api] payload sent:\n${payload}\n\n[real-api] variants:\n${JSON.stringify(variants, null, 2)}\n[real-api] ${usage}`);
  });
});
