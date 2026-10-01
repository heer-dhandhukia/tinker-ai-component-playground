// The picker overlay: hover highlight + label, click/Enter to select, Esc to cancel,
// ArrowUp/ArrowDown to move to the parent/first child. Lives in a closed Shadow DOM so page
// CSS cannot restyle it and page scripts cannot reach into it.

const OVERLAY_ATTRIBUTE = 'data-tinker-overlay';
const BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const;

const STYLES = `
  :host { all: initial; }
  .box { position: fixed; top: 0; left: 0; box-sizing: border-box; pointer-events: none; display: none; will-change: transform; }
  .hover { background: rgba(79, 70, 229, 0.14); outline: 1.5px solid #4f46e5; }
  .selected { outline: 2px solid #0d9488; outline-offset: 1px; }
  .label {
    position: fixed; top: 0; left: 0; display: none; pointer-events: none; will-change: transform;
    padding: 2px 6px; border-radius: 3px; background: #1c1d22; color: #fff;
    font: 500 11px/1.5 ui-monospace, 'SF Mono', Menlo, monospace; white-space: nowrap;
  }
`;

export interface PickerOptions {
  /** Resolves the component name for the hover label, if any. */
  componentNameFor(element: Element): Promise<string | undefined>;
  onSelect(element: Element): void;
  onPickingChange(picking: boolean): void;
  /** The selected element left the document. */
  onSelectionLost(): void;
  /** Mirrors overlay state onto the host element so e2e can read it (closed shadow root). */
  exposeState: boolean;
}

export interface Picker {
  start(): void;
  stop(): void;
  isPicking(): boolean;
  setSelected(element: Element | null): void;
  /** Hides or shows the whole overlay (used while a screenshot is taken). */
  setVisible(visible: boolean): void;
}

function tagLabel(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const firstClass = element.classList[0] ? `.${element.classList[0]}` : '';
  return `${element.localName}${id || firstClass}`;
}

export function createPicker(options: PickerOptions): Picker {
  const host = document.createElement('div');
  host.setAttribute(OVERLAY_ATTRIBUTE, '');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  const hoverBox = document.createElement('div');
  hoverBox.className = 'box hover';
  const selectedBox = document.createElement('div');
  selectedBox.className = 'box selected';
  const label = document.createElement('div');
  label.className = 'label';
  shadow.append(style, selectedBox, hoverBox, label);

  let picking = false;
  let candidate: Element | null = null;
  let selected: Element | null = null;
  let frame = 0;
  const names = new WeakMap<Element, string | undefined>();

  const isOurs = (element: Element) => element === host;

  const place = (box: HTMLElement, element: Element | null) => {
    if (!element || !element.isConnected) {
      box.style.display = 'none';
      return null;
    }
    const rect = element.getBoundingClientRect();
    box.style.display = 'block';
    box.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    return rect;
  };

  const labelText = (element: Element) => {
    const name = names.get(element);
    return name ? `${name} · ${tagLabel(element)}` : tagLabel(element);
  };

  // One measurement pass per animation frame, however many mouse events arrived.
  const render = () => {
    frame = 0;
    if (selected && !selected.isConnected) {
      selected = null;
      options.onSelectionLost();
    }
    place(selectedBox, selected);
    const rect = place(hoverBox, picking ? candidate : null);
    if (rect && candidate) {
      label.textContent = labelText(candidate);
      label.style.display = 'block';
      const above = rect.top >= 22;
      label.style.transform = `translate(${Math.max(0, rect.left)}px, ${above ? rect.top - 22 : rect.bottom + 2}px)`;
    } else {
      label.style.display = 'none';
    }
    if (options.exposeState) {
      host.setAttribute('data-tinker-label', rect && candidate ? labelText(candidate) : '');
      host.setAttribute('data-tinker-picking', String(picking));
    }
    if (picking || selected) schedule();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const setCandidate = (element: Element | null) => {
    candidate = element;
    if (element && !names.has(element)) {
      names.set(element, undefined);
      void options.componentNameFor(element).then((name) => names.set(element, name));
    }
    schedule();
  };

  const onMouseMove = (event: MouseEvent) => {
    const target = event.composedPath()[0];
    if (target instanceof Element && !isOurs(target) && target !== candidate) setCandidate(target);
  };

  const choose = (element: Element) => {
    picker.stop();
    options.onSelect(element);
  };

  const onBlocked = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click') return;
    const target = event.composedPath()[0];
    const element = candidate ?? (target instanceof Element && !isOurs(target) ? target : null);
    if (element) choose(element);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    let handled = true;
    if (event.key === 'Escape') {
      picker.stop();
    } else if (event.key === 'ArrowUp' && candidate) {
      const parent = candidate.parentElement;
      if (parent && candidate !== document.body) setCandidate(parent);
    } else if (event.key === 'ArrowDown' && candidate) {
      const child = [...candidate.children].find((element) => !isOurs(element));
      if (child) setCandidate(child);
    } else if (event.key === 'Enter' && candidate) {
      choose(candidate);
    } else {
      handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const listen = (add: boolean) => {
    const toggle = add ? window.addEventListener : window.removeEventListener;
    toggle.call(window, 'mousemove', onMouseMove as EventListener, true);
    toggle.call(window, 'keydown', onKeyDown as EventListener, true);
    for (const type of BLOCKED_EVENTS) toggle.call(window, type, onBlocked, true);
  };

  const picker: Picker = {
    start() {
      if (picking) return;
      if (!host.isConnected) document.documentElement.append(host);
      picking = true;
      candidate = null;
      listen(true);
      schedule();
      options.onPickingChange(true);
    },
    stop() {
      if (!picking) return;
      picking = false;
      candidate = null;
      listen(false);
      schedule();
      options.onPickingChange(false);
    },
    isPicking: () => picking,
    setSelected(element) {
      if (element && !host.isConnected) document.documentElement.append(host);
      selected = element;
      schedule();
    },
    setVisible(visible) {
      host.style.display = visible ? '' : 'none';
    },
  };
  return picker;
}
