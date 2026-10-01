import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AiState } from '../aiSlice';
import { AiPanel } from './AiPanel';
import '../panel.css';

const noop = () => {};
const idle: AiState = { phase: 'idle', pending: null, previewAcknowledged: false, targetId: null, outcome: null, active: 0, error: null };
const target = { tinkerId: 'btn00001', cssPath: 'section > button' };
const change = (property: string, before: string, after: string) => ({ target, kind: 'style' as const, property, before, after, origin: 'ai' as const });
const outcome: NonNullable<AiState['outcome']> = {
  variants: [
    { id: 'a', name: 'Minimal', rationale: 'Flatter and quieter.', changes: [change('box-shadow', 'rgba(0,0,0,.2) 0 3px 1px', 'none'), change('border-radius', '4px', 'var(--radius-sm)')] },
    { id: 'b', name: 'Bold', rationale: 'Heavier weight and stronger colour.', changes: [change('font-weight', '500', '700')] },
    { id: 'c', name: 'Soft', rationale: 'Rounder with more breathing room.', changes: [change('border-radius', '4px', 'var(--radius-full)')] },
  ],
  dropped: [{ variant: 'Bold', property: 'position', value: 'fixed', reason: 'property is not editable' }],
  usage: { inputTokens: 1840, outputTokens: 612 },
  cost: 0.0098,
  model: 'claude-sonnet-5',
  attempts: 1,
  screenshot: 'not-requested',
  applied: false,
};

const meta = {
  title: 'Side panel/AiPanel',
  component: AiPanel,
  args: { ai: idle, disabled: false, onAsk: noop, onShowPreview: noop, onConfirmPreview: noop, onSelectVariant: noop, onKeep: noop, onDismiss: noop, onOpenSettings: noop },
} satisfies Meta<typeof AiPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const NothingSelected: Story = { args: { disabled: true } };
export const Loading: Story = { args: { ai: { ...idle, phase: 'loading' } } };
export const ThreeVariants: Story = { args: { ai: { ...idle, phase: 'ready', outcome, active: 1 } } };
export const SingleChangeApplied: Story = {
  args: { ai: { ...idle, phase: 'ready', outcome: { ...outcome, variants: outcome.variants.slice(0, 1), dropped: [], applied: true } } },
};
export const MissingKey: Story = { args: { ai: { ...idle, phase: 'error', error: { kind: 'no-key', message: 'No Anthropic API key is saved.' } } } };
export const RateLimited: Story = { args: { ai: { ...idle, phase: 'error', error: { kind: 'rate-limit', message: 'Too many requests', retryAfterSeconds: 12 } } } };
