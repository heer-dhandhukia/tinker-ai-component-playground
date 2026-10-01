import { describe, expect, it } from 'vitest';
import { detectStyling, type StyleHints } from '../../src/content/detection';

const NO_HINTS: StyleHints = {
  styledComponents: { present: false, classes: [] },
  emotion: { present: false, classes: [] },
  cssModuleFiles: {},
};
// Mirrors what the playground page exposes (see fixtures/MANIFEST.md).
const PLAYGROUND: StyleHints = {
  styledComponents: { present: true, classes: ['iEhlzc'] },
  emotion: {
    present: true,
    classes: ['css-2rwryq-MuiButtonBase-root-MuiButton-root', 'css-uq7k9j-MuiPaper-root-MuiDialog-paper'],
  },
  cssModuleFiles: { 'UserCard_card__7Yz-v': 'UserCard.module.css', UserCard_title__fWrPo: 'UserCard.module.css' },
};

const detect = (classes: string[], hints = PLAYGROUND, inlineStyleProps: string[] = []) =>
  detectStyling({ classes, inlineStyleProps, hints });
const systems = (classes: string[], hints = PLAYGROUND, inline: string[] = []) =>
  detect(classes, hints, inline).map((match) => match.system);

describe('detectStyling on the fixture sections', () => {
  it('SCSS navbar is plain CSS', () => {
    expect(detect(['navbar'])).toEqual([{ system: 'scss-or-plain-css', evidence: ['class "navbar"'], classes: ['navbar'] }]);
    expect(systems(['navbar__link', 'navbar__link--active'])).toEqual(['scss-or-plain-css']);
  });

  it('CSS Modules card', () => {
    const [match, ...rest] = detect(['UserCard_card__7Yz-v']);
    expect(rest).toEqual([]);
    expect(match?.system).toBe('css-modules');
    expect(match?.evidence.join(' ')).toContain('UserCard.module.css');
    expect(match?.moduleFile).toBe('UserCard.module.css');
    expect(match?.classes).toEqual(['UserCard_card__7Yz-v']);
  });

  it('styled-components button claims both the sc- class and the generated class', () => {
    const matches = detect(['sc-bdvwhi', 'iEhlzc']);
    expect(matches.map((match) => match.system)).toEqual(['styled-components']);
    expect(matches[0]?.evidence.join(' ')).toContain('iEhlzc');
  });

  it('MUI button is mui, with the emotion class as evidence rather than a second system', () => {
    const matches = detect([
      'MuiButtonBase-root', 'MuiButton-root', 'MuiButton-contained', 'MuiButton-sizeMedium',
      'MuiButton-colorPrimary', 'css-2rwryq-MuiButtonBase-root-MuiButton-root',
    ]);
    expect(matches.map((match) => match.system)).toEqual(['mui']);
    expect(matches[0]?.evidence.join(' ')).toContain('css-2rwryq');
    expect(matches[0]?.classes).toHaveLength(6);
  });

  it('MUI dialog paper is mui', () => {
    expect(
      systems(['MuiPaper-root', 'MuiPaper-elevation', 'MuiDialog-paper', 'css-uq7k9j-MuiPaper-root-MuiDialog-paper']),
    ).toEqual(['mui']);
  });

  it('Tailwind hero, with high confidence', () => {
    const matches = detect(['rounded-xl', 'bg-indigo-600', 'px-8', 'py-10', 'text-white', 'shadow-lg']);
    expect(matches.map((match) => match.system)).toEqual(['tailwind']);
    expect(matches[0]?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('timer and list item are plain CSS', () => {
    expect(systems(['timer'])).toEqual(['scss-or-plain-css']);
    expect(systems(['todo-item'])).toEqual(['scss-or-plain-css']);
  });

  it('promo banner is inline', () => {
    expect(detect([], PLAYGROUND, ['padding', 'background', 'border-radius', 'color'])).toEqual([
      { system: 'inline', evidence: ['style attribute sets padding, background, border-radius, color'] },
    ]);
  });
});

describe('detectStyling beyond the fixtures', () => {
  it('reports unknown when there is nothing to go on', () => {
    expect(detect([], NO_HINTS)).toEqual([{ system: 'unknown', evidence: ['no classes and no style attribute'] }]);
  });

  it("recognises Vite's default CSS Modules naming", () => {
    expect(systems(['_title_1a2b3_7'], NO_HINTS)).toEqual(['css-modules']);
  });

  it('recognises CSS Modules from the pattern alone, without stylesheet hints', () => {
    expect(systems(['Card_title__x7Ab2'], NO_HINTS)).toEqual(['css-modules']);
  });

  it('does not mistake BEM for CSS Modules', () => {
    expect(systems(['card__title', 'card__title--large'], NO_HINTS)).toEqual(['scss-or-plain-css']);
  });

  it('standalone Emotion (no Mui classes) is emotion', () => {
    const hints: StyleHints = { ...NO_HINTS, emotion: { present: true, classes: ['css-1x2y3z'] } };
    expect(systems(['css-1x2y3z'], hints)).toEqual(['emotion']);
  });

  it('does not report emotion or styled-components without their style tags', () => {
    expect(systems(['css-reset'], NO_HINTS)).toEqual(['scss-or-plain-css']);
    expect(systems(['sc-header'], NO_HINTS)).toEqual(['scss-or-plain-css']);
  });

  it('reports several systems on one element', () => {
    expect(systems(['UserCard_card__7Yz-v', 'px-4', 'py-2', 'text-sm', 'legacy-card'], PLAYGROUND, ['color'])).toEqual([
      'css-modules', 'tailwind', 'inline', 'scss-or-plain-css',
    ]);
  });

  it('gives a single utility-looking class low confidence and does not call it Tailwind', () => {
    expect(systems(['mt-2'], NO_HINTS)).toEqual(['scss-or-plain-css']);
  });

  it('scores Tailwind higher with variants and arbitrary values', () => {
    const plain = detect(['px-4', 'text-sm'], NO_HINTS)[0];
    const specific = detect(['hover:bg-sky-700', 'w-[32px]'], NO_HINTS)[0];
    expect(plain?.system).toBe('tailwind');
    expect(specific?.system).toBe('tailwind');
    expect(specific!.confidence!).toBeGreaterThan(plain!.confidence!);
  });

  it('does not treat ordinary words as Tailwind', () => {
    expect(systems(['container', 'header', 'is-active', 'btn', 'btn-primary'], NO_HINTS)).toEqual(['scss-or-plain-css']);
  });
});
