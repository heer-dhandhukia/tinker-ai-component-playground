/** The curated computed-style subset shown in the inspector, grouped as in SPEC.md. */
export const COMPUTED_GROUPS = [
  {
    label: 'Spacing',
    properties: [
      'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    ],
  },
  {
    label: 'Size',
    properties: ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height'],
  },
  {
    label: 'Typography',
    properties: ['font-size', 'font-weight', 'line-height', 'letter-spacing'],
  },
  { label: 'Colour', properties: ['color', 'background-color', 'border-color'] },
  { label: 'Border', properties: ['border-width', 'border-style', 'border-radius'] },
  { label: 'Effects', properties: ['box-shadow', 'opacity'] },
  {
    label: 'Layout',
    properties: [
      'display', 'flex-direction', 'gap', 'align-items', 'justify-content',
      'grid-template-columns',
    ],
  },
] as const;

export const COMPUTED_PROPERTIES: readonly string[] = COMPUTED_GROUPS.flatMap((group) => [
  ...group.properties,
]);
