# Tinker companion

Applies a JSON changeset exported from the Tinker extension to your source code. It shows a diff
for every proposed edit and writes only what you approve.

## 1. Add the source plugin (recommended)

React 19 no longer tells tools which line an element was written on. This dev-only Vite plugin
stamps each JSX element with `data-tinker-src="file:line:column"`:

```ts
// vite.config.ts
import tinkerSrc from 'tinker-companion/vite-plugin';

export default defineConfig({ plugins: [tinkerSrc(), react()] });
```

Without it, edits that need an exact position (MUI `sx`, Tailwind `className`, inline `style`)
are proposed only when exactly one element in the file can match.

## 2. Review and apply

```bash
node companion/src/cli.js --root path/to/your/project
```

Open the printed link, paste the changeset (Export → JSON changeset in the extension), read the
diffs, choose where each change goes, and press "Apply approved changes".

To see the proposals in the terminal without any way to write:

```bash
node companion/src/cli.js plan changeset.json --root path/to/your/project
```

## What it edits

| Styling system | Edit |
| --- | --- |
| CSS Modules, SCSS, plain CSS | the one rule whose selector is exactly the element's class (PostCSS) |
| styled-components, Emotion `styled` | the declarations in the styled template (Babel + PostCSS) |
| MUI | the `sx` prop on the component |
| Tailwind | the utilities in a static `className` |
| Inline | the `style` object |

A stylesheet rule is shared by every element that uses the class. When the element's position is
known, "Only this element" (an inline `style` prop) is offered as the alternative.

## What it will not do

- Guess. If zero or several places match, the option is shown as not available, with the reason.
- Edit rules shared with other selectors, rules inside `@media`, non-literal `className`/`style`/`sx`
  values, Emotion's `css` prop, or text content.
- Write outside the project root, into `node_modules`, or to a file that changed after the diff was made.
- Accept requests from other websites: it listens on 127.0.0.1 and every call needs the session token.
