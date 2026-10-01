import type { TargetRef } from '../shared/types';

/** What we know about an element that might be the one a TargetRef used to point at. */
export interface Candidate {
  /** Found by the target's cssPath (as opposed to a document-wide search). */
  viaCssPath: boolean;
  /** App-code owner chain from the bridge; undefined if React info is unavailable. */
  componentPath?: string[] | undefined;
  textSnippet?: string | undefined;
  /** The data-tinker-id the element already carries, if any. */
  taggedAs: string | null;
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

function agrees(ref: TargetRef, candidate: Candidate): boolean {
  if (candidate.taggedAs !== null && candidate.taggedAs !== ref.tinkerId) return false;
  if (ref.componentPath && !(candidate.componentPath && sameList(ref.componentPath, candidate.componentPath))) {
    return false;
  }
  return (ref.textSnippet ?? '') === (candidate.textSnippet ?? '');
}

/**
 * Decides which candidate, if any, is certainly the target. Returns its index, or null.
 * The rule is deliberately strict: a change must never land on a guessed element, so any
 * doubt (no candidate, several candidates, a mismatch in component or text) means null and
 * the change is shown as detached instead.
 */
export function chooseMatch(ref: TargetRef, candidates: readonly Candidate[]): number | null {
  const matching = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => agrees(ref, candidate));

  const onPath = matching.filter(({ candidate }) => candidate.viaCssPath);
  if (onPath.length === 1) return onPath[0]!.index;
  if (onPath.length > 1) return null;

  // The element moved (e.g. a list item re-mounted elsewhere). Without the path, only a
  // unique element with the same component chain AND the same text is trusted.
  if (!ref.componentPath || !ref.textSnippet) return null;
  return matching.length === 1 ? matching[0]!.index : null;
}
