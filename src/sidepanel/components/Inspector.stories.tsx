import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ElementInfo } from '../../shared/types';
import { Inspector } from './Inspector';
import '../panel.css';

const computed = {
  'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px',
  'padding-top': '16px', 'padding-right': '16px', 'padding-bottom': '16px', 'padding-left': '16px',
  width: '320px', height: '128px', 'min-width': '0px', 'max-width': '320px', 'min-height': '0px', 'max-height': 'none',
  'font-size': '15px', 'font-weight': '400', 'line-height': 'normal', 'letter-spacing': 'normal',
  color: 'rgb(28, 29, 34)', 'background-color': 'rgb(255, 255, 255)', 'border-color': 'rgb(220, 221, 227)',
  'border-width': '1px', 'border-style': 'solid', 'border-radius': '8px',
  'box-shadow': 'rgba(0, 0, 0, 0.1) 0px 4px 12px 0px', opacity: '1',
  display: 'grid', 'flex-direction': 'row', gap: '8px', 'align-items': 'normal', 'justify-content': 'normal',
  'grid-template-columns': '286px',
};

const cssModulesCard: ElementInfo = {
  target: { tinkerId: 'a1b2c3d4', cssPath: '#root > div > section:nth-of-type(2) > article', componentPath: ['App', 'UserCard'], textSnippet: 'Ada Lovelace Staff Engineer Platform' },
  tag: 'article',
  classes: ['UserCard_card__7Yz-v'],
  componentName: 'UserCard',
  ownerChain: ['App', 'UserCard'],
  props: { name: 'Ada Lovelace', role: 'Staff Engineer', team: 'Platform' },
  source: { file: 'src/components/UserCard.tsx' },
  reactBuild: 'development',
  styling: [{ system: 'css-modules', evidence: ['class "UserCard_card__7Yz-v" (defined in UserCard.module.css)'] }],
  computed,
  hasParent: true,
  hasChild: true,
};

const meta = { title: 'Side panel/Inspector', component: Inspector } satisfies Meta<typeof Inspector>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CssModulesCard: Story = { args: { info: cssModulesCard } };

export const MuiButtonViaLibrary: Story = {
  args: {
    info: {
      ...cssModulesCard,
      tag: 'button',
      classes: ['MuiButtonBase-root', 'MuiButton-root', 'css-2rwryq-MuiButtonBase-root-MuiButton-root'],
      componentName: 'SettingsDialog',
      via: 'Button',
      ownerChain: ['App', 'SettingsDialog'],
      props: {},
      source: { file: 'src/components/SettingsDialog.tsx' },
      styling: [{ system: 'mui', evidence: ['classes MuiButtonBase-root, MuiButton-root', 'class "css-2rwryq-MuiButtonBase-root-MuiButton-root" (Emotion, MUI\'s styling engine)'] }],
    },
  },
};

export const React18WithLine: Story = {
  args: { info: { ...cssModulesCard, source: { file: '/Users/dev/app/src/components/ProfileCard.tsx', line: 11, column: 5 } } },
};

export const TailwindWithConfidence: Story = {
  args: {
    info: {
      ...cssModulesCard,
      tag: 'div',
      classes: ['rounded-xl', 'bg-indigo-600', 'px-8'],
      componentName: 'Hero',
      ownerChain: ['App', 'Hero'],
      props: {},
      styling: [{ system: 'tailwind', evidence: ['utility classes: rounded-xl, bg-indigo-600, px-8'], confidence: 0.9 }],
    },
  },
};

export const ProductionBuild: Story = {
  args: { info: { ...cssModulesCard, componentName: 'Xe', ownerChain: ['a', 'Xe'], source: undefined, reactBuild: 'production' } },
};

export const NotReact: Story = {
  args: {
    info: {
      ...cssModulesCard,
      componentName: undefined, ownerChain: undefined, props: undefined, source: undefined, reactBuild: undefined,
      tag: 'p', classes: ['plain-note'],
      styling: [{ system: 'scss-or-plain-css', evidence: ['class "plain-note"'] }],
    },
  },
};
