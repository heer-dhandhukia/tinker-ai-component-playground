import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, chatCompletionsUrl, destinationOf, parseSettings } from '../../src/shared/settings';

const defaults = { provider: 'anthropic', model: DEFAULT_MODEL };

describe('parseSettings', () => {
  it('falls back to defaults when nothing is stored', () => {
    expect(parseSettings(undefined)).toEqual(defaults);
  });

  it('reads settings saved before providers existed as Anthropic', () => {
    expect(parseSettings({ apiKey: 'k', model: 'm' })).toEqual({ provider: 'anthropic', apiKey: 'k', model: 'm' });
  });

  it('keeps an OpenAI-compatible provider, with or without a key', () => {
    const compatible = { baseUrl: 'http://localhost:11434/v1', model: 'local-model' };
    expect(parseSettings({ provider: 'openai-compatible', compatible })).toEqual({ provider: 'openai-compatible', model: DEFAULT_MODEL, compatible });
  });

  it('falls back to defaults on corrupt data', () => {
    expect(parseSettings({ apiKey: 5, model: '' })).toEqual(defaults);
    expect(parseSettings('garbage')).toEqual(defaults);
    expect(parseSettings({ provider: 'openai-compatible', compatible: { baseUrl: 'javascript:alert(1)', model: 'x' } })).toEqual(defaults);
    expect(parseSettings({ provider: 'someone-else' })).toEqual(defaults);
  });
});

describe('chatCompletionsUrl', () => {
  it('joins the base URL and path whatever the trailing slash', () => {
    expect(chatCompletionsUrl('https://api.groq.com/openai/v1')).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(chatCompletionsUrl('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1/chat/completions');
  });
});

describe('destinationOf', () => {
  it('names where requests go, never the key', () => {
    expect(destinationOf(parseSettings({ apiKey: 'secret', model: 'claude-sonnet-5' }))).toEqual({ provider: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-5' });
    const compatible = parseSettings({ provider: 'openai-compatible', compatible: { baseUrl: 'https://api.groq.com/openai/v1', model: 'some-model', apiKey: 'secret' } });
    expect(destinationOf(compatible)).toEqual({ provider: 'openai-compatible', label: 'api.groq.com', model: 'some-model' });
  });

  it('treats an incomplete compatible setup as Anthropic', () => {
    expect(destinationOf(parseSettings({ provider: 'openai-compatible' })).provider).toBe('anthropic');
  });
});
