/**
 * viz-palette.ts
 * Deterministic color palette generator for visualization.
 *
 * Generates unique HSL-based colors for node kinds, widget subtypes, and edge
 * kinds. Hash-based hue assignment ensures stability across runs. Collision
 * avoidance ensures no two simultaneously-present legend entries share a hex color.
 *
 * Pure function — no I/O, no side effects. Deterministic for identical inputs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Palette {
  /** Color for each top-level node kind (Module, Route, Component, Widget, Service, External). */
  nodeKindColors: Record<string, string>;
  /** Color for each widget subtype key (e.g., "button", "input", "a"). */
  widgetSubtypeColors: Record<string, string>;
  /** Color for each edge kind. */
  edgeKindColors: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Hash + color utilities
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash. Deterministic for any string. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Convert HSL (h ∈ [0,360), s,l ∈ [0,100]) to hex color string. */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return lN - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const toHex = (x: number): string => {
    const v = Math.round(x * 255);
    return v.toString(16).padStart(2, '0');
  };
  return '#' + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

/** Minimum hue distance (circular) between two hues in [0,360). */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

// ---------------------------------------------------------------------------
// Palette builder
// ---------------------------------------------------------------------------

/**
 * Allocate a unique hex color from a hue, with collision avoidance at both the
 * hue level (minimum angular distance) and the hex level (no duplicate hex strings).
 */
function allocateColor(
  key: string,
  s: number,
  l: number,
  usedHues: number[],
  usedHexes: Set<string>,
): string {
  const MIN_HUE_DIST = 22;
  const HUE_STEP = 13; // prime step for collision resolution

  let hue = fnv1a(key) % 360;
  let attempts = 0;

  // Phase 1: find a hue with sufficient angular distance
  while (attempts < 360 && usedHues.some((h) => hueDist(h, hue) < MIN_HUE_DIST)) {
    hue = (hue + HUE_STEP) % 360;
    attempts++;
  }

  // Phase 2: resolve hex-level collisions (hue rounding can produce identical hex)
  let hex = hslToHex(hue, s, l);
  let hexAttempts = 0;
  while (usedHexes.has(hex) && hexAttempts < 360) {
    hue = (hue + HUE_STEP) % 360;
    hex = hslToHex(hue, s, l);
    hexAttempts++;
  }

  usedHues.push(hue);
  usedHexes.add(hex);
  return hex;
}

/**
 * Build a deterministic, collision-free color palette for all legend entries
 * actually present in the current visualization data.
 *
 * Allocation order: node kinds → widget subtypes → edge kinds.
 * Within each group, entries are processed in sorted order for determinism.
 */
export function buildPalette(
  nodeKinds: string[],
  widgetSubtypes: string[],
  edgeKinds: string[],
): Palette {
  const usedHues: number[] = [];
  const usedHexes = new Set<string>();

  // Node kinds: bright, high-saturation (S=70, L=60)
  const nodeKindColors: Record<string, string> = {};
  for (const kind of [...nodeKinds].sort()) {
    nodeKindColors[kind] = allocateColor('NK:' + kind, 70, 60, usedHues, usedHexes);
  }

  // Widget subtypes: slightly deeper (S=75, L=52)
  const widgetSubtypeColors: Record<string, string> = {};
  for (const sub of [...widgetSubtypes].sort()) {
    widgetSubtypeColors[sub] = allocateColor('WS:' + sub, 75, 52, usedHues, usedHexes);
  }

  // Edge kinds: medium saturation (S=65, L=55)
  const edgeKindColors: Record<string, string> = {};
  for (const kind of [...edgeKinds].sort()) {
    edgeKindColors[kind] = allocateColor('EK:' + kind, 65, 55, usedHues, usedHexes);
  }

  return { nodeKindColors, widgetSubtypeColors, edgeKindColors };
}
