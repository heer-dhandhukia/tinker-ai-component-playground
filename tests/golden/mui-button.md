# Tinker change brief

Page: http://localhost:5173/
Elements changed: 1 · Changes: 2

These changes were made live in the browser and need to be applied to the source code.

Instructions:
- Edit the existing source styles at the location given for each element. Do not add override rules, `!important`, or new inline styles to force the result.
- "Before" is the computed value in the browser; the source may express it differently (shorthand, variable, utility class). Change the declaration that produces it.
- If a location cannot be found from the hints, search for the class name or component name, and say so rather than guessing.
- Keep the change scoped to the listed element. If the style is shared by other elements, ask whether to change this instance or all of them.

## 1. SettingsDialog — `<button>`

- **Component:** `SettingsDialog` (rendered through `Button`) (owners: App › SettingsDialog)
- **Source:** `src/components/SettingsDialog.tsx` (line unknown)
- **Element:** `<button class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-sizeMedium MuiButton-colorPrimary css-2rwryq-MuiButtonBase-root-MuiButton-root">`
- **DOM path:** `#root > div > section:nth-of-type(5) > button`
- **Styling:** MUI
- **Where to edit:**
  - MUI: the `sx` prop on `<Button>` in `src/components/SettingsDialog.tsx`; if every Button should change, a theme `styleOverrides` entry or `styled()` wrapper targeting `.MuiButton-root`

| Property | Before | After |
| --- | --- | --- |
| `border-radius` | `4px` | `12px` |
| `font-weight` | `500` | `700` |
