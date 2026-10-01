import { z } from 'zod';

export const TOKEN_CATEGORIES = ['colour', 'spacing', 'radius', 'shadow', 'font', 'other'] as const;
export type TokenCategory = (typeof TOKEN_CATEGORIES)[number];

export const designTokenSchema = z.object({
  name: z.string().regex(/^--[\w-]{1,100}$/),
  value: z.string().max(500),
  category: z.enum(TOKEN_CATEGORIES),
});
export type DesignToken = z.infer<typeof designTokenSchema>;

export interface TokenSuggestion {
  name: string;
  value: string;
  /** The typed value equals the token's value. */
  exact: boolean;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const ROOT_FONT_SIZE_PX = 16;

/** A single px/rem length in px, or null for anything else. */
export function parseLengthPx(value: string): number | null {
  const match = /^(-?\d*\.?\d+)(px|rem)?$/.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (match[2] === undefined) return amount === 0 ? 0 : null;
  return match[2] === 'rem' ? amount * ROOT_FONT_SIZE_PX : amount;
}

/** Hex and rgb()/rgba() colours. Named colours and other colour spaces are not parsed. */
export function parseColour(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const channel = (index: number) => parseInt(full.slice(index, index + 2), 16);
    return { r: channel(0), g: channel(2), b: channel(4), a: full.length === 8 ? Math.round((channel(6) / 255) * 100) / 100 : 1 };
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(text);
  if (rgb) {
    const alpha = rgb[4];
    const a = alpha === undefined ? 1 : alpha.endsWith('%') ? Number(alpha.slice(0, -1)) / 100 : Number(alpha);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a };
  }
  return null;
}

/** Groups a custom property by what it is for, from its value first and its name second. */
export function classifyToken(name: string, value: string): TokenCategory {
  const lower = name.toLowerCase();
  if (parseColour(value)) return 'colour';
  if (/shadow|elevation/.test(lower)) return 'shadow';
  if (/radius|rounded/.test(lower)) return 'radius';
  if (/font|leading|tracking|line-height|letter/.test(lower)) return 'font';
  if (/space|spacing|gap|pad|margin|inset|(^|-)size/.test(lower) && parseLengthPx(value) !== null) return 'spacing';
  return 'other';
}

const COLOUR_PROPERTIES = new Set(['color', 'background-color', 'border-color']);

function categoryFor(property: string): TokenCategory | null {
  if (/^(padding|margin)-/.test(property) || property === 'gap') return 'spacing';
  if (property === 'border-radius') return 'radius';
  if (property === 'box-shadow') return 'shadow';
  if (property === 'font-size') return 'font';
  if (COLOUR_PROPERTIES.has(property)) return 'colour';
  return null;
}

const LENGTH_TOLERANCE_PX = 2;
const LENGTH_TOLERANCE_RATIO = 0.15;
const COLOUR_TOLERANCE = 30; // Euclidean distance in RGB (max is ~441)
const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

/**
 * The nearest design token for a typed value, or null if none is close. Deterministic:
 * the smallest distance wins, ties go to the smaller value, then to the name.
 */
export function suggestToken(property: string, value: string, tokens: readonly DesignToken[]): TokenSuggestion | null {
  const category = categoryFor(property);
  if (!category || value.includes('var(')) return null;
  const pool = tokens.filter((token) => token.category === category);

  if (category === 'shadow') {
    const match = pool.find((token) => collapse(token.value) === collapse(value));
    return match ? { name: match.name, value: match.value, exact: true } : null;
  }

  let scored: { token: DesignToken; distance: number; order: number }[];
  if (category === 'colour') {
    const typed = parseColour(value);
    if (!typed) return null;
    scored = pool.flatMap((token) => {
      const colour = parseColour(token.value);
      if (!colour || Math.abs(colour.a - typed.a) > 0.05) return [];
      const distance = Math.hypot(colour.r - typed.r, colour.g - typed.g, colour.b - typed.b);
      return distance <= COLOUR_TOLERANCE ? [{ token, distance, order: 0 }] : [];
    });
  } else {
    const typed = parseLengthPx(value);
    if (typed === null) return null;
    const tolerance = Math.max(LENGTH_TOLERANCE_PX, Math.abs(typed) * LENGTH_TOLERANCE_RATIO);
    scored = pool.flatMap((token) => {
      const px = parseLengthPx(token.value);
      if (px === null) return [];
      const distance = Math.abs(px - typed);
      return distance <= tolerance ? [{ token, distance, order: px }] : [];
    });
  }

  scored.sort((a, b) => a.distance - b.distance || a.order - b.order || a.token.name.localeCompare(b.token.name));
  const best = scored[0];
  return best ? { name: best.token.name, value: best.token.value, exact: best.distance === 0 } : null;
}
