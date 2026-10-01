import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
// Built by `npm run build:e2e` (adds the localhost host permission and the activate() hook).
const EXTENSION_PATH = path.resolve(here, '../../.output/chrome-mv3-e2e');

export const PLAYGROUND_URL = 'http://localhost:5173/';
export const REACT18_URL = 'http://localhost:5174/';
/** A production build of the playground. */
export const PLAYGROUND_PRODUCTION_URL = 'http://localhost:5176/';
/** The playground served with the companion's tinker-src Vite plugin. */
export const PLAYGROUND_WITH_SOURCE_URL = 'http://localhost:5175/';

interface TinkerFixtures {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  /** Runs the same activation the toolbar click runs, on the tab showing `url`. Returns its tab id. */
  activateOn: (url: string) => Promise<number>;
  /** Opens the side panel document in a normal tab, bound to `tabId`. */
  openPanel: (tabId: number) => Promise<Page>;
}

export const test = base.extend<TinkerFixtures>({
  context: async ({}, use) => {
    if (!existsSync(EXTENSION_PATH)) {
      throw new Error(`Missing ${EXTENSION_PATH}. Run "npm run build:e2e" first.`);
    }
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },

  activateOn: async ({ serviceWorker }, use) => {
    await use((url) =>
      serviceWorker.evaluate(async (tabUrl) => {
        const [tab] = await chrome.tabs.query({ url: tabUrl });
        if (tab?.id == null) throw new Error(`No tab for ${tabUrl}`);
        const hook = (globalThis as unknown as {
          __tinkerE2E: { activate: (tabId: number) => Promise<void> };
        }).__tinkerE2E;
        await hook.activate(tab.id);
        return tab.id;
      }, url),
    );
  },

  openPanel: async ({ context, extensionId }, use) => {
    await use(async (tabId) => {
      const panel = await context.newPage();
      await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`);
      return panel;
    });
  },
});

export const expect = test.expect;
