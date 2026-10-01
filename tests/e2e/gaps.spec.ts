import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, PLAYGROUND_PRODUCTION_URL, PLAYGROUND_URL, REACT18_URL } from './fixtures';
import { systems } from './session';
import { sessionTest as test } from './session';

const card = '[data-section="css-modules"] article';

/** PNG width and height from the IHDR chunk. */
const pngSize = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

test.describe('screenshots with the page as the visible tab', () => {
  test('AI request attaches a PNG cropped to the element', async ({ open, serviceWorker }) => {
    const requests: any[] = [];
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        requests.push(JSON.parse(raw));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          type: 'message', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 },
          content: [{ type: 'text', text: JSON.stringify({ variants: [{ name: 'Round', rationale: 'r', changes: [{ property: 'border-radius', after: '12px' }] }] }) }],
        }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
    const apiBase = `http://localhost:${(server.address() as AddressInfo).port}`;
    await serviceWorker.evaluate(async (apiBase) => {
      await chrome.storage.local.set({ settings: { apiKey: 'tinker-e2e-placeholder-key', model: 'claude-sonnet-5' } });
      (globalThis as any).__tinkerE2E.overrideEndpoint({ apiBase });
    }, apiBase);

    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator(card));
    await expect(panel.getByTestId('component-name')).toHaveText('UserCard');
    const box = (await page.locator(card).boundingBox())!;

    // Drive the panel while the page stays the visible tab, as it is with the real side panel.
    await page.bringToFront();
    await panel.getByLabel('Attach a screenshot of the element').check();
    await panel.getByLabel('Instruction for the AI').fill('Rounder');
    await panel.getByRole('button', { name: 'Apply change' }).click();
    await panel.getByTestId('ai-preview').getByRole('button', { name: 'Send' }).click();
    await expect(panel.getByTestId('ai-usage')).toContainText('screenshot attached');

    const [image, text] = requests[0].messages[0].content;
    expect(image.type).toBe('image');
    expect(image.source.media_type).toBe('image/png');
    expect(text.type).toBe('text');
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const size = pngSize(Buffer.from(image.source.data, 'base64'));
    expect(size.width).toBe(Math.round(box.width * dpr));
    expect(size.height).toBe(Math.round(box.height * dpr));
    // The overlay is back after the capture.
    expect(await page.locator('[data-tinker-overlay]').evaluate((host) => (host as HTMLElement).style.display)).toBe('');
    server.close();
  });

  test('export downloads before and after PNGs, and leaves the overrides on', async ({ open }) => {
    const { page, panel, pick, setStyle } = await open(PLAYGROUND_URL);
    await pick(page.locator(card));
    await setStyle('padding-top', '60px');
    await expect(page.locator(card)).toHaveCSS('padding-top', '60px');

    await page.bringToFront();
    const downloads: { name: string; height: number }[] = [];
    panel.on('download', async (download) => {
      downloads.push({ name: download.suggestedFilename(), height: pngSize(readFileSync(await download.path())).height });
    });
    await panel.getByRole('button', { name: 'Before / after screenshots' }).click();
    await expect(panel.getByTestId('export-status')).toHaveText('2 screenshots downloaded.', { timeout: 15_000 });
    await expect.poll(() => downloads.length).toBe(2);

    const before = downloads.find((entry) => entry.name === 'tinker-1-usercard-before.png')!;
    const after = downloads.find((entry) => entry.name === 'tinker-1-usercard-after.png')!;
    // 44px more top padding: the "after" crop is taller, so the two captures really differ.
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    expect(after.height - before.height).toBe(Math.round(44 * dpr));
    await expect(page.locator(card)).toHaveCSS('padding-top', '60px');
  });
});

test('hover highlight stays smooth on the 5,000-node page', async ({ open }) => {
  const { page, startPicking } = await open(`${PLAYGROUND_URL}stress.html`);
  await startPicking();

  // Record frame gaps and long tasks while the mouse sweeps across ~300 different elements.
  await page.evaluate(() => {
    const state = ((window as any).__perf = { gaps: [] as number[], longTasks: 0, running: true });
    new PerformanceObserver((list) => (state.longTasks += list.getEntries().length)).observe({ entryTypes: ['longtask'] });
    let last = performance.now();
    const tick = (now: number) => {
      state.gaps.push(now - last);
      last = now;
      if (state.running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let step = 0; step < 300; step++) {
    await page.mouse.move(20 + ((step * 37) % 1200), 60 + ((step * 23) % 600));
  }
  const { gaps, longTasks } = await page.evaluate(() => {
    const state = (window as any).__perf;
    state.running = false;
    return state as { gaps: number[]; longTasks: number };
  });
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  console.log(`[perf] hover over 5,000 nodes: ${gaps.length} frames, average ${average.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, worst ${sorted.at(-1)!.toFixed(1)} ms, long tasks ${longTasks}`);

  await expect(page.locator('[data-tinker-overlay]')).toHaveAttribute('data-tinker-label', /^(div|span)$/);
  expect(longTasks).toBe(0);
  expect(p95).toBeLessThan(34); // two frames at 60 Hz
});

test('production build of React: says names may be minified, styling and edits still work', async ({ open }) => {
  const { page, panel, pick, setStyle } = await open(PLAYGROUND_PRODUCTION_URL);
  await pick(page.locator(card));

  await expect(panel.getByTestId('build-notice')).toContainText('Production build of React');
  await expect(panel.getByTestId('source')).toHaveText('source unknown');
  const name = await panel.getByTestId('component-name').innerText();
  console.log(`[production] component name reported for UserCard: "${name}"`);
  expect(name).not.toBe('Not a React element');

  // The built stylesheet has no file name to go on, so CSS Modules is recognised by pattern.
  expect(await systems(panel)).toEqual(['css-modules']);
  await setStyle('padding-top', '40px');
  await expect(page.locator(card)).toHaveCSS('padding-top', '40px');

  const brief = await (async () => {
    await panel.getByRole('tab', { name: 'Change brief' }).click();
    return panel.getByTestId('export-output').inputValue();
  })();
  expect(brief).toContain('- **Source:** unknown');
  expect(brief).toContain('is a minified name. Do not search the source for it');
  expect(brief).toContain('→ `UserCard.module.(s)css` → `.card`');
});

test('an unpinned side panel follows the active tab and keeps each tab\'s work apart', async ({ context, extensionId, activateOn, open }) => {
  // Tab A: the playground, activated, with one change made through a pinned panel.
  const { page: tabA, panel: pinned, pick, setStyle } = await open(PLAYGROUND_URL);
  await pick(tabA.locator(card));
  await setStyle('padding-top', '40px');
  await expect(tabA.locator(card)).toHaveCSS('padding-top', '40px');
  await pinned.close();

  // Tab B: the React 18 fixture, activated, nothing changed.
  const tabB = await context.newPage();
  await tabB.goto(REACT18_URL);
  await activateOn(REACT18_URL);

  // The real side panel has no ?tabId: it binds to whichever tab is active in its window.
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByTestId('connection-status')).toHaveText('Not active on this page'); // the panel's own tab

  await tabA.bringToFront();
  await expect(panel.getByTestId('connection-status')).toHaveText('Connected');
  await expect(panel.getByTestId('change-list')).toContainText('Changes (1)');
  await expect(panel.getByTestId('component-name')).toHaveText('UserCard');

  await tabB.bringToFront();
  await expect(panel.getByTestId('change-list')).toContainText('Changes (0)');
  await expect(panel.getByTestId('no-selection')).toBeVisible();

  // Switching away did not disturb tab A, and coming back shows its change again.
  await expect(tabA.locator(card)).toHaveCSS('padding-top', '40px');
  await tabA.bringToFront();
  await expect(panel.getByTestId('change-list')).toContainText('Changes (1)');
});
