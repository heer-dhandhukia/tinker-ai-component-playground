import { describe, expect, it } from 'vitest';
import {
  buildAiRequest,
  cropRegion,
  estimateCost,
  prepareHtml,
  toVariants,
  validateAiVariants,
  type AiContext,
  type AiVariant,
} from '../../src/shared/ai';

const context: AiContext = {
  target: { tinkerId: 'btn00001', cssPath: 'section > button', componentPath: ['App', 'SettingsDialog'] },
  tag: 'button',
  classes: ['MuiButton-root'],
  html: '<button class="MuiButton-root">Open settings</button>',
  componentName: 'SettingsDialog',
  via: 'Button',
  props: '{"variant":"contained"}',
  computed: { 'padding-top': '6px', color: 'rgb(255, 255, 255)' },
  parent: { tag: 'section', computed: { display: 'block', gap: 'normal' } },
  tokens: [
    { name: '--space-3', value: '12px', category: 'spacing' },
    { name: '--color-primary', value: '#4f46e5', category: 'colour' },
  ],
  rect: { x: 10, y: 20, width: 100, height: 40 },
  devicePixelRatio: 2,
};

describe('prepareHtml', () => {
  it('removes Tinker attributes and caps the length', () => {
    expect(prepareHtml('<p data-tinker-id="ab12" data-tinker-probe="x-1" class="a">hi</p>', 4000)).toBe('<p class="a">hi</p>');
    const long = prepareHtml(`<div>${'x'.repeat(5000)}</div>`, 4000);
    expect(long.length).toBeLessThanOrEqual(4000 + '\n<!-- truncated -->'.length);
    expect(long.endsWith('<!-- truncated -->')).toBe(true);
  });
});

describe('buildAiRequest', () => {
  const request = buildAiRequest(context, 'Make it feel premium', 3);

  it('fills the system prompt with the count and the property allowlist', () => {
    expect(request.system).toContain('Return exactly 3 variants');
    expect(request.system).toContain('padding-top');
    expect(request.system).not.toMatch(/\{\{.*\}\}/);
    expect(buildAiRequest(context, 'x', 1).system).toContain('Return exactly 1 variant as JSON');
  });

  it('puts only the selected element in the user message', () => {
    expect(request.user).toContain('Make it feel premium');
    expect(request.user).toContain('Selected element: <button> rendered by SettingsDialog (via Button), props {"variant":"contained"}');
    expect(request.user).toContain('padding-top: 6px');
    expect(request.user).toContain('--space-3: 12px');
    expect(request.user).toContain('<button class="MuiButton-root">Open settings</button>');
    expect(request.user).not.toMatch(/\{\{.*\}\}/);
  });

  it('handles elements without React info, parent or tokens', () => {
    const bare = buildAiRequest({ ...context, componentName: undefined, via: undefined, props: undefined, parent: null, tokens: [] }, 'x', 1);
    expect(bare.user).toContain('Selected element: <button>\n');
    expect(bare.user).toContain('(none found)');
    expect(bare.user).not.toMatch(/\{\{.*\}\}|undefined/);
  });

  it('spells out the JSON shape for providers that cannot enforce a schema', () => {
    expect(request.system).not.toContain('Output format:');
    const compatible = buildAiRequest(context, 'x', 3, 'openai-compatible');
    expect(compatible.system).toContain('Output format: respond with one JSON object');
    expect(compatible.system).toContain('"variants":[{"name"');
    expect(compatible.user).toBe(buildAiRequest(context, 'x', 3).user);
  });

  it('asks for exactly the requested number of variants in the schema-facing count', () => {
    expect(request.count).toBe(3);
  });
});

describe('validateAiVariants', () => {
  const supports = (property: string, value: string) => !(value === 'banana' || (property === 'opacity' && value === 'red'));
  const variant = (changes: AiVariant['changes'], name = 'Bold'): AiVariant => ({ name, rationale: 'r', changes });

  it('keeps valid changes', () => {
    const { variants, dropped } = validateAiVariants([variant([{ property: 'padding-top', after: 'var(--space-3)' }])], supports);
    expect(variants[0]?.changes).toEqual([{ property: 'padding-top', after: 'var(--space-3)' }]);
    expect(dropped).toEqual([]);
  });

  it('drops disallowed properties, invalid values and unsafe values, and reports each', () => {
    const { variants, dropped } = validateAiVariants(
      [variant([
        { property: 'position', after: 'fixed' },
        { property: 'color', after: 'banana' },
        { property: 'background-color', after: 'red; } body { display: none' },
        { property: 'background-color', after: 'url(https://evil.example/x.png)' },
        { property: 'gap', after: '8px' },
      ])],
      supports,
    );
    expect(variants[0]?.changes).toEqual([{ property: 'gap', after: '8px' }]);
    expect(dropped.map((d) => `${d.property}: ${d.reason}`)).toEqual([
      'position: property is not editable',
      'color: not a valid value for color',
      'background-color: unsafe value',
      'background-color: unsafe value',
    ]);
    expect(dropped[0]?.variant).toBe('Bold');
  });

  it('keeps the last value when a property is repeated', () => {
    const { variants } = validateAiVariants([variant([{ property: 'gap', after: '4px' }, { property: 'gap', after: '8px' }])], supports);
    expect(variants[0]?.changes).toEqual([{ property: 'gap', after: '8px' }]);
  });

  it('keeps a variant even if all of its changes were dropped', () => {
    const { variants } = validateAiVariants([variant([{ property: 'float', after: 'left' }], 'Odd')], supports);
    expect(variants).toEqual([{ name: 'Odd', rationale: 'r', changes: [] }]);
  });
});

describe('toVariants', () => {
  it('turns model output into Variants bound to the selected element', () => {
    const [variant] = toVariants(
      [{ name: 'Soft', rationale: 'Rounder and lighter.', changes: [{ property: 'padding-top', after: 'var(--space-3)' }, { property: 'color', after: 'red' }] }],
      context,
      () => 'id-1',
    );
    expect(variant).toEqual({
      id: 'id-1',
      name: 'Soft',
      rationale: 'Rounder and lighter.',
      changes: [
        { target: context.target, kind: 'style', property: 'padding-top', before: '6px', after: 'var(--space-3)', token: 'var(--space-3)', origin: 'ai' },
        { target: context.target, kind: 'style', property: 'color', before: 'rgb(255, 255, 255)', after: 'red', origin: 'ai' },
      ],
    });
  });
});

describe('estimateCost', () => {
  it('prices known models per million tokens', () => {
    expect(estimateCost('claude-sonnet-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(12);
    expect(estimateCost('claude-opus-5-5', { inputTokens: 2000, outputTokens: 500 })).toBeCloseTo(0.018);
    expect(estimateCost('claude-haiku-4-5', { inputTokens: 1000, outputTokens: 1000 })).toBeCloseTo(0.006);
  });
  it('returns null for models it has no price for', () => {
    expect(estimateCost('some-future-model', { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
});

describe('cropRegion', () => {
  it('scales the element rect by the device pixel ratio', () => {
    expect(cropRegion({ x: 10, y: 20, width: 100, height: 40 }, 2, 2560, 1440)).toEqual({ sx: 20, sy: 40, sw: 200, sh: 80, scale: 1 });
  });
  it('clamps to the visible image', () => {
    expect(cropRegion({ x: -10, y: 700, width: 100, height: 100 }, 1, 1280, 720)).toEqual({ sx: 0, sy: 700, sw: 90, sh: 20, scale: 1 });
  });
  it('returns null when the element is off-screen', () => {
    expect(cropRegion({ x: 0, y: 900, width: 100, height: 40 }, 1, 1280, 720)).toBeNull();
    expect(cropRegion({ x: 0, y: 0, width: 0, height: 40 }, 1, 1280, 720)).toBeNull();
  });
  it('downscales very large crops', () => {
    expect(cropRegion({ x: 0, y: 0, width: 1600, height: 800 }, 2, 3200, 1600)?.scale).toBeCloseTo(0.49);
  });
});
