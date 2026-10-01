import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExportPanel } from './ExportPanel';
import '../panel.css';

const noop = () => {};
const outputs = {
  brief: '# Tinker change brief\n\nPage: http://localhost:5173/\nElements changed: 1 · Changes: 2\n\n## 1. UserCard — `<article>`\n…',
  css: '/* UserCard <article> — src/components/UserCard.tsx */\n.UserCard_card__7Yz-v {\n  padding-top: var(--space-3);\n}\n',
  json: '{\n  "version": 1,\n  "tool": "tinker"\n}\n',
};

const meta = {
  title: 'Side panel/ExportPanel',
  component: ExportPanel,
  args: { outputs, status: null, onCopy: noop, onDownload: noop, onScreenshots: noop },
} satisfies Meta<typeof ExportPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithChanges: Story = {};
export const NothingToExport: Story = { args: { outputs: null } };
export const Copied: Story = { args: { status: 'Change brief copied to the clipboard.' } };
