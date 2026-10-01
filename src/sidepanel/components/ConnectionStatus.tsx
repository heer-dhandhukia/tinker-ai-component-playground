import type { TabStatus } from '../../shared/messages';

export interface ConnectionStatusProps {
  status: TabStatus;
}

function describe(status: TabStatus): { label: string; detail: string } {
  switch (status.state) {
    case 'inactive':
      return {
        label: 'Not active on this page',
        detail: 'Click the Tinker toolbar icon on the page you want to work on.',
      };
    case 'error':
      return { label: 'Could not start on this page', detail: status.message };
    case 'connected':
      if (!status.bridge.reachable) {
        return {
          label: 'Connected',
          detail: 'Page bridge did not answer; React info will be unavailable.',
        };
      }
      return {
        label: 'Connected',
        detail: status.bridge.hookPresent
          ? 'Page bridge ready. React DevTools hook found.'
          : 'Page bridge ready. No React DevTools hook on this page.',
      };
  }
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  const { label, detail } = describe(status);
  return (
    <section className={`status status--${status.state}`} data-state={status.state}>
      <p className="status__label" data-testid="connection-status">
        {label}
      </p>
      <p className="status__detail" data-testid="connection-detail">
        {detail}
      </p>
    </section>
  );
}
