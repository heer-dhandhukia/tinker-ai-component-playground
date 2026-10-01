import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Change } from '../../shared/types';
import { ChangeList } from './ChangeList';
import '../panel.css';

const noop = () => {};
const card = { tinkerId: 'card0001', cssPath: '#root > div > section:nth-of-type(2) > article', componentPath: ['App', 'UserCard'] };
const banner = { tinkerId: 'bann0001', cssPath: '#root > div > section:nth-of-type(4) > aside', componentPath: ['App', 'PromoBanner'] };
const changes: Change[] = [
  { id: '1', target: card, kind: 'style', property: 'padding-top', before: '16px', after: 'var(--space-3)', token: 'var(--space-3)', origin: 'manual', createdAt: 1 },
  { id: '2', target: card, kind: 'style', property: 'border-radius', before: '8px', after: '16px', origin: 'manual', createdAt: 2 },
  { id: '3', target: banner, kind: 'text', property: 'textContent', before: 'Launch week', after: 'Launch month', origin: 'manual', createdAt: 3 },
];

const meta = {
  title: 'Side panel/ChangeList',
  component: ChangeList,
  args: {
    changes, detached: [], pendingCount: 0, canUndo: true, canRedo: false, showOriginal: false, reapply: false, canReapply: true,
    onUndo: noop, onRedo: noop, onClear: noop, onRemove: noop, onShowOriginal: noop, onReapply: noop, onRestorePending: noop, onDiscardPending: noop,
  },
} satisfies Meta<typeof ChangeList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithChanges: Story = {};
export const Empty: Story = { args: { changes: [], canUndo: false } };
export const WithDetachedElement: Story = { args: { detached: ['bann0001'] } };
export const SavedSessionWaiting: Story = { args: { changes: [], canUndo: false, pendingCount: 3 } };
