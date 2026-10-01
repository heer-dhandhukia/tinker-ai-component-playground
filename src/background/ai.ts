import { browser } from 'wxt/browser';
import { buildAiRequest } from '../shared/ai';
import type { AiResult, ToBackgroundMessage } from '../shared/messages';
import { SETTINGS_KEY, destinationOf, parseSettings, type Settings } from '../shared/settings';
import { ANTHROPIC_API_BASE, requestVariants, type LlmConfig } from './llm';
import { captureElement } from './screenshot';

// The model may think before answering; two minutes covers that without hanging forever.
const endpoint = { apiBase: ANTHROPIC_API_BASE, timeoutMs: 120_000 };

/** e2e builds only: point the client at a local mock server. */
export function overrideEndpointForE2E(next: Partial<typeof endpoint>): void {
  Object.assign(endpoint, next);
}

async function readSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return parseSettings(stored[SETTINGS_KEY]);
}

/** Where AI requests currently go, for the panel's "what will be sent" preview. No key. */
export const aiDestination = async () => destinationOf(await readSettings());

function llmConfig(settings: Settings): LlmConfig {
  if (settings.provider === 'openai-compatible' && settings.compatible) {
    return { provider: 'openai-compatible', ...settings.compatible, apiKey: settings.compatible.apiKey };
  }
  return { provider: 'anthropic', apiKey: settings.apiKey, model: settings.model };
}

/** Runs one AI request. The API key is read here and never leaves the service worker. */
export async function handleAiRequest(message: Extract<ToBackgroundMessage, { type: 'ai/request' }>): Promise<AiResult> {
  const settings = await readSettings();
  const config = llmConfig(settings);
  if (config.provider === 'anthropic' && !config.apiKey) {
    return { ok: false, error: { kind: 'no-key', message: 'No API key is saved.' } };
  }

  let screenshot = 'not-requested';
  let image: string | undefined;
  if (message.screenshot) {
    const capture = await captureElement(message.tabId, message.context);
    if ('data' in capture) {
      image = capture.data;
      screenshot = 'attached';
    } else {
      screenshot = capture.skipped;
    }
  }

  const result = await requestVariants(
    { fetch: (input, init) => fetch(input, init), ...endpoint },
    config,
    buildAiRequest(message.context, message.instruction, message.count, config.provider),
    image,
  );
  return result.ok ? { ...result, model: config.model, screenshot } : result;
}
