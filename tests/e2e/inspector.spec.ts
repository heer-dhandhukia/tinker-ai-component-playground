import { expect, PLAYGROUND_URL, REACT18_URL } from './fixtures';
import { sessionTest, systems } from './session';

// Expectations come from fixtures/MANIFEST.md.

sessionTest.describe('React 19 playground: component name and styling system per section', () => {
  sessionTest('SCSS navbar', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator('nav.navbar'));
    await expect(panel.getByTestId('component-name')).toHaveText('Navbar');
    await expect(panel.getByTestId('element-tag')).toHaveText('<nav>');
    await expect(panel.getByTestId('owner-chain')).toHaveText('AppNavbar');
    expect(await systems(panel)).toEqual(['scss-or-plain-css']);
  });

  sessionTest('CSS Modules card', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator('[data-section="css-modules"] article'));
    await expect(panel.getByTestId('component-name')).toHaveText('UserCard');
    await expect(panel.getByTestId('element-tag')).toHaveText('<article>');
    expect(await systems(panel)).toEqual(['css-modules']);
    await expect(panel.getByTestId('styling-systems')).toContainText('UserCard.module.css');
    await expect(panel.getByTestId('props')).toContainText('"Ada Lovelace"');
    // React 19: the file is known, the line is not (see DECISIONS.md).
    await expect(panel.getByTestId('source')).toHaveText('src/components/UserCard.tsx');
    await expect(panel.locator('[data-property="padding-top"]')).toHaveValue('16px');
    await expect(panel.locator('[data-property="border-radius"]')).toHaveValue('8px');
  });

  sessionTest('styled-components button', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator('[data-section="styled-components"] button'));
    await expect(panel.getByTestId('component-name')).toHaveText('PrimaryButton');
    await expect(panel.getByTestId('component-via')).toHaveText('styled.button');
    expect(await systems(panel)).toEqual(['styled-components']);
    await expect(panel.getByTestId('props')).toContainText('[fn]');
    // Picking must not trigger the page's own click handler.
    await expect(page.getByTestId('promo-hidden')).toBeVisible();
  });

  sessionTest('MUI button', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator('[data-section="mui"] button'));
    await expect(panel.getByTestId('component-name')).toHaveText('SettingsDialog');
    await expect(panel.getByTestId('component-via')).toHaveText('Button');
    await expect(panel.getByTestId('owner-chain')).toHaveText('AppSettingsDialog');
    expect(await systems(panel)).toEqual(['mui']);
    await expect(page.locator('.MuiDialog-paper')).toHaveCount(0);
  });

  sessionTest('MUI dialog (portal), reached with ArrowUp + Enter', async ({ open }) => {
    const { page, panel, startPicking, overlayLabel } = await open(PLAYGROUND_URL);
    await page.getByRole('button', { name: 'Open settings' }).click();
    const paper = page.locator('.MuiDialog-paper');
    await expect(paper).toBeVisible();

    await startPicking();
    await paper.locator('.MuiDialogTitle-root').hover();
    await expect(overlayLabel()).toHaveAttribute('data-tinker-label', /h2/);
    await page.keyboard.press('ArrowUp');
    await expect(overlayLabel()).toHaveAttribute('data-tinker-label', /^SettingsDialog · div\.MuiPaper-root$/);
    await page.keyboard.press('Enter');

    await expect(panel.getByTestId('component-name')).toHaveText('SettingsDialog');
    await expect(panel.getByTestId('component-via')).toHaveText('Dialog');
    // MUI's Paper also sets CSS variables through a style attribute.
    expect(await systems(panel)).toEqual(['mui', 'inline']);
  });

  sessionTest('Tailwind hero', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator('[data-section="tailwind"] > div'));
    await expect(panel.getByTestId('component-name')).toHaveText('Hero');
    expect(await systems(panel)).toEqual(['tailwind']);
    await expect(panel.getByTestId('styling-systems')).toContainText('95% confidence');
  });

  sessionTest('timer that re-renders every second', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.getByTestId('timer'));
    await expect(panel.getByTestId('component-name')).toHaveText('Timer');
    expect(await systems(panel)).toEqual(['scss-or-plain-css']);
    // The selection survives the component re-rendering.
    await page.waitForTimeout(2200);
    await expect(panel.getByTestId('component-name')).toHaveText('Timer');
  });

  sessionTest('list item rendered from state', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.getByTestId('todo-items').locator('li').nth(1));
    await expect(panel.getByTestId('component-name')).toHaveText('TodoItem');
    await expect(panel.getByTestId('owner-chain')).toHaveText('AppTodoListTodoItem');
    await expect(panel.getByTestId('props')).toContainText('"Update changelog"');
    expect(await systems(panel)).toEqual(['scss-or-plain-css']);
  });

  sessionTest('conditionally rendered banner; selection clears when it unmounts', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await page.getByRole('button', { name: 'Show promo' }).click();
    await pick(page.getByTestId('promo-banner'));
    await expect(panel.getByTestId('component-name')).toHaveText('PromoBanner');
    expect(await systems(panel)).toEqual(['inline']);

    await page.getByRole('button', { name: 'Hide promo' }).click();
    await expect(panel.getByTestId('no-selection')).toBeVisible();
  });
});

sessionTest.describe('picker behaviour', () => {
  sessionTest('hover shows the component name; Esc cancels without selecting', async ({ open }) => {
    const { page, panel, startPicking, overlayLabel } = await open(PLAYGROUND_URL);
    await startPicking();
    await page.locator('[data-section="css-modules"] h2').hover();
    await expect(overlayLabel()).toHaveAttribute('data-tinker-label', 'UserCard · h2.UserCard_title__fWrPo');

    await page.keyboard.press('ArrowUp');
    await expect(overlayLabel()).toHaveAttribute('data-tinker-label', /^UserCard · article/);
    await page.keyboard.press('ArrowDown');
    await expect(overlayLabel()).toHaveAttribute('data-tinker-label', /^UserCard · h2/);

    await page.keyboard.press('Escape');
    await expect(overlayLabel()).toHaveAttribute('data-tinker-picking', 'false');
    await expect(panel.getByRole('button', { name: 'Pick element' })).toBeVisible();
    await expect(panel.getByTestId('no-selection')).toBeVisible();
  });

  sessionTest('panel Parent / Child buttons move the selection', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator('[data-section="css-modules"] h2'));
    await expect(panel.getByTestId('element-tag')).toHaveText('<h2>');
    await expect(panel.getByRole('button', { name: '↓ Child' })).toBeDisabled();

    await panel.getByRole('button', { name: '↑ Parent' }).click();
    await expect(panel.getByTestId('element-tag')).toHaveText('<article>');
    await panel.getByRole('button', { name: '↓ Child' }).click();
    await expect(panel.getByTestId('element-tag')).toHaveText('<h2>');
  });

  sessionTest('the overlay is not reachable from the page', async ({ open }) => {
    const { page, startPicking } = await open(PLAYGROUND_URL);
    await startPicking();
    expect(await page.evaluate(() => document.querySelector('[data-tinker-overlay]')?.shadowRoot ?? null)).toBeNull();
  });

  sessionTest('probe attributes are cleaned up after inspection', async ({ open }) => {
    const { page, panel, pick } = await open(PLAYGROUND_URL);
    await pick(page.locator('nav.navbar'));
    await expect(panel.getByTestId('component-name')).toHaveText('Navbar');
    await expect(page.locator('[data-tinker-probe]')).toHaveCount(0);
  });
});

sessionTest.describe('React 18 fixture', () => {
  sessionTest('shows component, owner chain and source file:line', async ({ open }) => {
    const { page, panel, pick } = await open(REACT18_URL);
    await pick(page.locator('.profile-card'));
    await expect(panel.getByTestId('component-name')).toHaveText('ProfileCard');
    await expect(panel.getByTestId('owner-chain')).toHaveText('AppProfileCard');
    await expect(panel.getByTestId('source')).toHaveText(/fixtures\/react18-app\/src\/components\/ProfileCard\.tsx:11:5$/);
    expect(await systems(panel)).toEqual(['scss-or-plain-css']);
  });

  sessionTest('nested components resolve to the innermost one', async ({ open }) => {
    const { page, panel, pick } = await open(REACT18_URL);
    await pick(page.locator('.badge'));
    await expect(panel.getByTestId('component-name')).toHaveText('Badge');
    await expect(panel.getByTestId('owner-chain')).toHaveText('AppProfileCardBadge');
    await expect(panel.getByTestId('source')).toHaveText(/Badge\.tsx:2:10$/);
  });
});

sessionTest('a page without React still gets style inspection', async ({ open }) => {
  const { page, panel, pick } = await open(`${PLAYGROUND_URL}plain.html`);
  await pick(page.getByTestId('plain-note'));
  await expect(panel.getByTestId('component-name')).toHaveText('Not a React element');
  await expect(panel.getByTestId('element-tag')).toHaveText('<p>');
  expect(await systems(panel)).toEqual(['scss-or-plain-css']);
  await expect(panel.locator('[data-property="padding-top"]')).toHaveValue('12px');
});

sessionTest('screenshot: inspector on the CSS Modules card', async ({ open }) => {
  const { page, panel, pick } = await open(PLAYGROUND_URL);
  await pick(page.locator('[data-section="css-modules"] article'));
  await expect(panel.getByTestId('component-name')).toHaveText('UserCard');
  await page.screenshot({ path: 'test-results/screenshots/page-css-modules-card.png' });
  await panel.bringToFront();
  await panel.setViewportSize({ width: 400, height: 1100 });
  await panel.screenshot({ path: 'test-results/screenshots/inspector-css-modules-card.png', fullPage: true });
});
