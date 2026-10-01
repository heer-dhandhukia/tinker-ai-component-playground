import { describe, expect, it } from 'vitest';
import { requestVariants, type LlmDeps } from '../../src/background/llm';
import type { AiRequest } from '../../src/shared/ai';

const request: AiRequest = { system: 'SYSTEM', user: 'USER', count: 1 };
const config = { provider: 'anthropic', apiKey: 'test-key', model: 'claude-sonnet-5' } as const;
const good = { variants: [{ name: 'Bold', rationale: 'Stronger.', changes: [{ property: 'gap', after: '8px' }] }] };

interface Call {
  url: string;
  headers: Record<string, string>;
  body: any;
}

const apiMessage = (text: string, over: Record<string, unknown> = {}) => ({
  status: 200,
  json: { type: 'message', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 }, ...over },
});

/** A fetch that replays canned responses and records what it was sent. */
function fakeFetch(responses: { status: number; json: unknown; headers?: Record<string, string> }[]) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return new Response(JSON.stringify(next.json), { status: next.status, headers: next.headers ?? {} });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}
const deps = (fetch: typeof globalThis.fetch, timeoutMs = 1000): LlmDeps => ({ fetch, apiBase: 'https://api.anthropic.com', timeoutMs });

describe('requestVariants: request shape', () => {
  it('sends a Messages API request with the documented headers and structured output', async () => {
    const { fetch, calls } = fakeFetch([apiMessage(JSON.stringify(good))]);
    const result = await requestVariants(deps(fetch), config, request);
    expect(result).toEqual({ ok: true, variants: good.variants, usage: { inputTokens: 100, outputTokens: 20 }, attempts: 1 });

    const [call] = calls;
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call?.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': 'test-key',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(call?.body.model).toBe('claude-sonnet-5');
    expect(call?.body.system).toBe('SYSTEM');
    expect(call?.body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'USER' }] }]);
    expect(call?.body.output_config.format.type).toBe('json_schema');
    expect(call?.body.output_config.format.schema.required).toEqual(['variants']);
    expect(call?.body.max_tokens).toBeGreaterThan(1000);
  });

  it('puts the screenshot before the text when one is attached', async () => {
    const { fetch, calls } = fakeFetch([apiMessage(JSON.stringify(good))]);
    await requestVariants(deps(fetch), config, request, 'QUJD');
    expect(calls[0]?.body.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
      { type: 'text', text: 'USER' },
    ]);
  });
});

describe('requestVariants: validation and the single retry', () => {
  it('retries once with the validation error when the JSON does not match the schema', async () => {
    const wrongCount = { variants: [good.variants[0], good.variants[0]] };
    const { fetch, calls } = fakeFetch([apiMessage(JSON.stringify(wrongCount)), apiMessage(JSON.stringify(good))]);
    const result = await requestVariants(deps(fetch), config, request);
    expect(result).toMatchObject({ ok: true, attempts: 2, usage: { inputTokens: 200, outputTokens: 40 } });

    const retry = calls[1]?.body.messages;
    expect(retry).toHaveLength(3);
    expect(retry[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(wrongCount) }] });
    expect(retry[2].role).toBe('user');
    expect(retry[2].content[0].text).toContain('variants');
    expect(retry[2].content[0].text).toMatch(/rejected/i);
  });

  it('retries when the response is not JSON at all', async () => {
    const { fetch, calls } = fakeFetch([apiMessage('Sure! Here are some ideas.'), apiMessage(JSON.stringify(good))]);
    expect(await requestVariants(deps(fetch), config, request)).toMatchObject({ ok: true, attempts: 2 });
    expect(calls[1]?.body.messages[2].content[0].text).toMatch(/not valid JSON/i);
  });

  it('gives up after the second invalid response', async () => {
    const { fetch, calls } = fakeFetch([apiMessage('nope'), apiMessage('{"variants": "still wrong"}')]);
    const result = await requestVariants(deps(fetch), config, request);
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-response' } });
    expect(calls).toHaveLength(2);
  });

  it('rejects extra junk around otherwise valid variants', async () => {
    const { fetch } = fakeFetch([apiMessage(JSON.stringify({ variants: [{ name: 'X' }] })), apiMessage(JSON.stringify(good))]);
    expect(await requestVariants(deps(fetch), config, request)).toMatchObject({ ok: true, attempts: 2 });
  });
});

describe('requestVariants: failures', () => {
  it('does not call the API without a key', async () => {
    const { fetch, calls } = fakeFetch([]);
    const result = await requestVariants(deps(fetch), { ...config, apiKey: '' }, request);
    expect(result).toMatchObject({ ok: false, error: { kind: 'no-key' } });
    expect(calls).toHaveLength(0);
  });

  it('reports rate limits with the retry-after delay, without retrying', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 429, json: { type: 'error', error: { type: 'rate_limit_error', message: 'Too many requests' } }, headers: { 'retry-after': '12' } },
    ]);
    const result = await requestVariants(deps(fetch), config, request);
    expect(result).toEqual({ ok: false, error: { kind: 'rate-limit', message: 'Too many requests', retryAfterSeconds: 12 } });
    expect(calls).toHaveLength(1);
  });

  it('maps 401 to an auth error and other statuses to api errors', async () => {
    const error = (status: number, type: string) => ({ status, json: { type: 'error', error: { type, message: `${type} happened` } } });
    const auth = await requestVariants(deps(fakeFetch([error(401, 'authentication_error')]).fetch), config, request);
    expect(auth).toMatchObject({ ok: false, error: { kind: 'auth' } });
    const notFound = await requestVariants(deps(fakeFetch([error(404, 'not_found_error')]).fetch), config, request);
    expect(notFound).toEqual({ ok: false, error: { kind: 'api', message: 'not_found_error happened (HTTP 404)' } });
    const overloaded = await requestVariants(deps(fakeFetch([error(529, 'overloaded_error')]).fetch), config, request);
    expect(overloaded).toMatchObject({ ok: false, error: { kind: 'api' } });
  });

  it('survives an error body that is not JSON', async () => {
    const fetch = (async () => new Response('<html>Bad gateway</html>', { status: 502 })) as unknown as typeof globalThis.fetch;
    expect(await requestVariants(deps(fetch), config, request)).toEqual({ ok: false, error: { kind: 'api', message: 'Request failed (HTTP 502)' } });
  });

  it('times out', async () => {
    const fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof globalThis.fetch;
    expect(await requestVariants(deps(fetch, 20), config, request)).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('reports network failures', async () => {
    const fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof globalThis.fetch;
    expect(await requestVariants(deps(fetch), config, request)).toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('reports a refusal instead of parsing it', async () => {
    const { fetch, calls } = fakeFetch([apiMessage('', { stop_reason: 'refusal', content: [] })]);
    expect(await requestVariants(deps(fetch), config, request)).toMatchObject({ ok: false, error: { kind: 'refusal' } });
    expect(calls).toHaveLength(1);
  });

  it('reports truncated output', async () => {
    const { fetch } = fakeFetch([apiMessage('{"variants": [', { stop_reason: 'max_tokens' })]);
    const result = await requestVariants(deps(fetch), config, request);
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid-response' } });
    expect(result.ok === false && result.error.message).toMatch(/cut off/i);
  });

  it('never includes the API key in an error', async () => {
    const { fetch } = fakeFetch([{ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }]);
    expect(JSON.stringify(await requestVariants(deps(fetch), config, request))).not.toContain('test-key');
  });
});

describe('requestVariants: OpenAI-compatible providers', () => {
  const compatible = { provider: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1/', apiKey: 'free-key', model: 'some-model' } as const;
  const completion = (content: string | null, over: Record<string, unknown> = {}) => ({
    status: 200,
    json: { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 80, completion_tokens: 30 }, ...over },
  });

  it('sends a chat-completions request with a bearer key and JSON mode', async () => {
    const { fetch, calls } = fakeFetch([completion(JSON.stringify(good))]);
    const result = await requestVariants(deps(fetch), compatible, request);
    expect(result).toEqual({ ok: true, variants: good.variants, usage: { inputTokens: 80, outputTokens: 30 }, attempts: 1 });

    const [call] = calls;
    expect(call?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(call?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer free-key' });
    expect(call?.body).toEqual({
      model: 'some-model',
      messages: [{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: 'USER' }],
      response_format: { type: 'json_object' },
    });
  });

  it('needs no key for a local server and sends no Authorization header', async () => {
    const { fetch, calls } = fakeFetch([completion(JSON.stringify(good))]);
    const local = { provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', apiKey: undefined, model: 'local' } as const;
    expect(await requestVariants(deps(fetch), local, request)).toMatchObject({ ok: true });
    expect(calls[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(calls[0]?.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('accepts JSON wrapped in code fences or prose', async () => {
    const wrapped = `Here you go:\n\`\`\`json\n${JSON.stringify(good, null, 2)}\n\`\`\`\nHope that helps!`;
    const { fetch } = fakeFetch([completion(wrapped)]);
    expect(await requestVariants(deps(fetch), compatible, request)).toMatchObject({ ok: true, variants: good.variants, attempts: 1 });
  });

  it('retries without response_format when the server rejects it', async () => {
    const { fetch, calls } = fakeFetch([
      { status: 400, json: { error: { message: 'response_format is not supported by this model' } } },
      completion(JSON.stringify(good)),
    ]);
    expect(await requestVariants(deps(fetch), compatible, request)).toMatchObject({ ok: true, attempts: 1 });
    expect(calls[0]?.body.response_format).toEqual({ type: 'json_object' });
    expect(calls[1]?.body).not.toHaveProperty('response_format');
  });

  it('reports a 400 that is not about response_format', async () => {
    const bad = { status: 400, json: { error: { message: 'model not found' } } };
    const { fetch, calls } = fakeFetch([bad, bad]);
    expect(await requestVariants(deps(fetch), compatible, request)).toEqual({ ok: false, error: { kind: 'api', message: 'model not found (HTTP 400)' } });
    expect(calls).toHaveLength(2);
  });

  it('sends the screenshot as an image_url data URL', async () => {
    const { fetch, calls } = fakeFetch([completion(JSON.stringify(good))]);
    await requestVariants(deps(fetch), compatible, request, 'QUJD');
    expect(calls[0]?.body.messages[1].content).toEqual([
      { type: 'text', text: 'USER' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } },
    ]);
  });

  it('applies the same validation and single retry as Anthropic', async () => {
    const { fetch, calls } = fakeFetch([completion('no json here'), completion(JSON.stringify(good))]);
    expect(await requestVariants(deps(fetch), compatible, request)).toMatchObject({ ok: true, attempts: 2, usage: { inputTokens: 160, outputTokens: 60 } });
    expect(calls[1]?.body.messages.map((message: any) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(calls[1]?.body.messages[3].content).toMatch(/not valid JSON/);
  });

  it('handles truncation, rate limits, missing usage and string error bodies', async () => {
    const truncated = fakeFetch([completion('{"variants": [', { choices: [{ message: { content: '{"variants": [' }, finish_reason: 'length' }] })]);
    expect(await requestVariants(deps(truncated.fetch), compatible, request)).toMatchObject({ ok: false, error: { kind: 'invalid-response' } });

    const limited = fakeFetch([{ status: 429, json: { error: { message: 'Rate limit reached' } }, headers: { 'retry-after': '7' } }]);
    expect(await requestVariants(deps(limited.fetch), compatible, request)).toEqual({ ok: false, error: { kind: 'rate-limit', message: 'Rate limit reached', retryAfterSeconds: 7 } });

    const noUsage = fakeFetch([{ status: 200, json: { choices: [{ message: { content: JSON.stringify(good) } }] } }]);
    expect(await requestVariants(deps(noUsage.fetch), compatible, request)).toMatchObject({ ok: true, usage: { inputTokens: 0, outputTokens: 0 } });

    const stringError = fakeFetch([{ status: 403, json: { error: 'origin not allowed' } }]);
    expect(await requestVariants(deps(stringError.fetch), compatible, request)).toEqual({ ok: false, error: { kind: 'api', message: 'origin not allowed (HTTP 403)' } });
  });

  it('never includes the key in an error', async () => {
    const { fetch } = fakeFetch([{ status: 401, json: { error: { message: 'Invalid API Key' } } }]);
    expect(JSON.stringify(await requestVariants(deps(fetch), compatible, request))).not.toContain('free-key');
  });
});
