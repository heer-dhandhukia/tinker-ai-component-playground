import type { Meta, StoryObj } from '@storybook/react-vite';
import { classifyToken, type DesignToken } from '../../shared/tokens';
import type { Change, ElementInfo } from '../../shared/types';
import { StyleControls } from './StyleControls';
import '../panel.css';

const noop = () => {};
const token = (name: string, value: string): DesignToken => ({ name, value, category: classifyToken(name, value) });
const tokens = [token('--space-3', '12px'), token('--space-4', '16px'), token('--color-primary', '#4f46e5'), token('--color-accent', '#0d9488')];

const info: ElementInfo = {
  target: { tinkerId: 'title001', cssPath: 'article > h2', componentPath: ['App', 'UserCard'], textSnippet: 'Ada Lovelace' },
  tag: 'h2',
  classes: ['UserCard_title__fWrPo'],
  styling: [{ system: 'css-modules', evidence: [] }],
  computed: {
    'margin-top': '0px', 'margin-right': '0px', 'margin-bottom': '0px', 'margin-left': '0px',
    'padding-top': '0px', 'padding-right': '0px', 'padding-bottom': '0px', 'padding-left': '0px',
    width: '286px', height: '24px', 'min-width': '0px', 'max-width': 'none', 'min-height': '0px', 'max-height': 'none',
    'font-size': '20px', 'font-weight': '600', 'line-height': 'normal', 'letter-spacing': 'normal',
    color: 'rgb(28, 29, 34)', 'background-color': 'rgba(0, 0, 0, 0)', 'border-color': 'rgb(28, 29, 34)',
    'border-width': '0px', 'border-style': 'none', 'border-radius': '0px', 'box-shadow': 'none', opacity: '1',
    display: 'block', 'flex-direction': 'row', gap: 'normal', 'align-items': 'normal', 'justify-content': 'normal', 'grid-template-columns': 'none',
  },
  text: 'Ada Lovelace',
  hasParent: true,
  hasChild: false,
};
const changed: Change[] = [
  { id: '1', target: info.target, kind: 'style', property: 'padding-top', before: '0px', after: '13px', origin: 'manual', createdAt: 1 },
  { id: '2', target: info.target, kind: 'style', property: 'color', before: 'rgb(28, 29, 34)', after: 'var(--color-primary)', token: 'var(--color-primary)', origin: 'manual', createdAt: 2 },
];

const meta = {
  title: 'Side panel/StyleControls',
  component: StyleControls,
  args: { info, changes: [], tokens, isValid: (property: string, value: string) => CSS.supports(property, value), onStyleEdit: noop, onTextEdit: noop, onReset: noop },
} satisfies Meta<typeof StyleControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Untouched: Story = {};
export const WithChangesAndTokenSuggestion: Story = { args: { changes: changed } };
