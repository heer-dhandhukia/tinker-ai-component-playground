import { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { exportBrief, exportChangeset, exportCss, serializeChangeset, type ExportInput } from '../shared/export';
import { screenshotsResultSchema, type ToBackgroundMessage } from '../shared/messages';
import { elementsFor } from './changesSlice';
import type { ExportKind } from './components/ExportPanel';
import { useAppSelector } from './store';

const FILES: Record<ExportKind, { name: string; type: string; label: string }> = {
  brief: { name: 'tinker-brief.md', type: 'text/markdown', label: 'Change brief' },
  css: { name: 'tinker-overrides.css', type: 'text/css', label: 'CSS overrides' },
  json: { name: 'tinker-changeset.json', type: 'application/json', label: 'JSON changeset' },
};

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function pngBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: 'image/png' });
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'element';

export function useExport() {
  const tabId = useAppSelector((state) => state.connection.tabId);
  const { present, elements, pageKey, showOriginal } = useAppSelector((state) => state.changes);
  const [status, setStatus] = useState<string | null>(null);

  // Only kept changes are exported; a variant that is merely being previewed is not.
  const input = useMemo<ExportInput | null>(
    () => (present.length === 0 ? null : { pageUrl: pageKey ?? 'unknown page', changes: present, elements: elementsFor(present, elements) }),
    [present, elements, pageKey],
  );
  const outputs = useMemo(
    () =>
      input && {
        brief: exportBrief(input),
        css: exportCss(input),
        json: serializeChangeset(exportChangeset(input, new Date().toISOString())),
      },
    [input],
  );

  return {
    outputs,
    status,
    copy(kind: ExportKind) {
      if (!outputs) return;
      navigator.clipboard.writeText(outputs[kind]).then(
        () => setStatus(`${FILES[kind].label} copied to the clipboard.`),
        () => setStatus('Could not copy. Select the text above and copy it manually.'),
      );
    },
    download(kind: ExportKind) {
      if (!outputs) return;
      download(FILES[kind].name, new Blob([outputs[kind]], { type: FILES[kind].type }));
      setStatus(`${FILES[kind].name} downloaded.`);
    },
    async screenshots() {
      if (!input || tabId === null) return;
      const tinkerIds = [...new Set(input.changes.map((change) => change.target.tinkerId))].slice(0, 50);
      setStatus('Capturing…');
      const message: ToBackgroundMessage = { type: 'export/screenshots', tabId, tinkerIds, restoreEnabled: !showOriginal };
      const result = screenshotsResultSchema.safeParse(await browser.runtime.sendMessage(message).catch(() => undefined));
      if (!result.success || !result.data.ok) {
        const reason = result.success && !result.data.ok ? result.data.reason : 'the extension did not answer';
        setStatus(`No screenshots: ${reason.replace(/\.$/, '')}.`);
        return;
      }
      let saved = 0;
      result.data.shots.forEach((shot, index) => {
        const name = `tinker-${index + 1}-${slug(input.elements[shot.tinkerId]?.componentName ?? 'element')}`;
        for (const phase of ['before', 'after'] as const) {
          const data = shot[phase];
          if (!data) continue;
          download(`${name}-${phase}.png`, pngBlob(data));
          saved++;
        }
      });
      setStatus(saved > 0 ? `${saved} screenshots downloaded.` : 'No screenshots: the changed elements are not in the visible part of the page.');
    },
  };
}
