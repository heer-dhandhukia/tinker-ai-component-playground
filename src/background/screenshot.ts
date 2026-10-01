import { browser } from 'wxt/browser';
import { cropRegion, type AiContext } from '../shared/ai';
import { elementRectsSchema, type ScreenshotsResult, type ToContentMessage } from '../shared/messages';

const SETTLE_MS = 120;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
const toContent = (tabId: number, message: ToContentMessage) => browser.tabs.sendMessage(tabId, message).catch(() => undefined);

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Why the tab cannot be captured right now, or null if it can. */
async function captureBlocker(tabId: number): Promise<{ windowId: number } | { reason: string }> {
  const tab = await browser.tabs.get(tabId);
  // captureVisibleTab captures whatever is showing in the window, so the page must be it.
  return tab.active ? { windowId: tab.windowId } : { reason: 'the page is not the visible tab' };
}

async function captureVisible(windowId: number): Promise<ImageBitmap> {
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  return createImageBitmap(await (await fetch(dataUrl)).blob());
}

/** Crops a tab capture to one element. Null when the element is not in the visible area. */
async function crop(bitmap: ImageBitmap, rect: AiContext['rect'], devicePixelRatio: number): Promise<string | null> {
  const region = cropRegion(rect, devicePixelRatio, bitmap.width, bitmap.height);
  if (!region) return null;
  const width = Math.max(1, Math.round(region.sw * region.scale));
  const height = Math.max(1, Math.round(region.sh * region.scale));
  const canvas = new OffscreenCanvas(width, height);
  const drawing = canvas.getContext('2d');
  if (!drawing) return null;
  drawing.drawImage(bitmap, region.sx, region.sy, region.sw, region.sh, 0, 0, width, height);
  return toBase64(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

/**
 * A PNG of just the selected element, base64-encoded. Screenshots are optional, so every
 * failure is reported as a reason to skip rather than an error.
 */
export async function captureElement(
  tabId: number,
  context: Pick<AiContext, 'rect' | 'devicePixelRatio'>,
): Promise<{ data: string } | { skipped: string }> {
  try {
    const target = await captureBlocker(tabId);
    if ('reason' in target) return { skipped: target.reason };
    await toContent(tabId, { type: 'overlay/set', visible: false });
    let bitmap: ImageBitmap;
    try {
      await settle();
      bitmap = await captureVisible(target.windowId);
    } finally {
      await toContent(tabId, { type: 'overlay/set', visible: true });
    }
    const data = await crop(bitmap, context.rect, context.devicePixelRatio);
    return data ? { data } : { skipped: 'the element is outside the visible area' };
  } catch (error) {
    return { skipped: error instanceof Error ? error.message : 'the capture failed' };
  }
}

/**
 * Before/after PNGs of the changed elements: two captures of the visible tab (overrides off,
 * then on), each cropped per element using its position at that moment.
 */
export async function captureBeforeAfter(tabId: number, tinkerIds: string[], restoreEnabled: boolean): Promise<ScreenshotsResult> {
  try {
    const target = await captureBlocker(tabId);
    if ('reason' in target) return { ok: false, reason: target.reason };

    const shoot = async (enabled: boolean) => {
      await toContent(tabId, { type: 'changes/enabled', enabled });
      await settle();
      const rects = elementRectsSchema.safeParse(await toContent(tabId, { type: 'export/rects', tinkerIds }));
      const bitmap = await captureVisible(target.windowId);
      const crops: Record<string, string | null> = {};
      for (const tinkerId of tinkerIds) {
        const rect = rects.success ? rects.data.rects[tinkerId] : null;
        crops[tinkerId] = rect && rects.success ? await crop(bitmap, rect, rects.data.devicePixelRatio) : null;
      }
      return crops;
    };

    await toContent(tabId, { type: 'overlay/set', visible: false });
    try {
      const before = await shoot(false);
      // Chrome limits captureVisibleTab to two calls per second.
      await new Promise((resolve) => setTimeout(resolve, 600));
      const after = await shoot(true);
      return {
        ok: true,
        shots: tinkerIds.map((tinkerId) => ({ tinkerId, before: before[tinkerId] ?? null, after: after[tinkerId] ?? null })),
      };
    } finally {
      await toContent(tabId, { type: 'changes/enabled', enabled: restoreEnabled });
      await toContent(tabId, { type: 'overlay/set', visible: true });
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'the capture failed' };
  }
}
