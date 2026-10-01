import type { ElementInfo, StylingSystem } from '../../shared/types';

const SYSTEM_LABELS: Record<StylingSystem, string> = {
  'css-modules': 'CSS Modules',
  'scss-or-plain-css': 'SCSS / plain CSS',
  'styled-components': 'styled-components',
  emotion: 'Emotion',
  mui: 'MUI',
  tailwind: 'Tailwind',
  inline: 'Inline style',
  unknown: 'Unknown',
};

function formatSource(source: NonNullable<ElementInfo['source']>): string {
  if (source.line === undefined) return source.file;
  return source.column === undefined
    ? `${source.file}:${source.line}`
    : `${source.file}:${source.line}:${source.column}`;
}

function formatProp(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  return JSON.stringify(value) ?? String(value);
}

export interface InspectorProps {
  info: ElementInfo;
}

export function Inspector({ info }: InspectorProps) {
  const props = Object.entries(info.props ?? {});
  const isReact = info.reactBuild !== undefined;

  return (
    <div className="inspector">
      <section className="card">
        <p className="inspector__name">
          <span data-testid="component-name">
            {info.componentName ?? (isReact ? 'No component found' : 'Not a React element')}
          </span>
          {info.via && (
            <span className="muted">
              {' '}
              via <span data-testid="component-via">{info.via}</span>
            </span>
          )}
        </p>
        <p className="mono">
          <span data-testid="element-tag">{`<${info.tag}>`}</span>
          {info.classes.length > 0 && <span className="muted"> .{info.classes.join(' .')}</span>}
        </p>
        {info.ownerChain && info.ownerChain.length > 0 && (
          <ol className="breadcrumb" data-testid="owner-chain" aria-label="Component owners">
            {info.ownerChain.map((owner, index) => (
              <li key={`${owner}-${index}`}>{owner}</li>
            ))}
          </ol>
        )}
        {isReact && (
          <p className="mono" data-testid="source">
            {info.source ? formatSource(info.source) : 'source unknown'}
          </p>
        )}
        {isReact && info.source && info.source.line === undefined && (
          <p className="muted">This React version reports the file but not a reliable line number.</p>
        )}
        {info.reactBuild === 'production' && (
          <p className="notice" data-testid="build-notice">
            Production build of React: component names may be minified and source locations are unavailable.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">Styling</h2>
        <ul className="plain-list" data-testid="styling-systems">
          {info.styling.map((match) => (
            <li key={match.system} data-system={match.system}>
              <strong>{SYSTEM_LABELS[match.system]}</strong>
              {match.confidence !== undefined && (
                <span className="muted"> {Math.round(match.confidence * 100)}% confidence</span>
              )}
              <ul className="evidence">
                {match.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {isReact && (
        <section className="card">
          <h2 className="card__title">Props{info.componentName ? ` of ${info.componentName}` : ''}</h2>
          {props.length === 0 ? (
            <p className="muted">No props.</p>
          ) : (
            <dl className="pairs" data-testid="props">
              {props.map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{formatProp(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

    </div>
  );
}
