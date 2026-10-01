# Tinker

A Chrome extension for experimenting with UI directly on a running web page: pick an element,
see which React component and styling system produced it, tweak it by hand or with AI, and export
the result as a change brief, CSS or a JSON changeset. `companion/` can then write a changeset
back to source after you approve each diff.

The full specification is in [SPEC.md](SPEC.md); non-obvious choices are in [DECISIONS.md](DECISIONS.md).

## Setup

```bash
npm install
npm run fixtures:install
npx playwright install chromium
```

## Run the extension

```bash
npm run build
```

Load `.output/chrome-mv3` in `chrome://extensions` (Developer mode → Load unpacked), open your app,
and click the Tinker toolbar icon.

AI edits need a provider, chosen in the extension's options: Anthropic (paid key), or any
OpenAI-compatible endpoint. Presets are included for Groq, OpenRouter and Google Gemini (each has a
free tier and needs its own key) and for local Ollama (no key; start it with
`OLLAMA_ORIGINS=chrome-extension://*`). Everything except AI edits works without any provider.

## Tests

| Command | What it runs |
| --- | --- |
| `npm test` | Unit tests (Vitest), including the companion's |
| `npm run test:e2e` | Builds the e2e extension and runs Playwright against the fixture apps |
| `npm run compile` | Type check |
| `npm run storybook` | Side panel components |
| `TINKER_REAL_API=1 ANTHROPIC_API_KEY=… npx playwright test real-api` | One opt-in test against the real Anthropic API |
| `UPDATE_GOLDEN=1 npm run test:e2e -- export` | Regenerates `tests/golden/` from the playground; review the diff |

The e2e build (`.output/chrome-mv3-e2e`) has extra host access and a test hook; never ship it.

## Layout

| Path | Contents |
| --- | --- |
| `src/entrypoints/` | Background worker, content script, MAIN-world bridge, side panel, options |
| `src/shared/` | Types, zod schemas, message contracts, export and token logic |
| `src/content/`, `src/bridge/` | Picker, change engine, styling detection; React fiber reading |
| `src/sidepanel/`, `src/background/` | Panel UI and state; LLM client, screenshots |
| `src/prompts/` | LLM prompt templates |
| `fixtures/` | Test apps; `fixtures/MANIFEST.md` maps every section |
| `companion/` | Write-back companion and the `tinker-src` Vite plugin ([README](companion/README.md)) |
| `tests/` | Unit, e2e and golden files |
