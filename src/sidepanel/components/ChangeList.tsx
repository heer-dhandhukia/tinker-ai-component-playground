import { TEXT_PROPERTY } from '../../shared/changes';
import type { Change } from '../../shared/types';

export interface ChangeListProps {
  changes: readonly Change[];
  /** tinkerIds whose element is not on the page right now. */
  detached: readonly string[];
  pendingCount: number;
  canUndo: boolean;
  canRedo: boolean;
  showOriginal: boolean;
  reapply: boolean;
  /** Re-apply on reload needs a real origin to ask permission for. */
  canReapply: boolean;
  onUndo(): void;
  onRedo(): void;
  onClear(): void;
  onRemove(id: string): void;
  onShowOriginal(show: boolean): void;
  onReapply(reapply: boolean): void;
  onRestorePending(): void;
  onDiscardPending(): void;
}

const targetLabel = (change: Change) =>
  change.target.componentPath?.at(-1) ?? change.target.cssPath.split(' > ').at(-1) ?? 'element';

export function ChangeList(props: ChangeListProps) {
  const { changes, detached } = props;
  const detachedCount = new Set(changes.filter((c) => detached.includes(c.target.tinkerId)).map((c) => c.target.tinkerId)).size;

  return (
    <section className="card" data-testid="change-list">
      <h2 className="card__title">Changes ({changes.length})</h2>

      {props.pendingCount > 0 && (
        <div className="notice" data-testid="pending-session">
          {props.pendingCount} saved {props.pendingCount === 1 ? 'change' : 'changes'} from your last visit to this page.{' '}
          <button type="button" className="link" onClick={props.onRestorePending}>
            Restore
          </button>{' '}
          <button type="button" className="link" onClick={props.onDiscardPending}>
            Discard
          </button>
        </div>
      )}

      <div className="toolbar toolbar--tight">
        <button type="button" className="button" disabled={!props.canUndo} onClick={props.onUndo}>
          Undo
        </button>
        <button type="button" className="button" disabled={!props.canRedo} onClick={props.onRedo}>
          Redo
        </button>
        <button type="button" className="button" disabled={changes.length === 0} onClick={props.onClear}>
          Clear all
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={props.showOriginal} onChange={(event) => props.onShowOriginal(event.target.checked)} />
        Show original
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={props.reapply}
          disabled={!props.canReapply}
          onChange={(event) => props.onReapply(event.target.checked)}
        />
        Re-apply on reload
      </label>

      {detachedCount > 0 && (
        <p className="notice" data-testid="detached-notice">
          {detachedCount === 1 ? '1 element is' : `${detachedCount} elements are`} not on the page right now. Those
          changes are kept but not applied.
        </p>
      )}

      {changes.length === 0 ? (
        <p className="muted">No changes yet.</p>
      ) : (
        <ul className="plain-list changes">
          {changes.map((change) => {
            const isDetached = detached.includes(change.target.tinkerId);
            return (
              <li key={change.id} data-change={change.property} data-detached={isDetached}>
                <div className="changes__head">
                  <span>
                    <strong>{targetLabel(change)}</strong>{' '}
                    <span className="mono">{change.kind === 'text' ? 'text' : change.property}</span>
                    {isDetached && <span className="badge badge--warn">detached</span>}
                    {change.token && <span className="badge">token</span>}
                  </span>
                  <button type="button" className="field__reset" aria-label={`Remove ${change.property} change`} onClick={() => props.onRemove(change.id)}>
                    ×
                  </button>
                </div>
                <div className="mono muted">
                  {change.property === TEXT_PROPERTY ? `"${change.before}" → "${change.after}"` : `${change.before} → ${change.after}`}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
