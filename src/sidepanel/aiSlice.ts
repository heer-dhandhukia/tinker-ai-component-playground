import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AiContext, AiError, AiRequest, DroppedChange, Usage } from '../shared/ai';
import type { Variant } from '../shared/types';
import { statusReceived } from './connectionSlice';
import { selectionChanged } from './selectionSlice';

export interface AiOutcome {
  variants: Variant[];
  dropped: DroppedChange[];
  usage: Usage;
  /** USD, or null when the model's price is not known. */
  cost: number | null;
  model: string;
  attempts: number;
  /** 'attached', 'not-requested', or why the screenshot was left out. */
  screenshot: string;
  /** True when the single requested change has already been added to the change list. */
  applied: boolean;
}

export interface AiState {
  phase: 'idle' | 'preview' | 'loading' | 'ready' | 'error';
  /** The request waiting in the "what will be sent" preview. */
  pending: { context: AiContext; request: AiRequest; instruction: string; screenshot: boolean; destination: string } | null;
  /** The user has seen what is sent to the API during this panel session. */
  previewAcknowledged: boolean;
  /** tinkerId of the element the current results belong to. */
  targetId: string | null;
  outcome: AiOutcome | null;
  active: number;
  error: AiError | null;
}

const initialState: AiState = {
  phase: 'idle',
  pending: null,
  previewAcknowledged: false,
  targetId: null,
  outcome: null,
  active: 0,
  error: null,
};

const reset = (state: AiState): AiState => ({ ...initialState, previewAcknowledged: state.previewAcknowledged });

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    previewOpened(state, action: PayloadAction<NonNullable<AiState['pending']>>) {
      state.phase = 'preview';
      state.pending = action.payload;
      state.outcome = null;
      state.error = null;
    },
    requestStarted(state, action: PayloadAction<string>) {
      state.phase = 'loading';
      state.pending = null;
      state.previewAcknowledged = true;
      state.targetId = action.payload;
      state.outcome = null;
      state.error = null;
    },
    requestSucceeded(state, action: PayloadAction<AiOutcome>) {
      state.phase = 'ready';
      state.outcome = action.payload;
      state.active = 0;
    },
    requestFailed(state, action: PayloadAction<AiError>) {
      state.phase = 'error';
      state.error = action.payload;
    },
    variantSelected(state, action: PayloadAction<number>) {
      state.active = action.payload;
    },
    aiDismissed: (state) => reset(state),
  },
  extraReducers: (builder) => {
    builder
      // Results belong to one element; selecting another one drops them.
      .addCase(selectionChanged, (state, action) => {
        const tinkerId = action.payload?.target.tinkerId ?? null;
        if (state.phase !== 'idle' && state.phase !== 'error' && tinkerId !== state.targetId && state.phase !== 'preview') {
          return reset(state);
        }
        if (state.phase === 'preview' && tinkerId !== state.pending?.context.target.tinkerId) return reset(state);
        return state;
      })
      .addCase(statusReceived, (state, action) =>
        action.payload.status.state === 'connected' ? state : reset(state),
      );
  },
});

export const { previewOpened, requestStarted, requestSucceeded, requestFailed, variantSelected, aiDismissed } =
  aiSlice.actions;
export const aiReducer = aiSlice.reducer;
