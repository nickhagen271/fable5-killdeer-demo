import { Color, DataTexture, FloatType, NearestFilter, NoColorSpace, RGBAFormat } from "three/webgpu";

/**
 * The bounded scene palette and its LUT. Every painted surface color is a
 * texel of this LUT — value-quantized, warm-cool ramped variants of a small
 * deliberate set of hues pulled from the /reference paintings. Free RGB is
 * banned; shaders pick (palette row, value) and sample.
 */

export const GROUND_PALETTE: readonly number[] = [
  0xa0b562, // 0 meadow green
  0xbfc76b, // 1 sun-struck yellow green
  0xcaa757, // 2 warm ochre
  0x74a07c, // 3 cool green
  0x6f9a8b, // 4 blue green
  0x968cb4, // 5 violet grey
  0xc79aa2, // 6 dusty rose
  0xc2543d, // 7 poppy red-orange
  0xe8dfc2, // 8 dry-grass cream
  0xa38a5c, // 9 earth ochre
  // killdeer rows — same bounded discipline, sampled by the bird's markings
  0x8d7458, // 10 warm taupe back/wings
  0x514233, // 11 dark umber (stripes, wing tips, bill)
  0xf2e9d6, // 12 clean cream underparts
  0x2c2620, // 13 band black (warm near-black, never pure)
  0xc06a38, // 14 rust orange rump/tail
  0xc5b3a0, // 15 pale leg
];

/** Named palette rows so markings read as intent, not magic numbers. */
export const ROW = {
  meadow: 0,
  sunGreen: 1,
  ochre: 2,
  coolGreen: 3,
  blueGreen: 4,
  violet: 5,
  rose: 6,
  poppy: 7,
  cream: 8,
  earth: 9,
  birdTaupe: 10,
  birdUmber: 11,
  birdCream: 12,
  birdBlack: 13,
  birdRust: 14,
  birdLeg: 15,
} as const;

/** Discrete value steps — paint mixes in planes of value, not gradients. */
export const VALUE_STEPS = 6;

const LUT_WIDTH = 64;

// Warm-cool temperature logic: shadows are cool, luminous, violet-leaning;
// lights push warm. Never black, never grey.
const SHADOW_MUL: readonly [number, number, number] = [0.58, 0.64, 0.9];
const LIT_MUL: readonly [number, number, number] = [1.22, 1.12, 0.86];
const SHADOW_VIOLET: readonly [number, number, number] = [0.035, 0.02, 0.09];

export interface PaletteLUT {
  readonly texture: DataTexture;
  readonly rows: number;
}

export function buildGroundLUT(): PaletteLUT {
  const rows = GROUND_PALETTE.length;
  const data = new Float32Array(LUT_WIDTH * rows * 4);

  for (let row = 0; row < rows; row++) {
    const base = new Color(GROUND_PALETTE[row]); // hex → linear working space
    for (let x = 0; x < LUT_WIDTH; x++) {
      const t = x / (LUT_WIDTH - 1);
      const q = Math.min(Math.floor(t * VALUE_STEPS), VALUE_STEPS - 1) / (VALUE_STEPS - 1);

      const r = base.r * (SHADOW_MUL[0] + (LIT_MUL[0] - SHADOW_MUL[0]) * q) + SHADOW_VIOLET[0] * (1 - q);
      const g = base.g * (SHADOW_MUL[1] + (LIT_MUL[1] - SHADOW_MUL[1]) * q) + SHADOW_VIOLET[1] * (1 - q);
      const b = base.b * (SHADOW_MUL[2] + (LIT_MUL[2] - SHADOW_MUL[2]) * q) + SHADOW_VIOLET[2] * (1 - q);

      const i = (row * LUT_WIDTH + x) * 4;
      data[i] = Math.min(r, 1);
      data[i + 1] = Math.min(g, 1);
      data[i + 2] = Math.min(b, 1);
      data[i + 3] = 1;
    }
  }

  const texture = new DataTexture(data, LUT_WIDTH, rows, RGBAFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return { texture, rows };
}
