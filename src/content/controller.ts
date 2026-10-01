import { browser } from 'wxt/browser';
import { HTML_CAP, prepareHtml, type AiContext } from '../shared/ai';
import { pageKeyOf } from '../shared/changes';
import type { ReactInfo } from '../shared/element-info';
import type { ContentEvent, SelectionSnapshot } from '../shared/messages';
import type { Change, ElementInfo } from '../shared/types';
import type { BridgeClient } from './bridge-client';
import { createEngine } from './engine';
import { buildElementInfo } from './element-info';
import { createPicker } from './picker';
import { extractTokens } from './tokens-extract';

const BRIDGE_WAIT_MS = 2500;

export interface Controller {
  /** Called once the bridge handshake has finished (null if it never answered). */
  setBridge(bridge: BridgeClient | null): void;
  startPicking(): void;
  stopPicking(): void;
  selectRelative(direction: 'parent' | 'child'): void;
  applyChanges(changes: Change[], enabled: boolean): Promise<string[]>;
  snapshot(): SelectionSnapshot;
  /** Everything the AI would be told about the selected element, or null if nothing is selected. */
  aiContext(): AiContext | null;
  setOverlayVisible(visible: boolean): void;
  /** Turns overrides on or off, keeping the change list. */
  setChangesEnabled(enabled: boolean): Promise<void>;
  /** Where tagged elements are in the viewport right now (null if not on the page). */
  rectsOf(tinkerIds: string[]): { rects: Record<string, { x: number; y: number; width: number; height: number } | null>; devicePixelRatio: number };
}

const PARENT_LAYOUT_PROPERTIES = [
  'display', 'flex-direction', 'flex-wrap', 'gap', 'align-items', 'justify-content',
  'grid-template-columns', 'width', 'height', 'background-color',
];
const PROPS_SUMMARY_CAP = 600;

/** Owns the picker, the current selection and the change engine, and reports to the side panel. */
export function createController(): Controller {
  const e2e = import.meta.env.MODE === 'e2e';
  let bridge: BridgeClient | null = null;
  let bridgeSettled!: () => void;
  const bridgeReady = new Promise<void>((resolve) => (bridgeSettled = resolve));

  let selected: Element | null = null;
  let selectedReact: ReactInfo | null = null;
  let lastSelectedId: string | null = null;
  let info: ElementInfo | null = null;
  let generation = 0;

  const emit = (event: ContentEvent) => {
    // Rejects when no extension page is open to hear it.
    browser.runtime.sendMessage(event).catch(() => {});
  };

  const engine = createEngine({
    componentPathOf: async (element) => (await bridge?.inspect(element, 'name'))?.ownerChain,
    onDetachedChange: (detached) => emit({ type: 'changes/status', detached }),
    onRetagged: (tinkerId, element) => {
      // The selected element was re-mounted: follow it to the new node.
      if (selected === null && tinkerId === lastSelectedId) void select(element);
    },
    exposeTimings: e2e,
  });

  const publish = (element: Element) => {
    info = buildElementInfo(element, selectedReact, engine.originalTextOf(element));
    lastSelectedId = info.target.tinkerId;
    emit({ type: 'selection/changed', info });
  };

  const select = async (element: Element | null) => {
    const current = ++generation;
    selected = element;
    picker.setSelected(element);
    if (!element) {
      info = null;
      emit({ type: 'selection/changed', info: null });
      return;
    }
    const react = bridge ? await bridge.inspect(element, 'full') : null;
    // A newer selection was made while the bridge was answering.
    if (current !== generation) return;
    selectedReact = react;
    publish(element);
  };

  const picker = createPicker({
    componentNameFor: async (element) => (await bridge?.inspect(element, 'name'))?.componentName,
    onSelect: (element) => {
      lastSelectedId = null;
      void select(element);
    },
    onPickingChange: (picking) => emit({ type: 'picker/changed', picking }),
    onSelectionLost: () => void select(null),
    exposeState: e2e,
  });

  return {
    setBridge(next) {
      bridge?.dispose();
      bridge = next;
      bridgeSettled();
    },
    startPicking: () => picker.start(),
    stopPicking: () => picker.stop(),
    selectRelative(direction) {
      if (!selected) return;
      const next =
        direction === 'parent'
          ? selected === document.body ? null : selected.parentElement
          : [...selected.children].find((child) => !child.hasAttribute('data-tinker-overlay'));
      if (next) {
        lastSelectedId = null;
        void select(next);
      }
    },
    async applyChanges(changes, enabled) {
      // Re-finding elements needs React info, so wait for the bridge (bounded).
      await Promise.race([bridgeReady, new Promise((resolve) => setTimeout(resolve, BRIDGE_WAIT_MS))]);
      const detached = await engine.apply(changes, enabled);
      // Computed styles changed: refresh what the panel shows for the selection.
      if (selected?.isConnected) publish(selected);
      return detached;
    },
    aiContext() {
      if (!selected?.isConnected || !info) return null;
      const parent = selected.parentElement;
      const parentStyle = parent ? getComputedStyle(parent) : null;
      const rect = selected.getBoundingClientRect();
      const props = info.props && Object.keys(info.props).length > 0 ? JSON.stringify(info.props) : undefined;
      return {
        target: info.target,
        tag: info.tag,
        classes: info.classes.slice(0, 200).map((name) => name.slice(0, 300)),
        html: prepareHtml(selected.outerHTML, HTML_CAP),
        ...(info.componentName ? { componentName: info.componentName } : {}),
        ...(info.via ? { via: info.via } : {}),
        ...(props ? { props: props.length > PROPS_SUMMARY_CAP ? `${props.slice(0, PROPS_SUMMARY_CAP)}…` : props } : {}),
        computed: info.computed,
        parent:
          parent && parentStyle
            ? {
                tag: parent.localName,
                computed: Object.fromEntries(
                  PARENT_LAYOUT_PROPERTIES.map((property) => [property, parentStyle.getPropertyValue(property)]),
                ),
              }
            : null,
        tokens: extractTokens(document),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        devicePixelRatio: window.devicePixelRatio,
      };
    },
    setOverlayVisible: (visible) => picker.setVisible(visible),
    async setChangesEnabled(enabled) {
      await engine.apply(engine.state().changes, enabled);
    },
    rectsOf(tinkerIds) {
      const rects: ReturnType<Controller['rectsOf']>['rects'] = {};
      for (const tinkerId of tinkerIds) {
        const rect = document.querySelector(`[data-tinker-id="${tinkerId}"]`)?.getBoundingClientRect();
        rects[tinkerId] = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      }
      return { rects, devicePixelRatio: window.devicePixelRatio };
    },
    snapshot: () => ({
      picking: picker.isPicking(),
      info,
      pageKey: pageKeyOf(location.href),
      tokens: extractTokens(document),
      ...engine.state(),
    }),
  };
}

