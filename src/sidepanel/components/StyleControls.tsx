import { useEffect, useState } from 'react';
import { TEXT_PROPERTY } from '../../shared/changes';
import { COMPUTED_GROUPS } from '../../shared/computed';
import type { DesignToken } from '../../shared/tokens';
import type { Change, ElementInfo } from '../../shared/types';
import { PropertyField } from './PropertyField';

export interface StyleControlsProps {
  info: ElementInfo;
  /** Changes for the selected element only. */
  changes: readonly Change[];
  tokens: readonly DesignToken[];
  isValid(property: string, value: string): boolean;
  onStyleEdit(property: string, value: string, token?: string): void;
  onTextEdit(text: string): void;
  onReset(change: Change): void;
}

function TextField({ info, change, onTextEdit, onReset }: Pick<StyleControlsProps, 'info' | 'onTextEdit' | 'onReset'> & { change: Change | undefined }) {
  const shown = change?.after ?? info.text ?? '';
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  return (
    <div className={`field${change ? ' field--changed' : ''}`} data-field="text">
      <label className="field__label" htmlFor="field-text">
        Text
      </label>
      <div className="field__control">
        <textarea
          id="field-text"
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => draft !== shown && onTextEdit(draft)}
        />
        {change && (
          <button type="button" className="field__reset" aria-label="Reset text" onClick={() => onReset(change)}>
            ×
          </button>
        )}
      </div>
      <p className="field__note">Best-effort: React may overwrite edited text when it re-renders.</p>
    </div>
  );
}

export function StyleControls({ info, changes, tokens, isValid, onStyleEdit, onTextEdit, onReset }: StyleControlsProps) {
  const changeFor = (property: string) => changes.find((change) => change.property === property);

  return (
    <section className="card" data-testid="style-controls">
      <h2 className="card__title">Styles</h2>
      {info.text !== undefined && (
        <TextField info={info} change={changeFor(TEXT_PROPERTY)} onTextEdit={onTextEdit} onReset={onReset} />
      )}
      {COMPUTED_GROUPS.map((group) => (
        <div key={group.label} className="group">
          <h3 className="group__title">{group.label}</h3>
          {group.properties.map((property) => (
            <PropertyField
              key={property}
              property={property}
              computed={info.computed[property] ?? ''}
              change={changeFor(property)}
              tokens={tokens}
              isValid={isValid}
              onCommit={onStyleEdit}
              onReset={onReset}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
