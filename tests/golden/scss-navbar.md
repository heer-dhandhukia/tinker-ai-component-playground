# Tinker change brief

Page: http://localhost:5173/
Elements changed: 2 · Changes: 2

These changes were made live in the browser and need to be applied to the source code.

Instructions:
- Edit the existing source styles at the location given for each element. Do not add override rules, `!important`, or new inline styles to force the result.
- "Before" is the computed value in the browser; the source may express it differently (shorthand, variable, utility class). Change the declaration that produces it.
- If a location cannot be found from the hints, search for the class name or component name, and say so rather than guessing.
- Keep the change scoped to the listed element. If the style is shared by other elements, ask whether to change this instance or all of them.

## 1. Navbar — `<nav>`

- **Component:** `Navbar` (owners: App › Navbar)
- **Source:** `src/components/Navbar.tsx` (line unknown)
- **Element:** `<nav class="navbar">`
- **DOM path:** `#root > nav`
- **Styling:** SCSS / plain CSS
- **Where to edit:**
  - SCSS / plain CSS: the rule for `.navbar`; search the stylesheets for it

| Property | Before | After |
| --- | --- | --- |
| `padding-left` | `24px` | `32px` |

## 2. Navbar — `<a>`

- **Component:** `Navbar` (owners: App › Navbar)
- **Source:** `src/components/Navbar.tsx` (line unknown)
- **Element:** `<a class="navbar__link navbar__link--active">`
- **DOM path:** `#root > nav > ul > li:nth-of-type(1) > a`
- **Styling:** SCSS / plain CSS
- **Where to edit:**
  - SCSS / plain CSS: the rule for `.navbar__link` (in SCSS often nested as `&__link` inside `.navbar`); search the stylesheets for it
  - SCSS / plain CSS: the rule for `.navbar__link--active` (in SCSS often nested as `&--active` under `&__link` inside `.navbar`); search the stylesheets for it

| Property | Before | After |
| --- | --- | --- |
| `font-weight` | `400` | `700` |
