import { browser } from 'wxt/browser';
import {
  aiContextSchema,
  buildAiRequest,
  estimateCost,
  toVariants,
  validateAiVariants,
  type AiContext,
} from '../shared/ai';
import { isSafeCssValue } from '../shared/changes';
import { aiDestinationSchema, aiResultSchema, type ToBackgroundMessage } from '../shared/messages';
import type { Change, Variant } from '../shared/types';
import {
  aiDismissed,
  previewOpened,
  requestFailed,
  requestStarted,
  requestSucceeded,
  variantSelected,
} from './aiSlice';
import { previewCleared, previewSet, variantKept } from './changesSlice';
import { useAppDispatch, useAppSelector } from './store';
import { sendToContent } from './useTabConnection';

const supports = (property: string, value: string) => isSafeCssValue(value) && CSS.supports(property, value);

const asChanges = (variant: Variant): Change[] =>
  variant.changes.map((change) => ({ ...change, id: crypto.randomUUID(), createdAt: Date.now() }));

export interface AiControls {
  /** Starts a request; the first one in a session stops at the "what will be sent" preview. */
  ask(instruction: string, count: 1 | 3, screenshot: boolean): Promise<void>;
  /** Shows what would be sent without sending it. */
  showPreview(instruction: string, count: 1 | 3, screenshot: boolean): Promise<void>;
  confirmPreview(): Promise<void>;
  selectVariant(index: number): void;
  keepVariant(): void;
  dismiss(): void;
}

export function useAi(): AiControls {
  const dispatch = useAppDispatch();
  const tabId = useAppSelector((state) => state.connection.tabId);
  const ai = useAppSelector((state) => state.ai);
  const { present, showOriginal } = useAppSelector((state) => state.changes);

  const gatherContext = async (): Promise<AiContext | null> => {
    if (tabId === null) return null;
    // Take any previewed variant off the page first, so the model sees the element with only
    // the changes the user has actually kept.
    dispatch(previewCleared());
    await sendToContent(tabId, { type: 'changes/apply', changes: present, enabled: !showOriginal });
    const context = aiContextSchema.safeParse(await sendToContent(tabId, { type: 'ai/context' }));
    return context.success ? context.data : null;
  };

  const send = async (context: AiContext, instruction: string, count: number, screenshot: boolean) => {
    if (tabId === null) return;
    dispatch(requestStarted(context.target.tinkerId));
    const message: ToBackgroundMessage = {
      type: 'ai/request',
      tabId,
      context,
      instruction,
      count: count === 1 ? 1 : 3,
      screenshot,
    };
    const raw: unknown = await browser.runtime.sendMessage(message).catch(() => undefined);
    const result = aiResultSchema.safeParse(raw);
    if (!result.success) {
      dispatch(requestFailed({ kind: 'network', message: 'The extension did not answer. Try again.' }));
      return;
    }
    if (!result.data.ok) {
      dispatch(requestFailed(result.data.error));
      return;
    }

    const { variants: valid, dropped } = validateAiVariants(result.data.variants, supports);
    const variants = toVariants(valid, context, () => crypto.randomUUID());
    const applied = count === 1;
    dispatch(
      requestSucceeded({
        variants,
        dropped,
        usage: result.data.usage,
        cost: estimateCost(result.data.model, result.data.usage),
        model: result.data.model,
        attempts: result.data.attempts,
        screenshot: result.data.screenshot,
        applied,
      }),
    );
    const first = variants[0];
    if (!first) return;
    // "Apply change" goes straight into the change list (Undo reverts it); with three
    // variants the first is previewed live until the user keeps one.
    dispatch(applied ? variantKept(asChanges(first)) : previewSet(asChanges(first)));
  };

  const prepare = async (instruction: string, count: 1 | 3, screenshot: boolean, forcePreview: boolean) => {
    const context = await gatherContext();
    if (!context) {
      dispatch(requestFailed({ kind: 'api', message: 'Select an element on the page first.' }));
      return;
    }
    if (forcePreview || !ai.previewAcknowledged) {
      // Ask the background where requests go, so the preview names the real destination and
      // shows the prompt for that provider. The key itself never reaches the panel.
      const where: ToBackgroundMessage = { type: 'ai/destination' };
      const destination = aiDestinationSchema.safeParse(await browser.runtime.sendMessage(where).catch(() => undefined));
      const provider = destination.success ? destination.data.provider : 'anthropic';
      dispatch(
        previewOpened({
          context,
          request: buildAiRequest(context, instruction, count, provider),
          instruction,
          screenshot,
          destination: destination.success ? `${destination.data.label} (model ${destination.data.model})` : 'the configured AI provider',
        }),
      );
      return;
    }
    await send(context, instruction, count, screenshot);
  };

  return {
    ask: (instruction, count, screenshot) => prepare(instruction, count, screenshot, false),
    showPreview: (instruction, count, screenshot) => prepare(instruction, count, screenshot, true),
    async confirmPreview() {
      if (!ai.pending) return;
      // Sends exactly the context and instruction the preview was built from.
      const { context, request, instruction, screenshot } = ai.pending;
      await send(context, instruction, request.count, screenshot);
    },
    selectVariant(index) {
      const variant = ai.outcome?.variants[index];
      if (!variant) return;
      dispatch(variantSelected(index));
      dispatch(previewSet(asChanges(variant)));
    },
    keepVariant() {
      const variant = ai.outcome?.variants[ai.active];
      if (variant) dispatch(variantKept(asChanges(variant)));
      dispatch(aiDismissed());
    },
    dismiss() {
      dispatch(previewCleared());
      dispatch(aiDismissed());
    },
  };
}
