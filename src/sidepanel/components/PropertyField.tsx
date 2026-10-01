import { useEffect, useState } from 'react';
import { suggestToken, type DesignToken } from '../../shared/tokens';
import type { Change } from '../../shared/types';

const OPTIONS: Record<string, string[]> = {
  display: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'align-items': ['normal', 'stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
  'justify-content': ['normal', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
  'border-style': ['none', 'solid', 'dashed', 'dotted', 'double'],
};
const COLOUR_PROPERTIES = new Set(['color', 'background-color', 'border-color']);

export interface PropertyFieldProps {
  property: string;
  /** Computed value on the page right now. */
  computed: string;
  /** The change currently overriding this property, if any. */
  change: Change | undefined;
  tokens: readonly DesignToken[];
  /** Whether a value is valid for this property (CSS.supports at the edge). */
  isValid(property: string, value: string): boolean;
  onCommit(property: string, value: string, token?: string): void;
  onReset(change: Change): void;
}

export function PropertyField({ property, computed, change, tokens, isValid, onCommit, onReset }: PropertyFieldProps) {
  const shown = change?.after ?? computed;
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);

  const trimmed = draft.trim();
  const dirty = trimmed !== shown;
  const invalid = dirty && trimmed !== '' && !isValid(property, trimmed);
  const options = OPTIONS[property];
  const isColour = COLOUR_PROPERTIES.has(property);
  const colourTokens = isColour ? tokens.filter((token) => token.category === 'colour') : [];

  // Only suggest for values the user has set; untouched fields stay quiet.
  const candidate = dirty ? trimmed : change ? change.after : '';
  const suggestion = candidate && !invalid ? suggestToken(property, candidate, tokens) : null;

  const commit = (value: string, token?: string) => {
    const next = value.trim();
    if (next === '' || next === shown) {
      setDraft(shown);
      return;
    }
    if (!isValid(property, next)) return;
    onCommit(property, next, token);
  };

  return (
    <div className={`field${change ? ' field--changed' : ''}`} data-field={property}>
      <label className="field__label" htmlFor={`field-${property}`}>
        {property}
      </label>
      <div className="field__control">
        {isColour && <span className="swatch" style={{ background: computed }} aria-hidden="true" />}
        {options ? (
          <select
            id={`field-${property}`}
            data-property={property}
            value={shown}
            onChange={(event) => commit(event.target.value)}
          >
            {(options.includes(shown) ? options : [shown, ...options]).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`field-${property}`}
            data-property={property}
            value={draft}
            spellCheck={false}
            aria-invalid={invalid}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit(draft);
              if (event.key === 'Escape') setDraft(shown);
            }}
          />
        )}
        {colourTokens.length > 0 && (
          <select
            className="field__tokens"
            aria-label={`${property} token`}
            value=""
            onChange={(event) => {
              if (event.target.value) commit(`var(${event.target.value})`, `var(${event.target.value})`);
            }}
          >
            <option value="">Token…</option>
            {colourTokens.map((token) => (
              <option key={token.name} value={token.name}>
                {token.name} ({token.value})
              </option>
            ))}
          </select>
        )}
        {change && (
          <button type="button" className="field__reset" aria-label={`Reset ${property}`} onClick={() => onReset(change)}>
            ×
          </button>
        )}
      </div>
      {invalid && (
        <p className="field__note field__note--error" role="alert">
          Not a valid value for {property}.
        </p>
      )}
      {suggestion && (
        <p className="field__note" data-testid={`suggestion-${property}`}>
          <span>
            {candidate} {suggestion.exact ? '=' : '→'} var({suggestion.name}) ({suggestion.value})
          </span>{' '}
          <button
            type="button"
            className="link"
            onClick={() => onCommit(property, `var(${suggestion.name})`, `var(${suggestion.name})`)}
          >
            Use token
          </button>
        </p>
      )}
    </div>
  );
}
