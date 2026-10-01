import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TabStatus } from '../shared/messages';

export interface ConnectionState {
  tabId: number | null;
  status: TabStatus;
}

const initialState: ConnectionState = { tabId: null, status: { state: 'inactive' } };

const connectionSlice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    tabResolved(state, action: PayloadAction<number>) {
      // A different tab: its status is unknown until the background reports it.
      if (state.tabId !== action.payload) state.status = { state: 'inactive' };
      state.tabId = action.payload;
    },
    statusReceived(state, action: PayloadAction<{ tabId: number; status: TabStatus }>) {
      // Broadcasts cover every tab; only the one this panel is bound to matters.
      if (action.payload.tabId === state.tabId) state.status = action.payload.status;
    },
  },
});

export const { tabResolved, statusReceived } = connectionSlice.actions;
export const connectionReducer = connectionSlice.reducer;
