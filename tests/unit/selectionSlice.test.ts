import { describe, expect, it } from 'vitest';
import { statusReceived } from '../../src/sidepanel/connectionSlice';
import { pickingChanged, selectionChanged, selectionReducer } from '../../src/sidepanel/selectionSlice';
import type { ElementInfo } from '../../src/shared/types';

const info: ElementInfo = {
  target: { tinkerId: 'abc', cssPath: 'div' },
  tag: 'div',
  classes: [],
  styling: [{ system: 'unknown', evidence: [] }],
  computed: {},
  hasParent: true,
  hasChild: false,
};

describe('selectionSlice', () => {
  it('tracks picking and the selection', () => {
    let state = selectionReducer(undefined, pickingChanged(true));
    state = selectionReducer(state, selectionChanged(info));
    expect(state).toEqual({ picking: true, info, tokens: [] });
  });

  it('drops the selection when the page stops being connected', () => {
    let state = selectionReducer(undefined, selectionChanged(info));
    state = selectionReducer(state, statusReceived({ tabId: 1, status: { state: 'inactive' } }));
    expect(state).toEqual({ picking: false, info: null, tokens: [] });
  });

  it('keeps the selection across connected status updates', () => {
    let state = selectionReducer(undefined, selectionChanged(info));
    const status = { state: 'connected', bridge: { reachable: true, hookPresent: true } } as const;
    state = selectionReducer(state, statusReceived({ tabId: 1, status }));
    expect(state.info).toEqual(info);
  });
});
