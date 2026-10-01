import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DesignToken } from '../shared/tokens';
import type { ElementInfo } from '../shared/types';
import { statusReceived } from './connectionSlice';

export interface SelectionState {
  picking: boolean;
  info: ElementInfo | null;
  /** Design tokens found on the page's :root. */
  tokens: DesignToken[];
}

const initialState: SelectionState = { picking: false, info: null, tokens: [] };

const selectionSlice = createSlice({
  name: 'selection',
  initialState,
  reducers: {
    pickingChanged(state, action: PayloadAction<boolean>) {
      state.picking = action.payload;
    },
    selectionChanged(state, action: PayloadAction<ElementInfo | null>) {
      state.info = action.payload;
    },
    tokensReceived(state, action: PayloadAction<DesignToken[]>) {
      state.tokens = action.payload;
    },
  },
  extraReducers: (builder) => {
    // The page reloaded or navigated: whatever was selected is gone.
    builder.addCase(statusReceived, (state, action) => {
      if (action.payload.status.state !== 'connected') return initialState;
      return state;
    });
  },
});

export const { pickingChanged, selectionChanged, tokensReceived } = selectionSlice.actions;
export const selectionReducer = selectionSlice.reducer;
