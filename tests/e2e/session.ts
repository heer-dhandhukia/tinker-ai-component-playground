import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

export interface Session {
  page: Page;
  panel: Page;
  /** Starts the picker from the panel and brings the page to the front (rAF needs a visible tab). */
  startPicking: () => Promise<void>;
  /** Picks an element by clicking it. `position` avoids landing on a child. */
  pick: (target: Locator, position?: { x: number; y: number }) => Promise<void>;
  overlayLabel: () => Locator;
  /** Types a value into a style control in the panel and commits it. */
  setStyle: (property: string, value: string) => Promise<void>;
  tabId: number;
}

export const systems = (panel: Page) =>
  panel.getByTestId('styling-systems').locator('> li').evaluateAll((items) => items.map((item) => item.getAttribute('data-system')));

export const sessionTest = test.extend<{ open: (url: string) => Promise<Session> }>({
  open: async ({ page, activateOn, openPanel }, use) => {
    await use(async (url) => {
      await page.goto(url);
      const tabId = await activateOn(url);
      const panel = await openPanel(tabId);
      await expect(panel.getByTestId('connection-status')).toHaveText('Connected');
      const startPicking = async () => {
        await panel.getByRole('button', { name: 'Pick element' }).click();
        await expect(panel.getByRole('button', { name: 'Cancel picking' })).toBeVisible();
        await page.bringToFront();
      };
      return {
        page,
        panel,
        startPicking,
        pick: async (target, position = { x: 12, y: 4 }) => {
          await startPicking();
          await target.click({ position });
        },
        overlayLabel: () => page.locator('[data-tinker-overlay]'),
        setStyle: async (property, value) => {
          const input = panel.locator(`input[data-property="${property}"]`);
          await input.fill(value);
          await input.press('Enter');
        },
        tabId,
      };
    });
  },
});
