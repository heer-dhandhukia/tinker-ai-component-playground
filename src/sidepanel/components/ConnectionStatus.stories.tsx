import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConnectionStatus } from './ConnectionStatus';
import '../panel.css';

const meta = {
  title: 'Side panel/ConnectionStatus',
  component: ConnectionStatus,
} satisfies Meta<typeof ConnectionStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inactive: Story = { args: { status: { state: 'inactive' } } };

export const Connected: Story = {
  args: { status: { state: 'connected', bridge: { reachable: true, hookPresent: true } } },
};

export const ConnectedWithoutReact: Story = {
  args: { status: { state: 'connected', bridge: { reachable: true, hookPresent: false } } },
};

export const BridgeUnreachable: Story = {
  args: { status: { state: 'connected', bridge: { reachable: false, hookPresent: false } } },
};

export const Failed: Story = {
  args: { status: { state: 'error', message: 'Cannot access a chrome:// URL' } },
};
