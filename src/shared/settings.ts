import { z } from 'zod';

export const SETTINGS_KEY = 'settings';
export const DEFAULT_MODEL = 'claude-sonnet-5';
export const PROVIDERS = ['anthropic', 'openai-compatible'] as const;
export type Provider = (typeof PROVIDERS)[number];

const httpUrl = z.string().max(500).refine((value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'must be an http(s) URL');

export const settingsSchema = z.object({
  provider: z.enum(PROVIDERS).default('anthropic'),
  /** Anthropic key and model. */
  apiKey: z.string().optional(),
  model: z.string().min(1).default(DEFAULT_MODEL),
  /** Any server that speaks the OpenAI chat-completions API (Groq, OpenRouter, Gemini, Ollama, …). */
  compatible: z
    .object({
      baseUrl: httpUrl,
      model: z.string().min(1).max(200),
      /** Optional: local servers such as Ollama need none. */
      apiKey: z.string().optional(),
    })
    .optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

/** Tolerates missing or corrupt storage by falling back to defaults. */
export function parseSettings(raw: unknown): Settings {
  const parsed = settingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { provider: 'anthropic', model: DEFAULT_MODEL };
}

/** Endpoints documented by each provider (checked 2026-10-01). Model names are left to the user. */
export const COMPATIBLE_PRESETS = [
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', note: 'Free tier with rate limits. Needs a Groq API key.' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', note: 'Has free models. Needs an OpenRouter API key.' },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', note: 'Free tier. Needs a Google AI Studio API key.' },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', note: 'Runs on this computer; no key. Start Ollama with OLLAMA_ORIGINS=chrome-extension://* so it accepts requests from extensions.' },
] as const;

/** `https://host/v1/` and `https://host/v1` both become `https://host/v1/chat/completions`. */
export const chatCompletionsUrl = (baseUrl: string) => `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

/** Where requests go, for showing to the user. Never includes a key. */
export function destinationOf(settings: Settings): { provider: Provider; label: string; model: string } {
  if (settings.provider === 'openai-compatible' && settings.compatible) {
    return { provider: 'openai-compatible', label: new URL(settings.compatible.baseUrl).host, model: settings.compatible.model };
  }
  return { provider: 'anthropic', label: 'Anthropic', model: settings.model };
}
