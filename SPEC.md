# Tinker — AI Component Playground (Chrome Extension) — Build Spec

## What we're building
A Chrome extension (Manifest V3) that lets a frontend developer **experiment with UI directly on a running web page** (mainly their own React app on localhost) instead of the edit-code → save → reload → check loop.

The user can:
1. **Pick** any element on the page and see which React component rendered it, its props, its styles, and which styling system produced them.
2. **Tweak** it by hand (spacing, size, typography, colour, radius, shadow, layout, text).
3. **Ask AI** to change it ("make this card feel premium", "tighter spacing, match the navbar") or to generate **3 variants** they can flip between live.
4. **Export** the final result as something ready to apply to the codebase: a CSS diff, a precise change brief for Claude Code/Cursor (component, file, what to edit), or a JSON changeset.

**Nothing touches the user's source code in the MVP.** All changes live in the browser until exported. Writing changes back to source files needs a local companion process (Phase 5, not now).

## Differentiators (keep these in mind for every design decision)
- **Works beyond Tailwind:** detects CSS Modules, SCSS, styled-components/Emotion, MUI and Tailwind per element, and tells the user *where* in their code a change belongs.
- **Design-token aware:** extracts the page's CSS custom properties and snaps values to tokens instead of hard-coding pixels.
- **Variants, not just edits:** AI produces alternatives that can be compared live.
- **Agent-ready export:** the output is a precise brief a coding agent can apply in one shot.

## MVP scope
- **In:** Chrome only, MV3, React 17/18/19 apps (dev builds give the richest info); any other page gets style editing without React info. Style edits, best-effort text edits, AI edits + variants, export, per-URL session persistence.
- **Out (do not build):** structural edits (add/remove/reorder elements), writing to source files, Firefox/Safari, accounts, any backend server, team sharing, analytics/telemetry.

## Tech stack
- **WXT** (Vite-based extension framework) + React + TypeScript strict. Check WXT's current docs and version before scaffolding; if you hit a real blocker, stop and tell me before switching frameworks.
- **Redux Toolkit** for side-panel state (selection, change list, undo/redo, AI requests).
- **zod** for every message and every LLM response.
- **Storybook** for side-panel UI components.
- **Vitest** for unit tests, **Playwright** (persistent Chromium context with the unpacked extension loaded) for e2e.
- LLM: Anthropic Messages API called **only from the background service worker** via `fetch`. Model from settings (default `claude-sonnet-5`). User brings their own API key (options page, stored in `chrome.storage.local`). If the API rejects browser-origin requests, check Anthropic's docs for the direct-browser-access header rather than guessing.
- Ask before adding any other runtime dependency.

## Architecture
```
┌──────────────────────── Web page (e.g. localhost:5173) ─────────────────────┐
│  MAIN-world bridge script                                                    │
│   - reads React internals (fiber on DOM nodes / devtools hook)               │
│   - component name, owner chain, props (safe-serialized), source if known    │
│        ▲  window.postMessage / CustomEvent (session token, zod-validated)    │
│        ▼                                                                     │
│  Content script (isolated world)                                             │
│   - picker overlay in a closed Shadow DOM (hover highlight, select)          │
│   - change engine: applies overrides, re-applies after React re-renders      │
│   - styling-system detection, design-token extraction                        │
└───────────────▲──────────────────────────────────────────────────────────────┘
                │ chrome.runtime messaging (typed, zod-validated)
┌───────────────▼──────────────┐      ┌──────────────────────────────────────┐
│ Side panel (React + RTK)      │◄────►│ Background service worker            │
│ inspector, controls, AI box,  │      │ LLM client, API key, screenshots     │
│ variants, history, export     │      │ (captureVisibleTab), storage         │
└───────────────────────────────┘      └──────────────────────────────────────┘
```

Why a MAIN-world script: content scripts run in an isolated world and cannot see JS properties React attaches to DOM nodes. Only the MAIN-world bridge reads React internals; it exposes nothing privileged to the page.

## Core types (src/shared/types.ts)
```ts
interface TargetRef {            // how we find an element again after re-renders
  tinkerId: string;              // data-tinker-id we set on the element
  cssPath: string;               // fallback DOM path
  componentPath?: string[];      // e.g. ['App','Dashboard','UserCard']
  textSnippet?: string;          // first ~40 chars of text, for disambiguation
}

type StylingSystem =
  | 'css-modules' | 'scss-or-plain-css' | 'styled-components' | 'emotion'
  | 'mui' | 'tailwind' | 'inline' | 'unknown';

interface ElementInfo {
  target: TargetRef;
  tag: string;
  classes: string[];
  componentName?: string;
  ownerChain?: string[];
  props?: Record<string, unknown>;   // depth-limited, functions as "[fn]", no DOM nodes
  source?: { file: string; line: number; column?: number };
  styling: { system: StylingSystem; evidence: string[] }[]; // can be several
  computed: Record<string, string>;  // curated subset, see Inspector controls
}

interface Change {
  id: string;
  target: TargetRef;
  kind: 'style' | 'text';
  property: string;          // CSS property, or 'textContent'
  before: string;
  after: string;
  token?: string;            // e.g. 'var(--space-3)' if snapped
  origin: 'manual' | 'ai';
  createdAt: number;
}

interface Variant {
  id: string;
  name: string;              // e.g. 'Minimal', 'Bold', 'Soft'
  rationale: string;
  changes: Omit<Change, 'id' | 'createdAt'>[];
}
```

## Key behaviours

### React info
- Detect React via `__REACT_DEVTOOLS_GLOBAL_HOOK__` and/or fiber keys on DOM nodes (`__reactFiber$…`). Verify the exact keys against the React versions in the fixtures; don't assume.
- Component name = nearest fiber with a function/class type; show the owner chain as a breadcrumb.
- **Source location:** older React dev builds expose it on fibers; React 19 is believed to have removed that. Verify against the fixtures. Where it's missing, read optional `data-tinker-src="file:line"` attributes (from a tiny dev-only Vite/Babel plugin we ship in Phase 5). If unavailable, show "source unknown".
- Production builds: names may be minified; say so in the UI instead of showing garbage.

### Styling-system detection (per element, evidence shown in the UI)
- CSS Modules: hashed class pattern like `Card_title__x7Ab2` (also use stylesheet hints when same-origin).
- styled-components: `sc-` prefixed classes and/or `data-styled` style tags.
- Emotion: `css-` hashed classes with emotion style tags. MUI: `Mui*` classes plus emotion.
- Tailwind: utility-class patterns (`px-4`, `text-sm`, `bg-…`) with a confidence score.
- Inline: `style` attribute present.
- Several systems can apply to one element; report all with evidence.

### Change engine
- Style edits: one injected `<style id="tinker-overrides">` in the page `<head>` with rules like `[data-tinker-id="x"] { padding: 12px !important; }`.
- After React re-renders/remounts, a debounced MutationObserver re-finds elements via `TargetRef` and re-tags them. If an element can't be found, mark its changes "detached" in the UI; never apply to a guessed element.
- Text edits: best-effort, clearly labelled; React may overwrite them on re-render.
- Undo/redo (RTK), "show original" toggle (disables all overrides), clear all.
- Per-URL sessions saved in `chrome.storage.local`; re-apply on reload is opt-in.

### Design tokens
- Extract CSS custom properties from `:root` and same-origin stylesheets. Group into colour, spacing, radius, shadow, font.
- When the user types a value, suggest the nearest token (deterministic, no AI). UI shows e.g. `13px → var(--space-3) (12px)`.

### Inspector controls
Spacing (margin/padding per side), size (width/height/min/max), typography (size, weight, line-height, letter-spacing), colour (text/background/border, with token picker), border/radius, shadow, opacity, display, basic flex/grid (direction, gap, align, justify).

### AI
- Context builder sends ONLY the selected element: tag, classes, trimmed outerHTML (cap ~4k chars), curated computed styles, component name + props summary, parent layout context, token list, optional cropped screenshot of the element.
- Show a "What will be sent" preview before the first request in a session.
- Prompts live in `src/prompts/*.md`, not inline in code.
- The model must return JSON matching a zod schema: `{ variants: Variant[] }`. Reject anything else and retry once with the validation error.
- Allowlist CSS properties; validate every value with `CSS.supports(property, value)`; drop invalid ones and report them.
- Instruct the model to prefer `var(--token)` when a token is close.
- Modes: "Apply change" (1 variant) and "Give me 3 variants" (live switch A/B/C, then "Keep this one").
- Show tokens used and estimated cost per request; handle timeouts, rate limits and a missing key gracefully.

### Export
1. **CSS overrides** — a clean CSS file of the final changes.
2. **Change brief (markdown)** for Claude Code/Cursor, per element: component name, source file:line if known, detected styling system + where the edit most likely belongs (e.g. class `Card_title__x7Ab2` → `Card.module.(s)css` → `.title`), before/after table, tokens used, and an instruction telling the agent to edit the source (not add overrides).
3. **JSON changeset** with a versioned schema (`"version": 1`) — the Phase 5 companion will consume it.
- Copy to clipboard and download. Optional before/after screenshots of the element.

## Permissions, security, privacy
- Minimal permissions: `activeTab`, `scripting`, `sidePanel`, `storage`. Host permission only for `https://api.anthropic.com/*`.
- Inject scripts programmatically when the user activates the extension on a tab (activeTab). For "re-apply on reload", request an optional host permission for that origin only, at that moment.
- Treat everything from the page as untrusted: validate every bridge message with zod and a per-session random token. Never `eval` or inject page-provided strings as code. The overlay lives in a closed Shadow DOM.
- The API key never leaves the service worker (never sent to content scripts or the page).
- No telemetry.

## Performance
- Hover highlight stays smooth (requestAnimationFrame) on a 5,000-node page.
- Re-tagging after re-renders must not cause visible flicker; debounce observers.

## Repo layout
```
src/
  entrypoints/        # WXT entrypoints: background, content, main-world bridge, sidepanel, options
  shared/             # types, zod schemas, message contracts
  content/            # picker overlay, change engine, detection, tokens
  bridge/             # React fiber reading (MAIN world)
  sidepanel/          # React + RTK app, components (+ stories)
  background/         # LLM client, screenshots, storage
  prompts/            # LLM prompt templates
fixtures/
  playground-app/     # Vite React 19 app (see Phase 0)
  react18-app/        # tiny React 18 app for the older source-location path
tests/e2e/            # Playwright
DECISIONS.md          # one line per non-obvious choice
```

## Phases — stop after EACH phase, show test output + a short summary, wait for my go-ahead

### Phase 0 — Scaffold + fixtures
- WXT + React + TS strict + RTK + zod + Vitest + Playwright + Storybook.
- Extension loads, side panel opens, options page stores the API key.
- `fixtures/playground-app` (React 19) with sections styled 5 ways: CSS Modules card, SCSS navbar, styled-components button, MUI dialog + button, Tailwind hero. Plus: a component that re-renders every second (timer), a list rendered from state, a conditionally rendered component, and a `:root` design-token sheet (colours, spacing scale, radius, shadows).
- `fixtures/react18-app`: one small component tree.
- **Done when:** a Playwright test loads the unpacked extension, opens the fixture, activates the extension and sees the side panel.

### Phase 1 — Picker + inspector (no AI)
- Hover highlight + label (component name or tag), click to select, Esc to cancel, ↑/↓ to move to parent/child, owner-chain breadcrumb.
- MAIN-world bridge: React detection, component name, owner chain, safe props, source location where available.
- Styling-system detection with evidence; curated computed styles in the inspector.
- **Done when:** e2e tests select each fixture section and assert the correct component name and styling system; the React 18 fixture shows source file:line.

### Phase 2 — Manual edits + change engine + tokens
- All inspector controls, override stylesheet, TargetRef re-finding, detached state, undo/redo, show-original, per-URL persistence, token extraction + snapping suggestions.
- **Done when:** edits survive the timer re-render and list re-ordering in e2e; undo/redo, persistence and token snapping have unit tests.

### Phase 3 — AI edits + variants
- Background LLM client, context builder, "what will be sent" preview, zod-validated responses, property allowlist + `CSS.supports` validation, 1-change and 3-variant modes with live switching, cost display, error states.
- **Done when:** unit tests pass with a mocked LLM; e2e passes with mocked responses; one opt-in real-API test (env-gated) succeeds against the fixture.

### Phase 4 — Export
- CSS overrides, change brief markdown, JSON changeset v1, clipboard + download, optional screenshots.
- **Done when:** golden-file tests pass for an export from each styling-system section of the fixture.

### Phase 5 — Local companion for write-back (DO NOT START until I explicitly say so)
Dev-only Vite plugin (adds `data-tinker-src`) + local Node server. Consumes the JSON changeset, maps changes to source (CSS Modules/SCSS via PostCSS AST, styled-components/Emotion via Babel AST, Tailwind class edits, MUI `sx`), asks "this instance or the whole component?", shows a diff, writes only after user approval.

## Rules for you (Claude Code)
- One phase at a time. Propose the plan for the phase and wait for my OK before writing code.
- Tests first for detection, change-engine and validation logic. Fixtures are the source of truth.
- Don't guess APIs (WXT, Chrome extension APIs, React internals, Anthropic API). Check installed versions, types and current docs.
- Never apply a change to an element you're not sure is the right one; show it as detached instead.
- Keep detection and change-engine logic as pure functions where possible; Chrome/DOM I/O at the edges.
- If something in this spec is ambiguous or turns out impossible, ask me instead of inventing behaviour.
- Log non-obvious decisions in DECISIONS.md, one line each.
