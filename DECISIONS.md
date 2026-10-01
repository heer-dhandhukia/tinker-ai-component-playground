# Decisions

One line per non-obvious choice.

## Phase 0
- Versions: WXT 0.21.4, Vite 8, React 19.3, TypeScript 7, zod 4, RTK 2.13, Vitest 5, Playwright 1.63, Storybook 10; npm as package manager.
- `srcDir: 'src'` so entrypoints live in `src/entrypoints/` as SPEC.md's layout shows.
- The content script is a WXT *unlisted script* (`tinker-content.ts`), not a WXT content script: even with `registration: 'runtime'`, WXT adds the script's `matches` (`<all_urls>`) to `host_permissions`.
- The MAIN-world bridge is injected by the background with `chrome.scripting.executeScript({ world: 'MAIN', files })`, not WXT's `injectScript()`, so nothing needs to be listed in `web_accessible_resources`.
- Session token: generated in the background per activation, handed to the content script by runtime message and to the bridge through a one-shot non-enumerable `window.__tinkerBoot` property that the bridge deletes on start.
- The token is not a secret from a hostile page (anything in the MAIN world is page-visible); it rejects stale and accidental messages, and zod validation of every message is the real boundary.
- Bridge messages use `window.postMessage(..., '*')`: the target is always the same window, and a fixed origin throws on opaque origins such as `file://`.
- Toolbar click opens the global side panel with `sidePanel.open({ windowId })` synchronously in the gesture, then injects; `openPanelOnActionClick` is not used because it suppresses `action.onClicked`, which we need for `activeTab`.
- Per-tab connection status lives in `chrome.storage.session` (survives service-worker restarts, unreadable from content scripts); any navigation resets the tab to inactive.
- The background accepts `panel/*` messages only from extension-page URLs and `content/*` only from tabs.
- E2E: Playwright cannot click the toolbar action, so `wxt build --mode e2e` (output `.output/chrome-mv3-e2e`) adds host access (`<all_urls>`, see the follow-up section) and exposes `__tinkerE2E.activate` in the service worker; the production build has neither (unit-tested manifest, hook compiled out).
- E2E opens `sidepanel.html?tabId=N` as a normal tab; the real toolbar-click and side-panel-open path is only verified by hand.
- Options page never reads the saved API key back into the form; it only tracks whether one exists.
- Default model is `claude-sonnet-5` as SPEC.md states; to be checked against Anthropic's docs in Phase 3.
- Fixtures are independent npm packages (not workspaces) so React 19 and React 18 never share `node_modules`.
- Playground CSS Modules use `Component_local__hash` names to match SPEC.md; Phase 1 detection must also handle Vite's default `_local_hash_n`.
- TypeScript 7 no longer auto-includes `@types/*`, so `tsconfig.json` lists `node` and `chrome` explicitly.

## Phase 1 — observed React internals (`node scripts/dump-fibers.mjs`, React 19.3.0 and 18.3.1 dev builds)
- Both versions attach `__reactFiber$<random>` and `__reactProps$<random>` to host DOM nodes and `__reactContainer$<random>` to the root container; the suffix differs per page load, so keys are matched by prefix.
- `__REACT_DEVTOOLS_GLOBAL_HOOK__` exists in both fixtures (a stub from the React refresh runtime) but its `renderers` map is empty, so the hook cannot be used for detection or version; React is detected from fiber keys on DOM nodes.
- React 18 fibers have `_debugSource { fileName, lineNumber, columnNumber }` (absolute path of the JSX call site) and `_debugOwner`.
- React 19 fibers have no `_debugSource`; they have `_debugOwner`, `_debugStack` (an Error) and `_debugTask`.
- React 19 `_debugStack` frame 2 names the component and the served module URL of the JSX call site (e.g. `at Navbar (http://localhost:5173/src/components/Navbar.tsx:10:25)`), but line and column refer to Vite's transformed output, not the source file (the `<nav>` is on source line 7).
- Elements created inside libraries are distinguishable: in React 19 their `_debugStack` call site is under `/node_modules/`; in React 18 they have no `_debugSource`.
- Composite fibers seen: tag 0 (function), tag 11 (forwardRef; name on `type.displayName` or `type.render.name`), e.g. `styled.button`, MUI `Button` → `MuiButtonRoot` → `ButtonBase` → `MuiButtonBaseRoot`.
- The MUI dialog renders through a portal (fiber tag 4): its DOM parent is `body`, but its fiber owner chain still leads to `SettingsDialog` → `App`.

## Phase 1 — choices
- Component name = the nearest component written in app code: walk host → owners and take the owner of the first element whose JSX call site is outside `node_modules`; the library component in between is reported as `via` (MUI button → `SettingsDialog` via `Button`).
- The owner-chain breadcrumb lists app-code components only; library internals (`MuiButtonRoot`, `ButtonBase`, …) are left out.
- React 19 source shows the file only, no line: `_debugStack` line numbers refer to transformed output. `ElementInfo.source.line` is therefore optional (SPEC.md had it required). Real lines wait for `data-tinker-src` (Phase 5), which already takes precedence when present.
- If no element in the chain has source info (JSX built without the dev transform), the nearest owner is used; in production builds (no `_debugOwner`) the nearest composite fiber in the return chain is used and the UI says names may be minified.
- The two JS worlds cannot share element references, so the content script marks the element with a short-lived `data-tinker-probe="<uuid>"` attribute that the bridge looks up; the bridge never receives selectors or code from the content script, only that id (schema-limited to `[a-z0-9-]`).
- Props are serialised in the bridge: depth 3, 30 keys, 20 array items, 200-char strings, functions as `[fn]`, React elements and DOM nodes summarised, getters guarded.
- Styling detection reads stylesheet hints: class names defined in `<style data-styled>` / `<style data-emotion>` and in sheets whose origin is a `*.module.*` file, so generated classes like `iEhlzc` are attributed with evidence instead of guessed.
- Elements with `Mui*` classes report `mui` only; their Emotion class is listed as evidence, not as a second `emotion` system. Standalone Emotion still reports `emotion`.
- `styled-components` and `emotion` are only reported when their style tags exist on the page; `sc-foo` / `css-foo` alone count as plain CSS.
- Tailwind is heuristic: confidence 0.4/0.6/0.8/0.9 for 1/2/3/4+ unambiguous utilities, +0.1 for variants, arbitrary values or palette colours, reported from 0.5. Bootstrap-style utilities (`p-3 mt-2 text-center`) can score 0.8; the confidence and evidence are shown for that reason. `StylingMatch` gained an optional `confidence`.
- Each class is claimed by one system; leftovers are `scss-or-plain-css`.
- Picker keys: ↑/↓ move the hover candidate to parent/first child and Enter selects it, only while picking, so arrow keys are not taken from the page afterwards. After selecting, the panel's Parent/Child buttons do the same.
- While picking, pointer/mouse/click events are cancelled in the capture phase on `window` so the page's own handlers do not fire.
- Selecting an element sets `data-tinker-id` on it now (Phase 2's change engine builds on it).
- The overlay is a closed shadow root; in the e2e build only, its label and picking state are mirrored to attributes on the host element so tests can read them.
- The side panel talks to the content script directly with `tabs.sendMessage`; content-script events are broadcast with `runtime.sendMessage` and the panel filters on the sending tab id.

## Phase 2 — choices
- The side panel's Redux store owns the change list (with undo/redo); the content script is told the whole list (`changes/apply`) and makes the page match it. A reopened panel reads the live list back from the page.
- Override stylesheet is generated as text by the pure `buildOverrideCss` (also the basis for Phase 4's CSS export). Only allowlisted properties (the inspector's set), tinkerIds matching `[a-z0-9-]`, and values passing `isSafeCssValue` + `CSS.supports` are written; `url(` is refused so an override can never trigger a network request.
- Re-finding rule (`chooseMatch`): an element still carrying its `data-tinker-id` is trusted. Otherwise a candidate at the stored `cssPath` must have the same app-code component chain and the same text snippet, and be the only such candidate. Off-path, a unique element with the same tag, component chain and text is accepted only if the target has both. Anything else is detached.
- Known limit of that rule: a re-mounted element with no text is matched on path + component chain alone, so in a list of text-less siblings of the same component that re-mount in a different order it could match a sibling. Elements whose text changes while unmounted become detached (safe side).
- An element already tagged as another target is never re-used for a second target.
- No debounce on the hot path: the MutationObserver callback only checks `isConnected` per tracked element (before paint). A reconcile runs immediately when something is lost; detached targets are retried 150 ms after later DOM changes. Measured on a 5,000-node page with 20 targets: 7.1 ms to re-tag after replacing every node; in-place updates trigger no reconcile.
- Text edits: only for elements without child elements; re-applied when React overwrites the text node; labelled best-effort in the UI. The target's text snippet always records the page's own text, not the edited text.
- Undo/redo: snapshots of the change list, 100 steps; edits to the same property within 1 s are one step; re-editing keeps the original `before`; setting a value back to its original removes the change.
- Sessions: stored per origin + path (query and hash ignored) under `session:<key>` in `chrome.storage.local`, schema version 1. After a reload the saved session is offered (Restore / Discard), not applied.
- "Re-apply on reload" asks for the page's origin via `permissions.request` at the moment the box is ticked; the manifest gained `optional_host_permissions: ['http://*/*', 'https://*/*']` so that request is possible (nothing is granted at install). The background then activates and re-applies on `tabs.onUpdated` for granted origins only.
- Token extraction: custom properties declared on `:root`/`html` in readable stylesheets, including inside `@layer`/`@supports`, not inside `@media`. Categories come from the value (colours) then the name.
- Token snapping: lengths within max(2px, 15%) of a spacing/radius/font-size token, colours within RGB distance 30 with matching alpha, shadows only when identical; ties go to the smaller token. Suggestions appear only on fields the user has edited, and are applied only when the user clicks "Use token".
- Width/height fields get no token suggestions (spacing tokens are not size tokens).
- Colour fields are a text input plus a token picker; there is no native colour-picker input.
- The stress fixture (`public/stress.html`) is driven by sending `changes/apply` from the service worker, the same path a re-applied session takes.

## Phase 3 — Anthropic API (checked against the docs and the official SDK source, 2026-10-01)
- Raw `fetch` to `POST https://api.anthropic.com/v1/messages`, as SPEC.md requires (no SDK dependency). Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type`, and `anthropic-dangerous-direct-browser-access: true` (the header the official TypeScript SDK sends for browser-origin requests; name confirmed in its source).
- Structured output: `output_config: { format: { type: 'json_schema', schema } }`; the JSON arrives as text in `content[]`. Schema uses only supported features (every object has `additionalProperties: false`, property names as an `enum`).
- Image input: `{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }`, placed before the text block.
- `claude-sonnet-5` (SPEC.md's default) is a valid current model id ($2 / $10 per million tokens); kept as the default. Prices for cost estimates are a built-in table of list prices; unknown models show "cost unknown".
- No `thinking` or `effort` parameters are sent, so any model the user configures works (some reject `effort`); the model's own defaults apply. `max_tokens` is 16000, non-streaming, with a 120 s timeout.
- No automatic retry on 429/5xx: the error is shown with the `retry-after` delay. The only retry is the spec's one: an invalid response is sent back once with the validation error.
- `stop_reason: "refusal"` and `"max_tokens"` are reported as errors instead of being parsed.

## Phase 3 — choices
- The model returns `{ variants: [{ name, rationale, changes: [{ property, after }] }] }`, not full `Change` objects: target, `before`, `origin` and token flags are filled in locally from the selected element, so the model cannot address any other element. The result is converted to SPEC.md's `Variant` type.
- AI edits are CSS only (no text changes), limited to the same property allowlist as manual edits.
- `CSS.supports` does not exist in a service worker, so the background validates shape (zod) and the side panel validates values (allowlist, `isSafeCssValue`, `CSS.supports`), drops what fails and lists it with reasons.
- Prompts are `src/prompts/system.md` and `user.md`, filled by the pure `buildAiRequest`; the panel's preview and the background's request both come from that function, so the preview is the exact text sent.
- The preview is shown before the first request of a panel session, and on demand via "What will be sent?".
- Context sent: tag, classes, outerHTML capped at 4,000 characters with Tinker's own attributes removed, the curated computed styles, component name / via / props summary (600 characters), ten layout properties of the parent, and the page's tokens (excluding uncategorised ones, max 150). The system prompt tells the model the HTML is untrusted data.
- "Apply change" adds its one variant to the change list immediately (Undo reverts it). "Give me 3 variants" previews variant A live without touching the change list; switching replaces the preview; "Keep this one" adds the variant as a single undo step.
- A previewed variant is taken off the page before the next request's context is read, so the model sees only kept changes. Selecting another element discards the preview and results.
- Screenshot is opt-in per request and never blocks it: the overlay is hidden, the visible tab captured and cropped to the element in the service worker (`OffscreenCanvas`), downscaled to 1568 px. If the page is not the visible tab, the capture fails, or the element is off-screen, the request goes without it and the reason is shown.
- E2E uses a local HTTP server standing in for the API; only the e2e build can redirect the API base (`__tinkerE2E.overrideEndpoint`). The real-API test is opt-in: `TINKER_REAL_API=1 ANTHROPIC_API_KEY=… npx playwright test real-api`.
- Token values are read from the root's computed style, not from the declaring rule: the playground's own `--radius-md: 8px` and Tailwind's `@layer theme` `--radius-md: 0.375rem` share a name, and only the cascade knows which one applies (found while reading the Phase 3 payload; fixes Phase 2 token extraction).

## Phase 4 — choices
- Exports are pure functions in `src/shared/export.ts` of the kept change list plus per-element details; a variant that is only being previewed is not exported.
- Element details (tag, classes, component, via, owner chain, source, styling matches) are recorded whenever an element is selected and saved with the session (`elements`, an optional field of session v1), so a restored session exports the same brief without re-selecting anything. Props and computed styles are not stored.
- `StylingMatch` gained `classes` (the element's classes claimed by that system) and `moduleFile` (CSS Modules), so exports do not have to parse evidence text.
- JSON changeset v1: `{ version: 1, tool: 'tinker', exportedAt, page: { url }, elements: [{ target, element, changes }] }`, validated by `changesetSchema`. Change ids and timestamps are left out; `inputFromChangeset` rebuilds the export input, which is what Phase 5 will start from.
- Golden files (`tests/golden/<section>.{md,css,json}`) are generated from the real playground by `tests/e2e/export.spec.ts` (`UPDATE_GOLDEN=1`); random tinkerIds and the timestamp are normalised. The unit test re-derives the brief and CSS from each golden changeset, so the goldens are checked both end to end and as pure functions.
- Change brief "where to edit" hints per system: CSS Modules `Class_local__hash` → `Class.module.(s)css` → `.local` (the real file name when the stylesheet was readable); BEM classes get their likely SCSS nesting; MUI names the `sx` prop on the placed component and its slot class; Tailwind gets the exact value as a typed arbitrary utility (`text-[color:…]`, `pt-[48px]`); inline points at the `style` prop.
- CSS override export uses the element's own classes as the selector (up to three, from its first non-Tailwind system), falling back to the DOM path for Tailwind, inline and unclassed elements. No `!important`. Text changes appear as comments.
- React 19 source paths come from dev-server URLs, so the leading slash is dropped (`src/components/UserCard.tsx`); React 18's absolute filesystem paths are kept as they are.
- Copy uses `navigator.clipboard.writeText`; download uses a blob link, so no `downloads` permission is needed.
- Before/after screenshots: two captures of the visible tab (overrides off, then on, 600 ms apart for Chrome's capture rate limit), cropped per element and downloaded as PNGs. Same limits as the AI screenshot: the page must be the visible tab and the element on screen.

## Phase 5 — companion
- The companion is a separate package (`companion/`, plain ESM JavaScript, no build step) with its own dependencies: `postcss`, `postcss-scss`, `@babel/parser`, `diff`, `zod`. Nothing was added to the extension.
- It duplicates the changeset v1 schema rather than importing the extension's TypeScript; `companion/tests/schema.test.ts` checks both accept the golden changesets identically and write the same property set.
- Flow: download or copy the JSON changeset from the extension, paste it into the companion's local review page. The extension does not talk to the companion directly (that would need a localhost host permission and token entry in the extension).
- "This instance or the whole component?" is answered per element by choosing among concrete edit sites: each stylesheet rule / styled template is labelled as shared by every element that uses it, and "Only this element" (an inline `style` prop) is offered when the element's exact source position is known.
- Never guess: an option is ready only when exactly one place matches. Zero or several matches, a rule shared with other selectors, a rule inside `@media`, a non-literal prop, or a stale position make it "not available" with the reason.
- Only the most specific option is pre-selected. If it is unavailable, broader rules (e.g. `.navbar__link` for an element that is also `--active`) are offered but must be chosen by hand.
- New declarations go after the last existing declaration of the rule (so they win over a shorthand and stay above nested rules); existing declarations are updated in place. Stylesheets are re-serialised by PostCSS, which leaves untouched nodes byte-identical.
- styled-components templates are edited by replacing interpolations with placeholders, editing as CSS, and restoring them; a template that cannot be read as CSS is refused.
- MUI `sx` and inline `style` values are always written as strings (a number in `sx` would be scaled by the theme).
- Tailwind: utilities for the same property without a variant prefix are replaced with an arbitrary-value utility; shorthands (`py-10`) and variant utilities (`hover:`) are kept.
- Text changes are reported, not written.
- Safety: paths are resolved with `realpath` and must stay inside the project root and outside `node_modules`; writes are temp-file-then-rename; a file whose hash changed since the plan is skipped; values are re-checked as safe before being written into CSS or JS strings.
- Server: binds 127.0.0.1 only; random 48-hex session token carried in the link's fragment and sent as a header; Host and Origin are checked (other sites, DNS rebinding); 2 MB body limit; strict CSP on the page.
- `tinker-src` Vite plugin: dev-only (`apply: 'serve'`), stamps `data-tinker-src="file:line:column"` on host elements and components, skipping fragments, React built-ins and member expressions. On components the attribute reaches the DOM only if the component forwards props (MUI and styled-components do). It returns no source map; attributes are inserted on existing lines, so line numbers are unchanged but columns shift.
- The playground runs a second dev server with the plugin (`TINKER_SRC=1`, port 5175) so both the plain React 19 path and the plugin path are tested. All companion tests write to a temp copy of the fixture source.

## Follow-up after Phase 5 — gaps closed
- The e2e build's host access is `<all_urls>` rather than `http://localhost/*`: `captureVisibleTab` only accepts `<all_urls>` or `activeTab`, and e2e cannot obtain `activeTab`. This let both screenshot paths be tested for real (AI attachment and export before/after), with the crop checked against the element's size.
- Consequence for production: screenshots need `activeTab`, which the toolbar click grants. A page activated by "Re-apply on reload" (no click) cannot be captured until the icon is clicked; the request goes ahead without the screenshot and says why.
- Hover performance measured on the 5,000-node page: 300 mouse moves across different elements, p95 frame gap 16.7 ms, no long tasks.
- A production build of the playground is served on port 5176 for e2e. Component names there are minified (`UserCard` is reported as `Vf`); the inspector says so and the change brief tells the agent not to search for the name. `ElementMeta` gained `reactBuild` for that.
- The side panel is shared by every tab in a window, so unless pinned with `?tabId=` it follows `tabs.onActivated`: it rebinds to the active tab, drops the previous tab's selection, change list and AI state from the panel (the page keeps its changes), and reads the new tab's live changes back.

## AI providers beyond Anthropic (requested after Phase 5)
- Settings gained `provider`: `anthropic` (default, unchanged) or `openai-compatible` with its own base URL, model and optional key. One chat-completions adapter covers Groq, OpenRouter, Gemini and local Ollama. Settings saved before this are read as Anthropic.
- This departs from SPEC.md, which names Anthropic only and allows a host permission only for `api.anthropic.com`. The manifest is unchanged: access to the chosen provider's origin is requested at the moment its settings are saved, through the existing optional host permissions.
- Preset base URLs come from each provider's docs (checked 2026-10-01): `https://api.groq.com/openai/v1`, `https://openrouter.ai/api/v1`, `https://generativelanguage.googleapis.com/v1beta/openai`, `http://localhost:11434/v1`. Model names are not prefilled; they change and each provider lists its own.
- Compatible requests are `POST {baseUrl}/chat/completions` with `Authorization: Bearer <key>` only when a key is set (Ollama needs none), a system message plus user message, and `response_format: { type: 'json_object' }`. If the server answers HTTP 400, the request is retried once without `response_format`, since not every server accepts it.
- These providers cannot enforce the response schema, so the system prompt gets an extra section spelling out the JSON shape (`src/prompts/json-shape.md`), and the reply is read leniently: the outermost `{…}` is taken, so code fences and surrounding prose are tolerated. The zod check, the single validation retry, the property allowlist and `CSS.supports` apply exactly as for Anthropic.
- The "what will be sent" preview names the actual destination (host and model) and shows the prompt for that provider; the panel asks the background for this and never sees a key.
- Cost is shown as unknown for compatible providers (no price table).
- Ollama rejects requests from extension origins unless started with `OLLAMA_ORIGINS=chrome-extension://*`; the options page says so. Not verified against a running Ollama.
- Screenshots are sent as `image_url` data URLs; a text-only model may reject them, which surfaces as an API error.
