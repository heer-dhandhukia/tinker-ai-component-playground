# Fixture manifest

Source of truth for e2e tests. Class names and style tags below were read from the running
dev servers, not assumed. Run both apps with `npm --prefix fixtures/<app> run dev`.

## playground-app — React 19.3, Vite 8, http://localhost:5173

Each section is wrapped in `<section data-section="…">` in `src/App.tsx` (the navbar sits above them).

| Section | Locator | Component | File | Styling system | Evidence in the DOM |
| --- | --- | --- | --- | --- | --- |
| SCSS navbar | `nav.navbar` | `Navbar` | `src/components/Navbar.tsx` + `Navbar.scss` | scss-or-plain-css | BEM classes `navbar`, `navbar__brand`, `navbar__links`, `navbar__link`, `navbar__link--active` |
| CSS Modules card | `[data-section="css-modules"] article` | `UserCard` | `src/components/UserCard.tsx` + `UserCard.module.css` | css-modules | `UserCard_card__7Yz-v`, `UserCard_title__fWrPo`, `UserCard_role__pWLZW`, `UserCard_badge__3chLa` |
| styled-components button | `[data-section="styled-components"] button` | `PrimaryButton` (via `styled.button`) | `src/components/PrimaryButton.tsx` | styled-components | classes `sc-bdvwhi iEhlzc`; `<style data-styled="active" data-styled-version="6.5.3">` |
| MUI button | `[data-section="mui"] button` | `SettingsDialog` (via MUI `Button`) | `src/components/SettingsDialog.tsx` | mui (+ emotion) | `MuiButtonBase-root MuiButton-root MuiButton-contained … css-2rwryq-MuiButtonBase-root-MuiButton-root`; `<style data-emotion="css">` tags |
| MUI dialog | `.MuiDialog-paper` (after clicking "Open settings"; rendered in a portal on `body`) | `SettingsDialog` (via MUI `Dialog`) | `src/components/SettingsDialog.tsx` | mui (+ emotion), inline | `MuiPaper-root … MuiDialog-paper MuiDialog-paperWidthSm css-uq7k9j-MuiPaper-root-MuiDialog-paper`; `style="--Paper-shadow: …"` set by MUI |
| Tailwind hero | `[data-section="tailwind"] > div` | `Hero` | `src/components/Hero.tsx` | tailwind | `rounded-xl bg-indigo-600 px-8 py-10 text-white shadow-lg` |
| Timer (re-renders every 1s) | `[data-testid="timer"]` | `Timer` | `src/components/Timer.tsx` | scss-or-plain-css | class `timer` (no rules attached) |
| List from state | `[data-testid="todo-items"] li` | `TodoItem` (owners `App` › `TodoList` › `TodoItem`) | `src/components/TodoList.tsx` | scss-or-plain-css | class `todo-item`; buttons "Add", "Reverse order", "Remove first" mutate the list |
| Conditional | `[data-testid="promo-banner"]` (after clicking "Show promo"; otherwise `[data-testid="promo-hidden"]`) | `PromoBanner` | `src/components/PromoBanner.tsx` | inline | `style="padding: var(--space-3) var(--space-4); background: var(--color-primary); …"` |
| Design tokens | `:root` | — | `src/styles/tokens.css` | — | 9 colours `--color-*`, 7 spacing steps `--space-1…7` (4–48px), 4 radii `--radius-*`, 3 shadows `--shadow-*`, fonts `--font-*` |

Notes
- CSS Module class names use `Component_local__hash` (set in `vite.config.ts`), matching the pattern in SPEC.md. Vite's own default is `_local_hash_n`.
- Tailwind is loaded without preflight (`src/styles/tailwind.css`) so it does not restyle other sections.
- The hashed `sc-…` and `css-…` class names can change when dependencies are upgraded; tests should match on patterns.
- "Component" is what Tinker reports as the component name: the nearest component written in app code. "via" is the library component the app placed in between.
- `public/plain.html` (http://localhost:5173/plain.html) is a page without React: `[data-testid="plain-note"]`, class `plain-note`, scss-or-plain-css, no component.
- `public/stress.html` (http://localhost:5173/stress.html) is a synthetic 5,000-node page without React: 1,000 `#grid > div` rows of 4 spans; "Remount everything" replaces every node, "Update one text node" changes one in place.
- `TINKER_SRC=1 npm run dev` serves the same app on http://localhost:5175 with the companion's `tinker-src` plugin: elements carry `data-tinker-src="src/components/…tsx:line:column"`, so the inspector shows a line for React 19 too.
- `npm run preview` builds the app and serves the production build on http://localhost:5176: React has no debug info there and component names are minified (`UserCard` appears as `Vf`).
- `__REACT_DEVTOOLS_GLOBAL_HOOK__` is present in dev (installed by the React refresh runtime).

## react18-app — React 18.3, Vite 8, http://localhost:5174

Plain CSS (`src/app.css`). Used for the older source-location path in Phase 1.

| Element | Locator | Component | File | Owner chain |
| --- | --- | --- | --- | --- |
| Profile card | `.profile-card` | `ProfileCard` | `src/components/ProfileCard.tsx` | `App` → `ProfileCard` |
| Avatar | `.avatar` | `Avatar` | `src/components/Avatar.tsx` | `App` → `ProfileCard` → `Avatar` |
| Badge | `.badge` | `Badge` | `src/components/Badge.tsx` | `App` → `ProfileCard` → `Badge` |
