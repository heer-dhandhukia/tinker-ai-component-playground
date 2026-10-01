import { useState } from 'react';
import type { AiError } from '../../shared/ai';
import type { AiState } from '../aiSlice';

export interface AiPanelProps {
  ai: AiState;
  /** Nothing is selected, so there is nothing to ask about. */
  disabled: boolean;
  onAsk(instruction: string, count: 1 | 3, screenshot: boolean): void;
  onShowPreview(instruction: string, count: 1 | 3, screenshot: boolean): void;
  onConfirmPreview(): void;
  onSelectVariant(index: number): void;
  onKeep(): void;
  onDismiss(): void;
  onOpenSettings(): void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function errorText(error: AiError): string {
  switch (error.kind) {
    case 'no-key':
      return 'Add an API key in settings to use AI edits, or choose a provider that needs none.';
    case 'auth':
      return `The API key was rejected. Check it in settings. (${error.message})`;
    case 'rate-limit':
      return error.retryAfterSeconds
        ? `Rate limited. Try again in ${Math.ceil(error.retryAfterSeconds)} seconds.`
        : 'Rate limited. Try again in a moment.';
    case 'timeout':
      return `The request timed out. ${error.message}`;
    case 'network':
      return `Could not reach the API. ${error.message}`;
    case 'refusal':
      return 'The model declined this request. Try rewording the instruction.';
    case 'invalid-response':
      return `The model did not return usable changes. ${error.message}`;
    case 'api':
      return error.message;
  }
}

const formatCost = (cost: number | null) =>
  cost === null ? 'cost unknown for this model' : `≈ $${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}`;

export function AiPanel(props: AiPanelProps) {
  const { ai } = props;
  const [instruction, setInstruction] = useState('');
  const [screenshot, setScreenshot] = useState(false);
  const busy = ai.phase === 'loading';
  const canAsk = !props.disabled && !busy && instruction.trim().length > 0;
  const outcome = ai.outcome;
  const active = outcome?.variants[ai.active];

  return (
    <section className="card" data-testid="ai-panel">
      <h2 className="card__title">Ask AI</h2>
      <textarea
        className="ai__instruction"
        rows={2}
        aria-label="Instruction for the AI"
        placeholder={props.disabled ? 'Select an element first' : 'e.g. make this card feel premium'}
        value={instruction}
        disabled={props.disabled}
        onChange={(event) => setInstruction(event.target.value)}
      />
      <div className="toolbar toolbar--tight">
        <button type="button" className="button button--primary" disabled={!canAsk} onClick={() => props.onAsk(instruction, 1, screenshot)}>
          Apply change
        </button>
        <button type="button" className="button" disabled={!canAsk} onClick={() => props.onAsk(instruction, 3, screenshot)}>
          Give me 3 variants
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={screenshot} onChange={(event) => setScreenshot(event.target.checked)} />
        Attach a screenshot of the element
      </label>
      <button type="button" className="link ai__what" disabled={!canAsk} onClick={() => props.onShowPreview(instruction, 3, screenshot)}>
        What will be sent?
      </button>

      {ai.phase === 'preview' && ai.pending && (
        <div className="ai__preview" data-testid="ai-preview">
          <p>
            <strong data-testid="ai-destination">This is what will be sent to {ai.pending.destination}.</strong> Only the selected element is included
            {ai.pending.screenshot ? ', plus a cropped screenshot of it' : ''}. Nothing else from the page is sent.
          </p>
          <details open>
            <summary>Request text</summary>
            <pre data-testid="ai-preview-user">{ai.pending.request.user}</pre>
          </details>
          <details>
            <summary>Fixed instructions to the model</summary>
            <pre>{ai.pending.request.system}</pre>
          </details>
          <div className="toolbar toolbar--tight">
            <button type="button" className="button button--primary" onClick={props.onConfirmPreview}>
              Send
            </button>
            <button type="button" className="button" onClick={props.onDismiss}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {busy && (
        <p className="muted" role="status">
          Asking the model… this can take up to a minute.
        </p>
      )}

      {ai.phase === 'error' && ai.error && (
        <div className="notice notice--error" role="alert" data-testid="ai-error" data-kind={ai.error.kind}>
          {errorText(ai.error)}{' '}
          {(ai.error.kind === 'no-key' || ai.error.kind === 'auth') && (
            <button type="button" className="link" onClick={props.onOpenSettings}>
              Open settings
            </button>
          )}
        </div>
      )}

      {ai.phase === 'ready' && outcome && (
        <div className="ai__result" data-testid="ai-result">
          {outcome.variants.length > 1 && (
            <div className="tabs" role="tablist" aria-label="Variants">
              {outcome.variants.map((variant, index) => (
                <button
                  key={variant.id}
                  type="button"
                  role="tab"
                  aria-selected={index === ai.active}
                  className="tab"
                  onClick={() => props.onSelectVariant(index)}
                >
                  {LETTERS[index] ?? index + 1} · {variant.name}
                </button>
              ))}
            </div>
          )}
          {active && (
            <>
              <p>
                <strong data-testid="ai-variant-name">{active.name}</strong>
                {outcome.applied && <span className="badge">applied</span>}
              </p>
              <p className="muted">{active.rationale}</p>
              {active.changes.length === 0 ? (
                <p className="muted">No usable changes in this variant.</p>
              ) : (
                <ul className="evidence" data-testid="ai-variant-changes">
                  {active.changes.map((change) => (
                    <li key={change.property}>
                      {change.property}: {change.before} → {change.after}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {outcome.dropped.length > 0 && (
            <details className="notice" data-testid="ai-dropped">
              <summary>
                {outcome.dropped.length} suggested {outcome.dropped.length === 1 ? 'change was' : 'changes were'} left out
              </summary>
              <ul className="evidence">
                {outcome.dropped.map((drop, index) => (
                  <li key={index}>
                    {drop.variant} · {drop.property}: {drop.value} ({drop.reason})
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="toolbar toolbar--tight">
            {outcome.applied ? (
              <button type="button" className="button" onClick={props.onDismiss}>
                Done
              </button>
            ) : (
              <>
                <button type="button" className="button button--primary" onClick={props.onKeep}>
                  Keep this one
                </button>
                <button type="button" className="button" onClick={props.onDismiss}>
                  Discard
                </button>
              </>
            )}
          </div>
          <p className="muted" data-testid="ai-usage">
            {outcome.usage.inputTokens.toLocaleString('en-US')} tokens in, {outcome.usage.outputTokens.toLocaleString('en-US')} out ·{' '}
            {formatCost(outcome.cost)} · {outcome.model}
            {outcome.attempts > 1 ? ' · retried once' : ''}
            {outcome.screenshot !== 'not-requested' && outcome.screenshot !== 'attached' ? ` · screenshot skipped: ${outcome.screenshot}` : ''}
            {outcome.screenshot === 'attached' ? ' · screenshot attached' : ''}
          </p>
        </div>
      )}
    </section>
  );
}
