# Tinker change brief

Page: http://localhost:5173/
Elements changed: 1 · Changes: 2

These changes were made live in the browser and need to be applied to the source code.

Instructions:
- Edit the existing source styles at the location given for each element. Do not add override rules, `!important`, or new inline styles to force the result.
- "Before" is the computed value in the browser; the source may express it differently (shorthand, variable, utility class). Change the declaration that produces it.
- If a location cannot be found from the hints, search for the class name or component name, and say so rather than guessing.
- Keep the change scoped to the listed element. If the style is shared by other elements, ask whether to change this instance or all of them.

## 1. Hero — `<div>`

- **Component:** `Hero` (owners: App › Hero)
- **Source:** `src/components/Hero.tsx` (line unknown)
- **Element:** `<div class="rounded-xl bg-indigo-600 px-8 py-10 text-white shadow-lg">`
- **DOM path:** `#root > div > section:nth-of-type(1) > div`
- **Styling:** Tailwind (95% confidence)
- **Where to edit:**
  - Tailwind: the `className` on this `<div>` in `src/components/Hero.tsx`; replace the matching utilities (exact values as arbitrary utilities: `pt-[48px]`, `rounded-[24px]`; prefer the theme's named utilities where one matches)

| Property | Before | After |
| --- | --- | --- |
| `padding-top` | `40px` | `48px` |
| `border-radius` | `12px` | `24px` |
