# Tinker change brief

Page: http://localhost:5173/
Elements changed: 1 · Changes: 2

These changes were made live in the browser and need to be applied to the source code.

Instructions:
- Edit the existing source styles at the location given for each element. Do not add override rules, `!important`, or new inline styles to force the result.
- "Before" is the computed value in the browser; the source may express it differently (shorthand, variable, utility class). Change the declaration that produces it.
- If a location cannot be found from the hints, search for the class name or component name, and say so rather than guessing.
- Keep the change scoped to the listed element. If the style is shared by other elements, ask whether to change this instance or all of them.

## 1. UserCard — `<article>`

- **Component:** `UserCard` (owners: App › UserCard)
- **Source:** `src/components/UserCard.tsx` (line unknown)
- **Element:** `<article class="UserCard_card__7Yz-v">`
- **DOM path:** `#root > div > section:nth-of-type(2) > article`
- **Styling:** CSS Modules
- **Where to edit:**
  - CSS Modules: class `UserCard_card__7Yz-v` → `UserCard.module.css` → `.card`

| Property | Before | After |
| --- | --- | --- |
| `padding-top` | `16px` | `var(--space-3)` |
| `border-radius` | `8px` | `16px` |

- **Design tokens used:** `var(--space-3)` — keep these as `var(...)` references, do not inline their values
