# Tinker change brief

Page: http://localhost:5173/
Elements changed: 1 · Changes: 2

These changes were made live in the browser and need to be applied to the source code.

Instructions:
- Edit the existing source styles at the location given for each element. Do not add override rules, `!important`, or new inline styles to force the result.
- "Before" is the computed value in the browser; the source may express it differently (shorthand, variable, utility class). Change the declaration that produces it.
- If a location cannot be found from the hints, search for the class name or component name, and say so rather than guessing.
- Keep the change scoped to the listed element. If the style is shared by other elements, ask whether to change this instance or all of them.

## 1. PromoBanner — `<aside>`

- **Component:** `PromoBanner` (owners: App › PromoBanner)
- **Source:** `src/components/PromoBanner.tsx` (line unknown)
- **Element:** `<aside>`
- **DOM path:** `#root > div > section:nth-of-type(4) > aside`
- **Styling:** Inline style
- **Where to edit:**
  - Inline style: the `style` prop on this `<aside>` in `src/components/PromoBanner.tsx`

| Property | Before | After |
| --- | --- | --- |
| `padding-top` | `12px` | `20px` |

- **Text:** change "Launch week: every plan is 20% off." to "Launch month: every plan is 20% off." (in the component's JSX or the data it renders)
