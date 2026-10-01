import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ElementMeta } from '../shared/element-info';
import type { Change } from '../shared/types';
import { statusReceived } from './connectionSlice';
import { selectionChanged } from './selectionSlice';

const HISTORY_LIMIT = 100;
/** Edits to the same property closer together than this become one undo step. */
const COALESCE_MS = 1000;

export interface ChangesState {
  past: Change[][];
  present: Change[];
  future: Change[][];
  /** All overrides switched off on the page, without losing them. */
  showOriginal: boolean;
  /** tinkerIds whose element could not be found on the page. */
  detached: string[];
  lastEdit: { key: string; at: number } | null;
  /** The page this change list belongs to; null until the content script reports it. */
  pageKey: string | null;
  /** The saved session has been looked up, so it is safe to write to storage. */
  hydrated: boolean;
  /** A saved session from an earlier visit, waiting for the user to restore or discard it. */
  pending: Change[] | null;
  reapply: boolean;
  /** An AI variant being tried out live. Shown on the page, not part of the change list yet. */
  preview: Change[] | null;
  /** Details of every element selected in this session, by tinkerId; exports use them. */
  elements: Record<string, ElementMeta>;
}

const initialState: ChangesState = {
  past: [],
  present: [],
  future: [],
  showOriginal: false,
  detached: [],
  lastEdit: null,
  pageKey: null,
  hydrated: false,
  pending: null,
  reapply: false,
  preview: null,
  elements: {},
};

const editKey = (change: Pick<Change, 'target' | 'property'>) => `${change.target.tinkerId}|${change.property}`;

/**
 * Adds or updates one change. A property that already has a change keeps its original
 * "before" (and id), so the change still describes source -> result; setting it back to that
 * original value removes the change. Returns the same array when nothing changes.
 */
function upsert(list: Change[], incoming: Change): Change[] {
  const key = editKey(incoming);
  const existing = list.find((change) => editKey(change) === key);
  if (!existing) return incoming.before === incoming.after ? list : [...list, incoming];
  if (incoming.after === existing.before) return list.filter((change) => change !== existing);
  const { token: _dropped, ...rest } = existing;
  const merged: Change = {
    ...rest,
    after: incoming.after,
    origin: incoming.origin,
    createdAt: incoming.createdAt,
    ...(incoming.token ? { token: incoming.token } : {}),
  };
  return list.map((change) => (change === existing ? merged : change));
}

/** What the page should show: the change list with the previewed variant laid over it. */
export function effectiveChanges(present: Change[], preview: Change[] | null): Change[] {
  return preview ? preview.reduce(upsert, present) : present;
}

function commit(state: ChangesState, next: Change[]) {
  state.past.push(state.present);
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.present = next;
  state.future = [];
}

const changesSlice = createSlice({
  name: 'changes',
  initialState,
  reducers: {
    edited(state, action: PayloadAction<Change>) {
      const incoming = action.payload;
      const key = editKey(incoming);
      const next = upsert(state.present, incoming);
      if (next === state.present) return;

      const coalesce =
        state.lastEdit?.key === key && incoming.createdAt - state.lastEdit.at < COALESCE_MS && state.past.length > 0;
      if (coalesce) {
        state.present = next;
        state.future = [];
      } else {
        commit(state, next);
      }
      state.lastEdit = { key, at: incoming.createdAt };
    },
    removed(state, action: PayloadAction<string>) {
      if (!state.present.some((change) => change.id === action.payload)) return;
      commit(state, state.present.filter((change) => change.id !== action.payload));
      state.lastEdit = null;
    },
    cleared(state) {
      if (state.present.length === 0) return;
      commit(state, []);
      state.lastEdit = null;
    },
    undo(state) {
      const previous = state.past.pop();
      if (!previous) return;
      state.future.unshift(state.present);
      state.present = previous;
      state.lastEdit = null;
    },
    redo(state) {
      const next = state.future.shift();
      if (!next) return;
      state.past.push(state.present);
      state.present = next;
      state.lastEdit = null;
    },
    showOriginalSet(state, action: PayloadAction<boolean>) {
      state.showOriginal = action.payload;
    },
    detachedReceived(state, action: PayloadAction<string[]>) {
      state.detached = action.payload;
    },
    sessionResolved(
      state,
      action: PayloadAction<{ pageKey: string; live: Change[]; saved: Change[]; reapply: boolean; elements?: Record<string, ElementMeta> }>,
    ) {
      const { pageKey, live, saved, reapply } = action.payload;
      state.pageKey = pageKey;
      state.hydrated = true;
      state.reapply = reapply;
      // Keep anything selected before the session resolved; saved details fill the rest.
      state.elements = { ...action.payload.elements, ...state.elements };
      state.past = [];
      state.future = [];
      state.lastEdit = null;
      if (live.length > 0) {
        // The panel was reopened on a page that already has changes applied.
        state.present = live;
        state.pending = null;
      } else if (reapply) {
        state.present = saved;
        state.pending = null;
      } else {
        state.present = [];
        state.pending = saved.length > 0 ? saved : null;
      }
    },
    pendingRestored(state) {
      if (!state.pending) return;
      commit(state, state.pending);
      state.pending = null;
      state.lastEdit = null;
    },
    pendingDiscarded(state) {
      state.pending = null;
    },
    reapplySet(state, action: PayloadAction<boolean>) {
      state.reapply = action.payload;
    },
    previewSet(state, action: PayloadAction<Change[]>) {
      state.preview = action.payload;
    },
    previewCleared(state) {
      state.preview = null;
    },
    /** Adds a whole AI variant to the change list as a single undo step. */
    variantKept(state, action: PayloadAction<Change[]>) {
      state.preview = null;
      const next = action.payload.reduce(upsert, state.present);
      if (next === state.present) return;
      commit(state, next);
      state.lastEdit = null;
    },
  },
  extraReducers: (builder) => {
    // The page reloaded or navigated: its overrides are gone with it. Storage keeps the session.
    builder
      .addCase(statusReceived, (state, action) => (action.payload.status.state === 'connected' ? state : initialState))
      // A previewed variant belongs to the element it was made for.
      .addCase(selectionChanged, (state, action) => {
        const info = action.payload;
        const tinkerId = info?.target.tinkerId;
        if (state.preview?.some((change) => change.target.tinkerId !== tinkerId)) state.preview = null;
        if (info) {
          state.elements[info.target.tinkerId] = {
            tag: info.tag,
            classes: info.classes,
            ...(info.componentName ? { componentName: info.componentName } : {}),
            ...(info.via ? { via: info.via } : {}),
            ...(info.ownerChain ? { ownerChain: info.ownerChain } : {}),
            ...(info.source ? { source: info.source } : {}),
            ...(info.reactBuild ? { reactBuild: info.reactBuild } : {}),
            styling: info.styling,
          };
        }
      });
  },
});

export const {
  edited,
  removed,
  cleared,
  undo,
  redo,
  showOriginalSet,
  detachedReceived,
  sessionResolved,
  pendingRestored,
  pendingDiscarded,
  reapplySet,
  previewSet,
  previewCleared,
  variantKept,
} = changesSlice.actions;
export const changesReducer = changesSlice.reducer;

/** Element details for just the elements the changes refer to. */
export function elementsFor(changes: readonly Change[], elements: Record<string, ElementMeta>): Record<string, ElementMeta> {
  const used: Record<string, ElementMeta> = {};
  for (const change of changes) {
    const meta = elements[change.target.tinkerId];
    if (meta) used[change.target.tinkerId] = meta;
  }
  return used;
}
