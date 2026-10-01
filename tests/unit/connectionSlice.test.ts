import { describe, expect, it } from 'vitest';
import { connectionReducer, statusReceived, tabResolved } from '../../src/sidepanel/connectionSlice';

describe('connectionSlice', () => {
  it('ignores status updates for other tabs', () => {
    let state = connectionReducer(undefined, tabResolved(3));
    state = connectionReducer(
      state,
      statusReceived({ tabId: 9, status: { state: 'error', message: 'other tab' } }),
    );
    expect(state.status).toEqual({ state: 'inactive' });
  });

  it('stores status updates for the bound tab', () => {
    const status = { state: 'connected', bridge: { reachable: true, hookPresent: true } } as const;
    let state = connectionReducer(undefined, tabResolved(3));
    state = connectionReducer(state, statusReceived({ tabId: 3, status }));
    expect(state.status).toEqual(status);
  });

  it('forgets the previous tab\'s status when bound to another tab', () => {
    const status = { state: 'connected', bridge: { reachable: true, hookPresent: true } } as const;
    let state = connectionReducer(undefined, tabResolved(3));
    state = connectionReducer(state, statusReceived({ tabId: 3, status }));
    state = connectionReducer(state, tabResolved(8));
    expect(state).toEqual({ tabId: 8, status: { state: 'inactive' } });
    // Late news about the old tab is ignored.
    state = connectionReducer(state, statusReceived({ tabId: 3, status }));
    expect(state.status).toEqual({ state: 'inactive' });
  });
});
