# Tinker — prompts to paste into Claude Code
Use one fresh Claude Code session per prompt. Put SPEC.md in the repo root first.

## Phase 0 — Scaffold + fixtures
```
Read SPEC.md fully. Do Phase 0 only.
Before writing code: check WXT's current docs/version and confirm how it handles a MAIN-world content script and the side panel in MV3. Propose your plan and wait for my OK.
Build the scaffold and both fixture apps. Add fixtures/MANIFEST.md mapping every fixture section (each styling system, timer, list, conditional, tokens) to its component name and file.
Stop when the Playwright test loads the extension, opens the fixture and sees the side panel. Show me the test output and MANIFEST.md.
```

## Phase 1 — Picker + inspector
```
Read SPEC.md, DECISIONS.md and fixtures/MANIFEST.md. Do Phase 1 only.
1. First write a small script that dumps the actual fiber keys and source-location fields from both fixture apps (React 19 and React 18). Record the findings in DECISIONS.md before building the bridge.
2. Tests first for styling-system detection (pure functions over class lists + style-tag hints).
3. Build the picker overlay (closed Shadow DOM), MAIN-world bridge, owner-chain breadcrumb, inspector.
Propose the plan first. Stop when e2e tests pass for every MANIFEST.md section. Show me a screenshot of the inspector on the CSS Modules card.
```

## Phase 2 — Manual edits + change engine + tokens
```
Read SPEC.md and DECISIONS.md. Do Phase 2 only.
1. Tests first: TargetRef re-finding, undo/redo reducer, token snapping (nearest-value maths).
2. Build the override stylesheet engine, debounced re-tagging after re-renders, detached state, show-original, per-URL persistence, all inspector controls.
3. Never apply a change to an element you can't confidently re-find — mark it detached.
Propose the plan first. Stop when edits survive the timer re-render and list re-ordering in e2e. Report how long re-tagging takes on a 5,000-node synthetic page.
```

## Phase 3 — AI edits + variants
```
Read SPEC.md and DECISIONS.md. Do Phase 3 only. This is the first phase that calls an LLM.
1. Check Anthropic's current Messages API docs before writing the client (request format, image input, any header needed for browser-origin requests).
2. Prompts go in src/prompts/*.md. Response must match the zod Variant schema; on failure retry once with the validation error.
3. Allowlist CSS properties, validate values with CSS.supports, prefer var(--token) values.
4. "What will be sent" preview, 1-change and 3-variant modes with live A/B/C switching, cost display, error states (no key, timeout, rate limit).
5. Unit tests with a mocked client; one env-gated real-API test.
Propose the plan first. Stop when all tests pass. Show me the exact payload sent for the MUI button and the 3 variants returned in the real-API test.
```

## Phase 4 — Export
```
Read SPEC.md and DECISIONS.md. Do Phase 4 only.
1. Golden-file tests first: one export per styling-system section of the fixture.
2. Build CSS overrides export, the markdown change brief for coding agents, JSON changeset v1 (versioned zod schema), clipboard + download, optional before/after element screenshots.
3. The change brief must tell the agent where the edit belongs (e.g. CSS Module class → Card.module.scss → .title) and to edit source, not add overrides.
Propose the plan first. Stop when golden tests pass. Paste the change brief generated for the CSS Modules card so I can test it in a real Claude Code session.
```

## Review prompt (fresh session, after every phase)
```
Review the changes on this branch against SPEC.md for Phase <N>. Don't modify code.
List: 1) deviations from the spec, 2) untested paths, 3) places where a change could be applied to the wrong element, 4) security issues in page <-> extension messaging, 5) anything that will block the next phase.
Rank them by severity.
```
