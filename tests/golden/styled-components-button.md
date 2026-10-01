# Tinker change brief

Page: http://localhost:5173/
Elements changed: 1 · Changes: 2

These changes were made live in the browser and need to be applied to the source code.

Instructions:
- Edit the existing source styles at the location given for each element. Do not add override rules, `!important`, or new inline styles to force the result.
- "Before" is the computed value in the browser; the source may express it differently (shorthand, variable, utility class). Change the declaration that produces it.
- If a location cannot be found from the hints, search for the class name or component name, and say so rather than guessing.
- Keep the change scoped to the listed element. If the style is shared by other elements, ask whether to change this instance or all of them.

## 1. PrimaryButton — `<button>`

- **Component:** `PrimaryButton` (rendered through `styled.button`) (owners: App › PrimaryButton)
- **Source:** `src/components/PrimaryButton.tsx` (line unknown)
- **Element:** `<button class="sc-bdvwhi iEhlzc">`
- **DOM path:** `#root > div > section:nth-of-type(3) > button`
- **Styling:** styled-components
- **Where to edit:**
  - styled-components: the `styled.button` template literal that styles this `<button>`, in `src/components/PrimaryButton.tsx`

| Property | Before | After |
| --- | --- | --- |
| `border-radius` | `8px` | `20px` |
| `letter-spacing` | `normal` | `0.5px` |
