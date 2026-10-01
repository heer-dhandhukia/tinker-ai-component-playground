// LLM client for AI edits. Raw fetch by design (SPEC.md: no SDK dependency, service worker
// only). Two wire formats: Anthropic's Messages API, and the OpenAI chat-completions format
// that Groq, OpenRouter, Gemini and Ollama all accept. Request shapes and headers were checked
// against each provider's docs; see DECISIONS.md.
import { z } from 'zod';
import {
  AI_RESPONSE_JSON_SCHEMA,
  aiResponseSchema,
  type AiError,
  type AiRequest,
  type AiVariant,
  type Usage,
} from '../shared/ai';
import { chatCompletionsUrl } from '../shared/settings';

export const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
// Leaves room for the model's thinking as well as the JSON; non-streaming requests of this
// size stay well inside HTTP timeouts.
const MAX_TOKENS = 16000;

export interface LlmDeps {
  fetch: typeof globalThis.fetch;
  /** Base URL of the Anthropic API (overridable in e2e builds). */
  apiBase: string;
  timeoutMs: number;
}

export type LlmConfig =
  | { provider: 'anthropic'; apiKey: string | undefined; model: string }
  | { provider: 'openai-compatible'; baseUrl: string; apiKey: string | undefined; model: string };

export type LlmResult =
  | { ok: true; variants: AiVariant[]; usage: Usage; attempts: number }
  | { ok: false; error: AiError };

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  /** Base64 PNG, on the first user turn only. */
  image?: string;
}

/** One model reply, in provider-neutral form. */
interface Reply {
  text: string;
  usage: Usage;
  stop: 'ok' | 'refusal' | 'truncated';
}

interface WireRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

interface Adapter {
  build(system: string, turns: Turn[]): WireRequest;
  /** Null when the response does not have the provider's documented shape. */
  parse(json: unknown): Reply | null;
  /** A second request to try when the server rejects the first with HTTP 400, if any. */
  fallback?(request: WireRequest): WireRequest | null;
  /** Free-form models may wrap the JSON in prose or code fences. */
  lenientJson: boolean;
}

const fail = (kind: AiError['kind'], message: string, extra: Partial<AiError> = {}): LlmResult => ({
  ok: false,
  error: { kind, message, ...extra },
});

// ---- Anthropic Messages API ----

const anthropicMessageSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  stop_reason: z.string().nullable(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

function anthropicAdapter(apiBase: string, config: Extract<LlmConfig, { provider: 'anthropic' }>): Adapter {
  return {
    lenientJson: false,
    build: (system, turns) => ({
      url: `${apiBase}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey ?? '',
        'anthropic-version': ANTHROPIC_VERSION,
        // Required for requests that carry a browser Origin header (the SDK sends the same).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: config.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: turns.map((turn) => ({
          role: turn.role,
          content: [
            ...(turn.image ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: turn.image } }] : []),
            { type: 'text', text: turn.text },
          ],
        })),
        output_config: { format: { type: 'json_schema', schema: AI_RESPONSE_JSON_SCHEMA } },
      },
    }),
    parse(json) {
      const message = anthropicMessageSchema.safeParse(json);
      if (!message.success) return null;
      return {
        text: message.data.content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join(''),
        usage: { inputTokens: message.data.usage.input_tokens, outputTokens: message.data.usage.output_tokens },
        stop: message.data.stop_reason === 'refusal' ? 'refusal' : message.data.stop_reason === 'max_tokens' ? 'truncated' : 'ok',
      };
    },
  };
}

// ---- OpenAI-compatible chat completions ----

const chatCompletionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullable().optional() }))
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).partial().optional(),
});

function compatibleAdapter(config: Extract<LlmConfig, { provider: 'openai-compatible' }>): Adapter {
  return {
    lenientJson: true,
    build: (system, turns) => ({
      url: chatCompletionsUrl(config.baseUrl),
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: {
        model: config.model,
        messages: [
          { role: 'system', content: system },
          ...turns.map((turn) => ({
            role: turn.role,
            content: turn.image
              ? [{ type: 'text', text: turn.text }, { type: 'image_url', image_url: { url: `data:image/png;base64,${turn.image}` } }]
              : turn.text,
          })),
        ],
        response_format: { type: 'json_object' },
      },
    }),
    // Not every compatible server accepts response_format; the prompt already asks for JSON.
    fallback(request) {
      const { response_format: format, ...rest } = request.body as Record<string, unknown>;
      return format === undefined ? null : { ...request, body: rest };
    },
    parse(json) {
      const completion = chatCompletionSchema.safeParse(json);
      if (!completion.success) return null;
      const choice = completion.data.choices[0]!;
      return {
        text: choice.message.content ?? '',
        usage: {
          inputTokens: completion.data.usage?.prompt_tokens ?? 0,
          outputTokens: completion.data.usage?.completion_tokens ?? 0,
        },
        stop: choice.finish_reason === 'length' ? 'truncated' : choice.finish_reason === 'content_filter' ? 'refusal' : 'ok',
      };
    },
  };
}

// ---- shared ----

const errorBodySchema = z.object({ error: z.union([z.object({ message: z.string() }), z.string()]) });

async function httpError(response: Response): Promise<LlmResult> {
  const body = errorBodySchema.safeParse(await response.json().catch(() => null));
  const detail = body.success ? (typeof body.data.error === 'string' ? body.data.error : body.data.error.message) : null;
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after'));
    return fail('rate-limit', detail ?? 'Rate limited', Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {});
  }
  if (response.status === 401) return fail('auth', detail ?? 'The API key was rejected');
  return fail('api', detail ? `${detail} (HTTP ${response.status})` : `Request failed (HTTP ${response.status})`);
}

/** The JSON object inside a reply that may have prose or ``` fences around it. */
function unwrapJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/** Validates the model's text. Returns the variants, or a message describing what is wrong. */
function parseVariants(text: string, count: number, lenient: boolean): { variants: AiVariant[] } | { problem: string } {
  let json: unknown;
  try {
    json = JSON.parse(lenient ? unwrapJson(text) : text);
  } catch {
    return { problem: 'The response was not valid JSON.' };
  }
  const parsed = aiResponseSchema(count).safeParse(json);
  if (parsed.success) return { variants: parsed.data.variants };
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return { problem: `The JSON did not match the schema. ${issues}` };
}

/**
 * Asks the model for `request.count` variants. An invalid response is sent back once with
 * the validation error; a second invalid response is a failure.
 */
export async function requestVariants(
  deps: LlmDeps,
  config: LlmConfig,
  request: AiRequest,
  screenshotBase64?: string,
): Promise<LlmResult> {
  // Local servers need no key; Anthropic always does.
  if (config.provider === 'anthropic' && !config.apiKey) return fail('no-key', 'No API key is saved.');
  const adapter = config.provider === 'anthropic' ? anthropicAdapter(deps.apiBase, config) : compatibleAdapter(config);

  const send = async (wire: WireRequest): Promise<Response | LlmResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
    try {
      return await deps.fetch(wire.url, { method: 'POST', headers: wire.headers, body: JSON.stringify(wire.body), signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return fail('timeout', `No response after ${Math.round(deps.timeoutMs / 1000)} seconds.`);
      return fail('network', error instanceof Error ? error.message : 'Network request failed');
    } finally {
      clearTimeout(timer);
    }
  };

  const turns: Turn[] = [{ role: 'user', text: request.user, ...(screenshotBase64 ? { image: screenshotBase64 } : {}) }];
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let problem = '';
  let useFallback = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let wire = adapter.build(request.system, turns);
    if (useFallback) wire = adapter.fallback?.(wire) ?? wire;
    let response = await send(wire);
    if (!(response instanceof Response)) return response;

    if (response.status === 400 && !useFallback) {
      const retry = adapter.fallback?.(wire);
      if (retry) {
        useFallback = true;
        response = await send(retry);
        if (!(response instanceof Response)) return response;
      }
    }
    if (!response.ok) return httpError(response);

    const reply = adapter.parse(await response.json().catch(() => null));
    if (!reply) return fail('invalid-response', 'The API returned an unexpected response shape.');
    usage.inputTokens += reply.usage.inputTokens;
    usage.outputTokens += reply.usage.outputTokens;
    if (reply.stop === 'refusal') return fail('refusal', 'The model declined this request.');
    if (reply.stop === 'truncated') return fail('invalid-response', 'The response was cut off before it finished.');

    const result = parseVariants(reply.text, request.count, adapter.lenientJson);
    if ('variants' in result) return { ok: true, variants: result.variants, usage, attempts: attempt };

    problem = result.problem;
    const correction = `Your previous response was rejected. ${problem} Return only JSON matching the schema, with exactly ${request.count} ${request.count === 1 ? 'variant' : 'variants'}.`;
    // An empty assistant turn is not allowed, so only echo the bad response when there is one.
    if (reply.text) turns.push({ role: 'assistant', text: reply.text });
    turns.push({ role: 'user', text: correction });
  }

  return fail('invalid-response', `The model's response was invalid twice. ${problem}`);
}
