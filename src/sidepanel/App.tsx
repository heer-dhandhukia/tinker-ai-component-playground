import { browser } from 'wxt/browser';
import { TEXT_PROPERTY, isSafeCssValue } from '../shared/changes';
import type { Change } from '../shared/types';
import {
  cleared,
  edited,
  pendingDiscarded,
  pendingRestored,
  reapplySet,
  redo,
  removed,
  showOriginalSet,
  undo,
} from './changesSlice';
import { AiPanel } from './components/AiPanel';
import { ChangeList } from './components/ChangeList';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ExportPanel } from './components/ExportPanel';
import { Inspector } from './components/Inspector';
import { PickerToolbar } from './components/PickerToolbar';
import { StyleControls } from './components/StyleControls';
import { useAppDispatch, useAppSelector } from './store';
import { useAi } from './useAi';
import { useExport } from './useExport';
import { sendToContent, useChangeSync, useTabConnection } from './useTabConnection';

const isValidValue = (property: string, value: string) => isSafeCssValue(value) && CSS.supports(property, value);

export function App() {
  useTabConnection();
  useChangeSync();
  const dispatch = useAppDispatch();
  const { tabId, status } = useAppSelector((state) => state.connection);
  const { picking, info, tokens } = useAppSelector((state) => state.selection);
  const changes = useAppSelector((state) => state.changes);
  const ai = useAppSelector((state) => state.ai);
  const aiControls = useAi();
  const exporter = useExport();
  const connected = status.state === 'connected' && tabId !== null;

  const edit = (kind: Change['kind'], property: string, before: string, after: string, token?: string) => {
    if (!info) return;
    dispatch(
      edited({
        id: crypto.randomUUID(),
        target: info.target,
        kind,
        property,
        before,
        after,
        ...(token ? { token } : {}),
        origin: 'manual',
        createdAt: Date.now(),
      }),
    );
  };

  const onReapply = (on: boolean) => {
    if (!on) {
      dispatch(reapplySet(false));
      return;
    }
    if (!changes.pageKey) return;
    // Must be called directly in the click handler: Chrome requires a user gesture.
    void browser.permissions
      .request({ origins: [`${new URL(changes.pageKey).origin}/*`] })
      .then((granted) => granted && dispatch(reapplySet(true)))
      .catch(() => undefined);
  };

  return (
    <main className="panel">
      <h1 className="panel__title">Tinker</h1>
      <ConnectionStatus status={status} />
      {connected && (
        <>
          <PickerToolbar
            picking={picking}
            canGoToParent={info?.hasParent ?? false}
            canGoToChild={info?.hasChild ?? false}
            onTogglePicking={() => void sendToContent(tabId, { type: picking ? 'picker/stop' : 'picker/start' })}
            onParent={() => void sendToContent(tabId, { type: 'selection/relative', direction: 'parent' })}
            onChild={() => void sendToContent(tabId, { type: 'selection/relative', direction: 'child' })}
          />
          {info ? (
            <div className="inspector">
              <Inspector info={info} />
              <AiPanel
                ai={ai}
                disabled={false}
                onAsk={(instruction, count, screenshot) => void aiControls.ask(instruction, count, screenshot)}
                onShowPreview={(instruction, count, screenshot) => void aiControls.showPreview(instruction, count, screenshot)}
                onConfirmPreview={() => void aiControls.confirmPreview()}
                onSelectVariant={aiControls.selectVariant}
                onKeep={aiControls.keepVariant}
                onDismiss={aiControls.dismiss}
                onOpenSettings={() => void browser.runtime.openOptionsPage()}
              />
              <StyleControls
                info={info}
                changes={changes.present.filter((change) => change.target.tinkerId === info.target.tinkerId)}
                tokens={tokens}
                isValid={isValidValue}
                onStyleEdit={(property, value, token) => edit('style', property, info.computed[property] ?? '', value, token)}
                onTextEdit={(text) => edit('text', TEXT_PROPERTY, info.text ?? '', text)}
                onReset={(change) => dispatch(removed(change.id))}
              />
            </div>
          ) : (
            <p className="hint" data-testid="no-selection">
              {picking
                ? 'Hover the page and click an element. ↑/↓ move to the parent or child, Enter selects, Esc cancels.'
                : 'Pick an element on the page to inspect it.'}
            </p>
          )}
          <ChangeList
            changes={changes.present}
            detached={changes.detached}
            pendingCount={changes.pending?.length ?? 0}
            canUndo={changes.past.length > 0}
            canRedo={changes.future.length > 0}
            showOriginal={changes.showOriginal}
            reapply={changes.reapply}
            canReapply={/^https?:/.test(changes.pageKey ?? '')}
            onUndo={() => dispatch(undo())}
            onRedo={() => dispatch(redo())}
            onClear={() => dispatch(cleared())}
            onRemove={(id) => dispatch(removed(id))}
            onShowOriginal={(show) => dispatch(showOriginalSet(show))}
            onReapply={onReapply}
            onRestorePending={() => dispatch(pendingRestored())}
            onDiscardPending={() => dispatch(pendingDiscarded())}
          />
          <ExportPanel
            outputs={exporter.outputs}
            status={exporter.status}
            onCopy={exporter.copy}
            onDownload={exporter.download}
            onScreenshots={() => void exporter.screenshots()}
          />
        </>
      )}
    </main>
  );
}
