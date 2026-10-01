export interface PickerToolbarProps {
  picking: boolean;
  canGoToParent: boolean;
  canGoToChild: boolean;
  onTogglePicking: () => void;
  onParent: () => void;
  onChild: () => void;
}

export function PickerToolbar(props: PickerToolbarProps) {
  return (
    <div className="toolbar">
      <button
        type="button"
        className="button button--primary"
        aria-pressed={props.picking}
        onClick={props.onTogglePicking}
      >
        {props.picking ? 'Cancel picking' : 'Pick element'}
      </button>
      <button type="button" className="button" disabled={!props.canGoToParent} onClick={props.onParent}>
        ↑ Parent
      </button>
      <button type="button" className="button" disabled={!props.canGoToChild} onClick={props.onChild}>
        ↓ Child
      </button>
    </div>
  );
}
