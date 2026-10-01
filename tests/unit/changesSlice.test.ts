import { describe, expect, it } from 'vitest';
import { statusReceived } from '../../src/sidepanel/connectionSlice';
import { selectionChanged } from '../../src/sidepanel/selectionSlice';
import {
  changesReducer as reduce,
  cleared,
  detachedReceived,
  edited,
  effectiveChanges,
  elementsFor,
  previewCleared,
  previewSet,
  variantKept,
  pendingDiscarded,
  pendingRestored,
  redo,
  removed,
  sessionResolved,
  showOriginalSet,
  undo,
  type ChangesState,
} from '../../src/sidepanel/changesSlice';
import type { Change, TargetRef } from '../../src/shared/types';

const card: TargetRef = { tinkerId: 'card0001', cssPath: 'article' };
const title: TargetRef = { tinkerId: 'title001', cssPath: 'article > h2' };

let clock = 1_000;
let ids = 0;
/** An edit far enough from the previous one that it gets its own undo step. */
const edit = (target: TargetRef, property: string, before: string, after: string, at = (clock += 5_000)) =>
  edited({ id: `c${++ids}`, target, kind: 'style', property, before, after, origin: 'manual', createdAt: at });

const run = (...actions: Parameters<typeof reduce>[1][]): ChangesState =>
  actions.reduce<ChangesState>((state, action) => reduce(state, action), reduce(undefined, { type: 'init' }));
const summary = (state: ChangesState) => state.present.map((c) => `${c.target.tinkerId}.${c.property}:${c.before}>${c.after}`);

describe('edits', () => {
  it('adds a change', () => {
    expect(summary(run(edit(card, 'padding-top', '16px', '24px')))).toEqual(['card0001.padding-top:16px>24px']);
  });

  it('editing the same property again keeps the original "before"', () => {
    const state = run(edit(card, 'padding-top', '16px', '24px'), edit(card, 'padding-top', '24px', '32px'));
    expect(summary(state)).toEqual(['card0001.padding-top:16px>32px']);
  });

  it('setting a property back to its original value removes the change', () => {
    expect(run(edit(card, 'padding-top', '16px', '24px'), edit(card, 'padding-top', '24px', '16px')).present).toEqual([]);
  });

  it('an edit that changes nothing is ignored and leaves history alone', () => {
    const state = run(edit(card, 'padding-top', '16px', '16px'));
    expect(state.present).toEqual([]);
    expect(state.past).toEqual([]);
  });

  it('keeps changes for different elements and properties apart', () => {
    const state = run(edit(card, 'padding-top', '16px', '24px'), edit(title, 'color', 'rgb(0, 0, 0)', 'red'), edit(card, 'gap', '8px', '12px'));
    expect(state.present).toHaveLength(3);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes step by step', () => {
    let state = run(edit(card, 'padding-top', '16px', '24px'), edit(title, 'color', 'rgb(0, 0, 0)', 'red'));
    state = reduce(state, undo());
    expect(summary(state)).toEqual(['card0001.padding-top:16px>24px']);
    state = reduce(state, undo());
    expect(state.present).toEqual([]);
    state = reduce(state, undo()); // nothing left: no-op
    expect(state.present).toEqual([]);
    state = reduce(state, redo());
    state = reduce(state, redo());
    expect(state.present).toHaveLength(2);
    state = reduce(state, redo()); // no-op
    expect(state.present).toHaveLength(2);
  });

  it('undo restores the previous value of a re-edited property, not the original', () => {
    let state = run(edit(card, 'padding-top', '16px', '24px'), edit(card, 'padding-top', '24px', '32px'));
    state = reduce(state, undo());
    expect(summary(state)).toEqual(['card0001.padding-top:16px>24px']);
  });

  it('a new edit after undo discards the redo stack', () => {
    let state = run(edit(card, 'padding-top', '16px', '24px'));
    state = reduce(state, undo());
    state = reduce(state, edit(card, 'gap', '8px', '4px'));
    expect(state.future).toEqual([]);
    expect(summary(reduce(state, redo()))).toEqual(['card0001.gap:8px>4px']);
  });

  it('rapid edits to the same property collapse into one undo step', () => {
    let state = run(
      edit(card, 'padding-top', '16px', '17px', 10_000),
      edit(card, 'padding-top', '17px', '18px', 10_200),
      edit(card, 'padding-top', '18px', '19px', 10_400),
    );
    expect(state.past).toHaveLength(1);
    state = reduce(state, undo());
    expect(state.present).toEqual([]);
  });

  it('rapid edits to different properties stay separate steps', () => {
    const state = run(edit(card, 'padding-top', '16px', '17px', 20_000), edit(card, 'gap', '8px', '9px', 20_100));
    expect(state.past).toHaveLength(2);
  });

  it('removing one change and clearing all are both undoable', () => {
    let state = run(edit(card, 'padding-top', '16px', '24px'), edit(title, 'color', 'rgb(0, 0, 0)', 'red'));
    const first = state.present[0] as Change;
    state = reduce(state, removed(first.id));
    expect(summary(state)).toEqual(['title001.color:rgb(0, 0, 0)>red']);
    state = reduce(state, cleared());
    expect(state.present).toEqual([]);
    state = reduce(reduce(state, undo()), undo());
    expect(state.present).toHaveLength(2);
  });

  it('clearing when there is nothing to clear adds no history', () => {
    expect(run(cleared()).past).toEqual([]);
  });
});

describe('show original, detached', () => {
  it('toggles show-original without touching the change list', () => {
    const state = reduce(run(edit(card, 'gap', '8px', '4px')), showOriginalSet(true));
    expect(state.showOriginal).toBe(true);
    expect(state.present).toHaveLength(1);
  });

  it('records which targets are detached', () => {
    expect(reduce(run(edit(card, 'gap', '8px', '4px')), detachedReceived(['card0001'])).detached).toEqual(['card0001']);
  });
});

describe('sessions', () => {
  const saved: Change[] = [
    { id: 's1', target: card, kind: 'style', property: 'gap', before: '8px', after: '4px', origin: 'manual', createdAt: 1 },
  ];

  it('is not hydrated until the session is resolved', () => {
    expect(run().hydrated).toBe(false);
  });

  it('holds a saved session as pending until the user restores it', () => {
    let state = run(sessionResolved({ pageKey: 'http://localhost:5173/', live: [], saved, reapply: false }));
    expect(state).toMatchObject({ hydrated: true, pageKey: 'http://localhost:5173/', present: [], pending: saved });
    state = reduce(state, pendingRestored());
    expect(state.present).toEqual(saved);
    expect(state.pending).toBeNull();
    expect(reduce(state, undo()).present).toEqual([]);
  });

  it('discarding the pending session drops it', () => {
    const state = reduce(run(sessionResolved({ pageKey: 'k', live: [], saved, reapply: false })), pendingDiscarded());
    expect(state).toMatchObject({ present: [], pending: null });
  });

  it('applies the saved session straight away when re-apply is on', () => {
    const state = run(sessionResolved({ pageKey: 'k', live: [], saved, reapply: true }));
    expect(state).toMatchObject({ present: saved, pending: null, reapply: true });
  });

  it('changes already live on the page win over the saved session', () => {
    const live: Change[] = [{ ...saved[0]!, id: 'live1', after: '2px' }];
    const state = run(sessionResolved({ pageKey: 'k', live, saved, reapply: false }));
    expect(state).toMatchObject({ present: live, pending: null });
  });

  it('resets when the page disconnects', () => {
    const state = reduce(
      run(sessionResolved({ pageKey: 'k', live: [], saved, reapply: true }), showOriginalSet(true)),
      statusReceived({ tabId: 1, status: { state: 'inactive' } }),
    );
    expect(state).toMatchObject({ present: [], hydrated: false, pageKey: null, showOriginal: false });
  });
});

describe('AI variants', () => {
  const ai = (property: string, before: string, after: string, id = `ai-${property}`): Change => ({
    id, target: card, kind: 'style', property, before, after, origin: 'ai', createdAt: 99,
  });

  it('a previewed variant is laid over the change list without entering it', () => {
    let state = run(edit(card, 'padding-top', '16px', '24px'));
    state = reduce(state, previewSet([ai('padding-top', '24px', '32px'), ai('gap', '8px', '4px')]));
    expect(summary(state)).toEqual(['card0001.padding-top:16px>24px']);
    const shown = effectiveChanges(state.present, state.preview);
    expect(shown.map((c) => `${c.property}:${c.before}>${c.after}`)).toEqual(['padding-top:16px>32px', 'gap:8px>4px']);
    expect(effectiveChanges(state.present, null)).toBe(state.present);
  });

  it('switching variants replaces the preview; clearing removes it', () => {
    let state = run(previewSet([ai('gap', '8px', '4px')]), previewSet([ai('color', 'black', 'red')]));
    expect(state.preview?.map((c) => c.property)).toEqual(['color']);
    state = reduce(state, previewCleared());
    expect(state.preview).toBeNull();
    expect(state.past).toEqual([]);
  });

  it('keeping a variant adds all of its changes as one undo step', () => {
    let state = run(edit(card, 'padding-top', '16px', '24px'), previewSet([ai('gap', '8px', '4px')]));
    state = reduce(state, variantKept([ai('padding-top', '24px', '32px'), ai('gap', '8px', '4px')]));
    expect(state.preview).toBeNull();
    expect(summary(state)).toEqual(['card0001.padding-top:16px>32px', 'card0001.gap:8px>4px']);
    expect(state.present.map((c) => c.origin)).toEqual(['ai', 'ai']);
    state = reduce(state, undo());
    expect(summary(state)).toEqual(['card0001.padding-top:16px>24px']);
  });

  it('keeping a variant with no effective changes adds no history', () => {
    const state = run(variantKept([ai('gap', '8px', '8px')]));
    expect(state.past).toEqual([]);
  });
});

describe('element details for exports', () => {
  const info = {
    target: card, tag: 'article', classes: ['UserCard_card__7Yz-v'], componentName: 'UserCard', ownerChain: ['App', 'UserCard'],
    source: { file: 'src/components/UserCard.tsx' }, reactBuild: 'development' as const,
    styling: [{ system: 'css-modules' as const, evidence: [], classes: ['UserCard_card__7Yz-v'] }],
    computed: {}, props: { name: 'Ada' }, hasParent: true, hasChild: true,
  };

  it('records what is known about each selected element, without props or computed styles', () => {
    const state = run(selectionChanged(info));
    expect(state.elements.card0001).toEqual({
      tag: 'article', classes: ['UserCard_card__7Yz-v'], componentName: 'UserCard', ownerChain: ['App', 'UserCard'],
      source: { file: 'src/components/UserCard.tsx' }, reactBuild: 'development', styling: info.styling,
    });
  });

  it('restores saved details with the session, and only exports the ones that have changes', () => {
    const saved = { title001: { tag: 'h2', classes: [], styling: [] } };
    const state = run(selectionChanged(info), sessionResolved({ pageKey: 'k', live: [], saved: [], reapply: false, elements: saved }), edit(card, 'gap', '8px', '4px'));
    expect(Object.keys(state.elements).sort()).toEqual(['card0001', 'title001']);
    expect(Object.keys(elementsFor(state.present, state.elements))).toEqual(['card0001']);
  });
});
