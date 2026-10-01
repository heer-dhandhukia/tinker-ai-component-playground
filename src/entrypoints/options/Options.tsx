import { useEffect, useState, type FormEvent } from 'react';
import { browser } from 'wxt/browser';
import {
  COMPATIBLE_PRESETS,
  DEFAULT_MODEL,
  SETTINGS_KEY,
  parseSettings,
  settingsSchema,
  type Provider,
  type Settings,
} from '../../shared/settings';

async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return parseSettings(stored[SETTINGS_KEY]);
}

const field = { display: 'grid', gap: 4 } as const;

export function Options() {
  // Stored keys are never put back into the form; we only remember whether one exists.
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [hasKey, setHasKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [baseUrl, setBaseUrl] = useState('');
  const [compatibleModel, setCompatibleModel] = useState('');
  const [hasCompatibleKey, setHasCompatibleKey] = useState(false);
  const [compatibleKey, setCompatibleKey] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadSettings().then((settings) => {
      setProvider(settings.provider);
      setHasKey(Boolean(settings.apiKey));
      setModel(settings.model);
      setBaseUrl(settings.compatible?.baseUrl ?? '');
      setCompatibleModel(settings.compatible?.model ?? '');
      setHasCompatibleKey(Boolean(settings.compatible?.apiKey));
    });
  }, []);

  const preset = COMPATIBLE_PRESETS.find((entry) => entry.baseUrl === baseUrl.trim().replace(/\/+$/, ''));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const url = baseUrl.trim();
    // Chrome only shows a permission prompt during the click itself, so ask before any await.
    let access: Promise<boolean> = Promise.resolve(true);
    if (provider === 'openai-compatible') {
      try {
        access = browser.permissions.request({ origins: [`${new URL(url).origin}/*`] });
      } catch {
        setMessage('Enter a valid http(s) base URL.');
        return;
      }
    }

    void (async () => {
      const granted = await access.catch(() => false);
      const current = await loadSettings();
      const next = settingsSchema.safeParse({
        provider,
        apiKey: apiKey.trim() || current.apiKey,
        model: model.trim() || DEFAULT_MODEL,
        ...(url || current.compatible
          ? {
              compatible: {
                baseUrl: url || current.compatible?.baseUrl,
                model: compatibleModel.trim() || current.compatible?.model,
                apiKey: compatibleKey.trim() || current.compatible?.apiKey,
              },
            }
          : {}),
      });
      if (!next.success || (provider === 'openai-compatible' && !next.data.compatible)) {
        setMessage('Enter a base URL (http or https) and a model name for the compatible provider.');
        return;
      }
      await browser.storage.local.set({ [SETTINGS_KEY]: next.data });
      setHasKey(Boolean(next.data.apiKey));
      setHasCompatibleKey(Boolean(next.data.compatible?.apiKey));
      setApiKey('');
      setCompatibleKey('');
      setMessage(
        granted
          ? 'Settings saved.'
          : 'Settings saved, but access to that address was not granted, so requests to it may be blocked.',
      );
    })();
  };

  const clearKeys = async () => {
    const current = await loadSettings();
    const { apiKey: _key, compatible, ...rest } = current;
    const { apiKey: _compatibleKey, ...compatibleRest } = compatible ?? {};
    await browser.storage.local.set({ [SETTINGS_KEY]: { ...rest, ...(compatible ? { compatible: compatibleRest } : {}) } });
    setHasKey(false);
    setHasCompatibleKey(false);
    setMessage('Saved keys removed.');
  };

  return (
    <main className="panel" style={{ maxWidth: 520 }}>
      <h1 className="panel__title">Tinker settings</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
        <fieldset style={{ display: 'grid', gap: 6, border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, padding: 0 }}>AI provider</legend>
          <label className="check">
            <input type="radio" name="provider" checked={provider === 'anthropic'} onChange={() => setProvider('anthropic')} />
            Anthropic (paid API key)
          </label>
          <label className="check">
            <input type="radio" name="provider" checked={provider === 'openai-compatible'} onChange={() => setProvider('openai-compatible')} />
            OpenAI-compatible (Groq, OpenRouter, Gemini, local Ollama, …)
          </label>
        </fieldset>

        {provider === 'anthropic' ? (
          <>
            <label style={field}>
              Anthropic API key
              <input type="password" autoComplete="off" value={apiKey} placeholder={hasKey ? 'A key is saved. Type to replace it.' : 'sk-ant-…'} onChange={(event) => setApiKey(event.target.value)} />
            </label>
            <label style={field}>
              Model
              <input value={model} onChange={(event) => setModel(event.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label style={field}>
              Preset
              <select value={preset?.id ?? ''} onChange={(event) => setBaseUrl(COMPATIBLE_PRESETS.find((entry) => entry.id === event.target.value)?.baseUrl ?? '')}>
                <option value="">Custom</option>
                {COMPATIBLE_PRESETS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            {preset && <p style={{ margin: 0, opacity: 0.75 }}>{preset.note}</p>}
            <label style={field}>
              Base URL
              <input value={baseUrl} placeholder="https://…/v1" onChange={(event) => setBaseUrl(event.target.value)} />
            </label>
            <label style={field}>
              Model name
              <input value={compatibleModel} placeholder="As listed by the provider" onChange={(event) => setCompatibleModel(event.target.value)} />
            </label>
            <label style={field}>
              API key (leave empty for a local server)
              <input type="password" autoComplete="off" value={compatibleKey} placeholder={hasCompatibleKey ? 'A key is saved. Type to replace it.' : ''} onChange={(event) => setCompatibleKey(event.target.value)} />
            </label>
            <p style={{ margin: 0, opacity: 0.75 }}>
              Saving asks Chrome for access to that address only. The selected element’s HTML and styles are sent there
              when you use AI edits; check the provider’s terms for how free-tier data is used.
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit">Save</button>
          {(hasKey || hasCompatibleKey) && (
            <button type="button" onClick={() => void clearKeys()}>
              Remove saved keys
            </button>
          )}
        </div>
        <p data-testid="key-state" style={{ margin: 0 }}>
          {provider === 'anthropic'
            ? hasKey ? 'API key saved.' : 'No API key saved.'
            : hasCompatibleKey ? 'API key saved.' : 'No API key saved.'}
          {message ? ` ${message}` : ''}
        </p>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Keys are stored in this browser profile only and are used solely by the extension’s background worker to call
          the provider you chose.
        </p>
      </form>
    </main>
  );
}
