import { useState } from 'react';

export type ExportKind = 'brief' | 'css' | 'json';

export interface ExportPanelProps {
  /** The three exports as text; null when there is nothing to export. */
  outputs: Record<ExportKind, string> | null;
  /** Result of the last copy / screenshot action, shown to the user. */
  status: string | null;
  onCopy(kind: ExportKind): void;
  onDownload(kind: ExportKind): void;
  onScreenshots(): void;
}

const TABS: { kind: ExportKind; label: string }[] = [
  { kind: 'brief', label: 'Change brief' },
  { kind: 'css', label: 'CSS overrides' },
  { kind: 'json', label: 'JSON changeset' },
];

export function ExportPanel({ outputs, status, onCopy, onDownload, onScreenshots }: ExportPanelProps) {
  const [kind, setKind] = useState<ExportKind>('brief');

  return (
    <section className="card" data-testid="export-panel">
      <h2 className="card__title">Export</h2>
      {outputs === null ? (
        <p className="muted">Make a change to export it.</p>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Export format">
            {TABS.map((tab) => (
              <button key={tab.kind} type="button" role="tab" className="tab" aria-selected={tab.kind === kind} onClick={() => setKind(tab.kind)}>
                {tab.label}
              </button>
            ))}
          </div>
          <textarea className="export__output" data-testid="export-output" aria-label="Export preview" readOnly rows={10} value={outputs[kind]} />
          <div className="toolbar toolbar--tight">
            <button type="button" className="button button--primary" onClick={() => onCopy(kind)}>
              Copy
            </button>
            <button type="button" className="button" onClick={() => onDownload(kind)}>
              Download
            </button>
            <button type="button" className="button" onClick={onScreenshots}>
              Before / after screenshots
            </button>
          </div>
          {kind === 'brief' && <p className="muted">Paste the brief into Claude Code or Cursor in your project.</p>}
          {status && (
            <p className="muted" role="status" data-testid="export-status">
              {status}
            </p>
          )}
        </>
      )}
    </section>
  );
}
