// The change engine: makes the page match a list of changes, and keeps it matching while
// React re-renders and re-mounts elements.
import { EDITABLE_PROPERTIES, buildOverrideCss, isSafeCssValue } from '../shared/changes';
import type { Change, TargetRef } from '../shared/types';
import { TINKER_ID_ATTRIBUTE, textSnippetOf } from './element-info';
import { chooseMatch, type Candidate } from './refind';

const STYLE_ELEMENT_ID = 'tinker-overrides';
const TINKER_ID = /^[a-z0-9-]{1,64}$/;
const MAX_PATH_CANDIDATES = 10;
const MAX_LOOKALIKES = 20;
/** How long to wait before retrying targets that are detached, after the DOM changes. */
const DETACHED_RETRY_MS = 150;

export interface EngineOptions {
  /** App-code owner chain of an element, from the bridge. Undefined when unavailable. */
  componentPathOf(element: Element): Promise<string[] | undefined>;
  onDetachedChange(detached: string[]): void;
  /** A target's element was replaced and the new one has been tagged. */
  onRetagged(tinkerId: string, element: Element): void;
  /** Writes timings to the override <style> element's dataset (e2e builds only). */
  exposeTimings: boolean;
}

export interface Engine {
  /** Replaces the change list. Resolves with the detached tinkerIds. */
  apply(changes: Change[], enabled: boolean): Promise<string[]>;
  state(): { changes: Change[]; enabled: boolean; detached: string[] };
  /** The text an element had before a text change was applied to it. */
  originalTextOf(element: Element): string | undefined;
}

function tagFromCssPath(cssPath: string): string | null {
  const last = cssPath.split(' > ').at(-1) ?? '';
  return /^([a-z][a-z0-9-]*)(?::nth-of-type\(\d+\))?$/.exec(last)?.[1] ?? null;
}

export function createEngine(options: EngineOptions): Engine {
  let changes: Change[] = [];
  let enabled = true;
  let detached = new Set<string>();
  const elements = new Map<string, Element>();
  /** Text changes currently written into the DOM, by tinkerId. */
  const appliedText = new Map<string, { before: string; after: string }>();
  let styleElement: HTMLStyleElement | null = null;
  let running: Promise<void> | null = null;
  let rerun = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let reconcileCount = 0;

  const targets = () => {
    const unique = new Map<string, TargetRef>();
    for (const change of changes) {
      if (TINKER_ID.test(change.target.tinkerId) && !unique.has(change.target.tinkerId)) {
        unique.set(change.target.tinkerId, change.target);
      }
    }
    return [...unique.values()];
  };

  const ensureStyleElement = () => {
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = STYLE_ELEMENT_ID;
    }
    if (!styleElement.isConnected) (document.head ?? document.documentElement).append(styleElement);
    return styleElement;
  };

  const renderStyles = () => {
    const valid = changes.filter(
      (change) =>
        change.kind === 'style' &&
        EDITABLE_PROPERTIES.has(change.property) &&
        isSafeCssValue(change.after) &&
        CSS.supports(change.property, change.after),
    );
    const css = enabled ? buildOverrideCss(valid) : '';
    if (!css && !styleElement) return;
    const element = ensureStyleElement();
    if (element.textContent !== css) element.textContent = css;
  };

  /** Best-effort text edits: only on elements without child elements, and React may undo them. */
  const renderText = () => {
    const wanted = new Map<string, { before: string; after: string }>();
    if (enabled) {
      for (const change of changes) {
        if (change.kind === 'text') wanted.set(change.target.tinkerId, { before: change.before, after: change.after });
      }
    }
    for (const [tinkerId, applied] of appliedText) {
      if (wanted.has(tinkerId)) continue;
      const element = elements.get(tinkerId) ?? document.querySelector(`[${TINKER_ID_ATTRIBUTE}="${tinkerId}"]`);
      if (element && element.textContent === applied.after) element.textContent = applied.before;
      appliedText.delete(tinkerId);
    }
    for (const [tinkerId, text] of wanted) {
      const element = elements.get(tinkerId);
      if (!element || element.childElementCount > 0) continue;
      if (element.textContent !== text.after) element.textContent = text.after;
      appliedText.set(tinkerId, text);
    }
  };

  const describe = async (ref: TargetRef, element: Element, viaCssPath: boolean): Promise<Candidate> => ({
    viaCssPath,
    componentPath: ref.componentPath ? await options.componentPathOf(element) : undefined,
    textSnippet: textSnippetOf(element),
    taggedAs: element.getAttribute(TINKER_ID_ATTRIBUTE),
  });

  /** Finds the element a lost target now refers to, or null if that is not certain. */
  const refind = async (ref: TargetRef): Promise<Element | null> => {
    let onPath: Element[] = [];
    try {
      onPath = [...document.querySelectorAll(ref.cssPath)].slice(0, MAX_PATH_CANDIDATES);
    } catch {
      // A stored path that is no longer a valid selector: fall through to the lookalike search.
    }
    const pathCandidates = await Promise.all(onPath.map((element) => describe(ref, element, true)));
    const direct = chooseMatch(ref, pathCandidates);
    if (direct !== null) return onPath[direct] ?? null;

    const tag = tagFromCssPath(ref.cssPath);
    if (!tag || !ref.componentPath || !ref.textSnippet) return null;
    const lookalikes = [...document.getElementsByTagName(tag)].filter(
      (element) => !onPath.includes(element) && textSnippetOf(element) === ref.textSnippet,
    );
    if (lookalikes.length === 0 || lookalikes.length > MAX_LOOKALIKES) return null;
    const all = [...onPath, ...lookalikes];
    const candidates = [
      ...pathCandidates,
      ...(await Promise.all(lookalikes.map((element) => describe(ref, element, false)))),
    ];
    const index = chooseMatch(ref, candidates);
    return index === null ? null : (all[index] ?? null);
  };

  const reconcileOnce = async () => {
    const started = performance.now();
    const lost: TargetRef[] = [];
    const wanted = new Set<string>();
    for (const ref of targets()) {
      wanted.add(ref.tinkerId);
      let element = elements.get(ref.tinkerId);
      if (!element?.isConnected || element.getAttribute(TINKER_ID_ATTRIBUTE) !== ref.tinkerId) {
        element = document.querySelector(`[${TINKER_ID_ATTRIBUTE}="${ref.tinkerId}"]`) ?? undefined;
      }
      if (element) elements.set(ref.tinkerId, element);
      else {
        elements.delete(ref.tinkerId);
        lost.push(ref);
      }
    }
    for (const tinkerId of elements.keys()) if (!wanted.has(tinkerId)) elements.delete(tinkerId);

    const nowDetached = new Set<string>();
    for (const ref of lost) {
      const element = await refind(ref);
      // Re-check: the page may have changed while the bridge was answering.
      if (element?.isConnected && (element.getAttribute(TINKER_ID_ATTRIBUTE) ?? ref.tinkerId) === ref.tinkerId) {
        element.setAttribute(TINKER_ID_ATTRIBUTE, ref.tinkerId);
        elements.set(ref.tinkerId, element);
        options.onRetagged(ref.tinkerId, element);
      } else {
        nowDetached.add(ref.tinkerId);
      }
    }

    renderStyles();
    renderText();

    const changed = nowDetached.size !== detached.size || [...nowDetached].some((id) => !detached.has(id));
    detached = nowDetached;
    if (changed) options.onDetachedChange([...detached]);

    if (options.exposeTimings && styleElement) {
      styleElement.dataset.reconcileMs = (performance.now() - started).toFixed(2);
      styleElement.dataset.reconcileCount = String(++reconcileCount);
      styleElement.dataset.retagged = String(lost.length - nowDetached.size);
    }
  };

  /** Runs reconcile; calls made while one is running are folded into a single follow-up run. */
  const reconcile = (): Promise<void> => {
    if (running) {
      rerun = true;
      return running;
    }
    running = (async () => {
      do {
        rerun = false;
        await reconcileOnce();
      } while (rerun);
    })().finally(() => {
      running = null;
    });
    return running;
  };

  // MutationObserver callbacks run before the next paint, so the common case (React updated
  // the element in place) costs one isConnected check per target and nothing else.
  const observer = new MutationObserver(() => {
    if (changes.length === 0) return;
    let lostSomething = styleElement !== null && !styleElement.isConnected;
    if (!lostSomething) {
      for (const element of elements.values()) {
        if (!element.isConnected) {
          lostSomething = true;
          break;
        }
      }
    }
    if (lostSomething) {
      void reconcile();
    } else {
      renderText();
      if (detached.size > 0 && retryTimer === undefined) {
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          void reconcile();
        }, DETACHED_RETRY_MS);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  return {
    async apply(next, nextEnabled) {
      changes = next;
      enabled = nextEnabled;
      // Reflect value edits immediately; reconcile then deals with anything lost.
      renderStyles();
      rerun = running !== null;
      await reconcile();
      return [...detached];
    },
    state: () => ({ changes, enabled, detached: [...detached] }),
    originalTextOf(element) {
      const tinkerId = element.getAttribute(TINKER_ID_ATTRIBUTE);
      return tinkerId ? appliedText.get(tinkerId)?.before : undefined;
    },
  };
}
