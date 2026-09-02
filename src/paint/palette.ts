import {
  Color,
  DataTexture,
  FloatType,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  Vector3,
} from "three/webgpu";
import { uniform } from "three/tsl";
import type UniformNode from "three/src/nodes/core/UniformNode.js";
import { SUN_DIR } from "./fields";

/**
 * The two color scripts of v2 (`P` toggles): `sunset` from the ref_d
 * description (lavender-to-peach sky, sun as a soft glow disc, yellow-lit
 * grass, big pink/violet/orange/white/yellow dabs) and `overcast` from
 * ref_a/ref_b (cool blue-green grass, poppy red / cornflower / daisy /
 * buttercup dabs, no sun disc).
 *
 * One LUT texture is shared by every material; toggling REWRITES the texel
 * data in place and updates the atmosphere uniforms, so no material rebuilds
 * and no scatter re-places. Every row is a (shadow → lit) pigment ramp
 * quantized into value planes; shadows shift toward the sky tint — never
 * gray, never black. The hex anchors below come from the spec; where the
 * references (their written descriptions) and the hexes disagree, the ramps
 * lean toward the references.
 */

export type PaletteName = "sunset" | "overcast";

/** Semantic palette rows, stable across both palettes. */
export const ROW = {
  grass: 0, // the meadow's base note
  grassWarm: 1, // sun-struck / dry drift variant
  grassCool: 2, // cool blue-green shadow variant (ref_a)
  soil: 3, // bare earth patches, worn tracks
  hedgerow: 4, // the dark treeline band
  hillFar: 5, // far hill silhouettes, already sky-shifted
  hillLit: 6, // lit hill flank (sunset)
  flowerA: 7, // sunset pink / overcast poppy red
  flowerB: 8, // sunset violet / overcast cornflower blue
  flowerC: 9, // sunset orange / overcast deep poppy
  flowerD: 10, // white (daisy)
  flowerE: 11, // yellow (buttercup)
  cloud: 12, // cloud dab body — also the worm counter's cream
  birdTaupe: 13,
  birdUmber: 14,
  birdCream: 15,
  birdBlack: 16,
  birdRust: 17,
  birdLeg: 18,
  worm: 19,
} as const;

interface RowRamp {
  readonly shadow: number;
  readonly lit: number;
}

interface Atmosphere {
  readonly skyTop: number;
  readonly skyMid: number;
  readonly skyHorizon: number;
  readonly sunGlow: number;
  readonly sunAmount: number; // glow-disc strength (0 in overcast)
  readonly cloudLit: number;
  readonly cloudShade: number;
  readonly cloudCover: number; // threshold shift: higher = more cloud
  readonly haze: number; // what the far distance dissolves into
  readonly farField: number; // the cool band before the haze
  readonly gradeMul: readonly [number, number, number];
  readonly gradeAdd: readonly [number, number, number];
  readonly sun: Vector3;
}

interface PaletteDef {
  readonly rows: readonly RowRamp[];
  readonly atmosphere: Atmosphere;
}

const SUNSET: PaletteDef = {
  rows: [
    { shadow: 0x5c682e, lit: 0xd2c64c }, // grass  #7A8A30 → #B8B840
    { shadow: 0x7c7630, lit: 0xecda6a }, // grassWarm — yellow-lit drift
    { shadow: 0x3c5a4a, lit: 0x8ca06c }, // grassCool
    { shadow: 0x4c3a28, lit: 0xa47a50 }, // soil
    { shadow: 0x2e2c20, lit: 0x5a5436 }, // hedgerow #3E3A2A
    { shadow: 0xa98ca6, lit: 0xdcbac4 }, // hillFar #C9A7B8
    { shadow: 0xb87c58, lit: 0xf2b282 }, // hillLit #E8A070
    { shadow: 0xb06090, lit: 0xf8b0d8 }, // flowerA pink #E890C0
    { shadow: 0x50388a, lit: 0xa382e2 }, // flowerB violet #8060C0
    { shadow: 0xb25820, lit: 0xff9848 }, // flowerC orange #F08030
    { shadow: 0xc2b29a, lit: 0xfff8e8 }, // flowerD white #FBF4E8
    { shadow: 0xba9a28, lit: 0xffe060 }, // flowerE yellow #F0D040
    { shadow: 0xc2a898, lit: 0xfbe9c8 }, // cloud — cream undersides
    { shadow: 0x6a5540, lit: 0xa8906c }, // birdTaupe
    { shadow: 0x3a2f22, lit: 0x615040 }, // birdUmber
    { shadow: 0xc0b098, lit: 0xfaf0da }, // birdCream
    { shadow: 0x201c16, lit: 0x38322a }, // birdBlack
    { shadow: 0x8a4a20, lit: 0xd87838 }, // birdRust
    { shadow: 0x968478, lit: 0xd0beb0 }, // birdLeg
    { shadow: 0x6a4038, lit: 0xb07868 }, // worm pink-brown
  ],
  atmosphere: {
    skyTop: 0xb8a8d8, // lavender #B8A8D8
    skyMid: 0xd8b4c4,
    skyHorizon: 0xf2c4a0, // peach #F2C4A0
    sunGlow: 0xfbe9c8, // cream #FBE9C8
    sunAmount: 1.0,
    cloudLit: 0xfbe9c8,
    cloudShade: 0xc2a2ba,
    cloudCover: 0.0,
    haze: 0xe2c2b0,
    farField: 0xc0a2b0,
    gradeMul: [1.055, 1.0, 0.945],
    gradeAdd: [0.014, 0.008, 0.002],
    sun: new Vector3(-0.55, 0.3, -0.42).normalize(),
  },
};

const OVERCAST: PaletteDef = {
  rows: [
    { shadow: 0x42603a, lit: 0x8aa868 }, // grass  #5A7A48 → #7A9A58
    { shadow: 0x5c6e3c, lit: 0xa8b070 }, // grassWarm
    { shadow: 0x365448, lit: 0x7c9c82 }, // grassCool
    { shadow: 0x463c2e, lit: 0x8a7454 }, // soil
    { shadow: 0x2a3024, lit: 0x4a5638 }, // hedgerow
    { shadow: 0x76809c, lit: 0xa8b0c4 }, // hillFar
    { shadow: 0x808aa0, lit: 0xb4bcc8 }, // hillLit — barely lit
    { shadow: 0xa02818, lit: 0xf05030 }, // flowerA poppy #D83820
    { shadow: 0x3c58a8, lit: 0x789ae8 }, // flowerB cornflower #5878D0
    { shadow: 0x922c1c, lit: 0xd84828 }, // flowerC deep poppy
    { shadow: 0xb8b8ac, lit: 0xfcfaf0 }, // flowerD daisy white
    { shadow: 0xb09830, lit: 0xf8d858 }, // flowerE buttercup
    { shadow: 0xacaeb4, lit: 0xe8e4d8 }, // cloud
    { shadow: 0x655442, lit: 0x9a8868 }, // birdTaupe
    { shadow: 0x362d22, lit: 0x584a3c }, // birdUmber
    { shadow: 0xb2aa9c, lit: 0xf2ecdc }, // birdCream
    { shadow: 0x1e1c18, lit: 0x343028 }, // birdBlack
    { shadow: 0x7e4620, lit: 0xc86e36 }, // birdRust
    { shadow: 0x8e8078, lit: 0xc4b6ac }, // birdLeg
    { shadow: 0x604038, lit: 0xa07064 }, // worm
  ],
  atmosphere: {
    skyTop: 0x9fa8c8, // #9FA8C8
    skyMid: 0xbcc0c8,
    skyHorizon: 0xd8d2c8, // #D8D2C8
    sunGlow: 0xe8e2d0,
    sunAmount: 0.0,
    cloudLit: 0xe4e0d2,
    cloudShade: 0x9aa2b8,
    cloudCover: 0.09,
    haze: 0xc8cac2,
    farField: 0xa3aebc,
    gradeMul: [0.995, 1.0, 1.02],
    gradeAdd: [0.008, 0.009, 0.012],
    sun: new Vector3(-0.4, 0.55, -0.35).normalize(),
  },
};

const DEFS: Record<PaletteName, PaletteDef> = { sunset: SUNSET, overcast: OVERCAST };

/** Discrete value steps — paint mixes in planes of value, not gradients. */
export const VALUE_STEPS = 6;
const LUT_WIDTH = 64;

export interface PaletteLUT {
  readonly texture: DataTexture;
  readonly rows: number;
}

type ColorUniform = UniformNode<"color", Color>;
type FloatUniform = UniformNode<"float", number>;
type Vec3Uniform = UniformNode<"vec3", Vector3>;

export interface AtmosphereUniforms {
  readonly skyTop: ColorUniform;
  readonly skyMid: ColorUniform;
  readonly skyHorizon: ColorUniform;
  readonly sunGlow: ColorUniform;
  readonly sunAmount: FloatUniform;
  readonly cloudLit: ColorUniform;
  readonly cloudShade: ColorUniform;
  readonly cloudCover: FloatUniform;
  readonly haze: ColorUniform;
  readonly farField: ColorUniform;
  readonly gradeMul: Vec3Uniform;
  readonly gradeAdd: Vec3Uniform;
}

export class PaletteState implements PaletteLUT {
  readonly texture: DataTexture;
  readonly rows: number;
  readonly atm: AtmosphereUniforms;
  name: PaletteName;

  private readonly data: Float32Array;

  constructor(initial: PaletteName) {
    this.rows = DEFS.sunset.rows.length;
    this.data = new Float32Array(LUT_WIDTH * this.rows * 4);
    this.texture = new DataTexture(this.data, LUT_WIDTH, this.rows, RGBAFormat, FloatType);
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.colorSpace = NoColorSpace;
    this.atm = {
      skyTop: uniform(new Color()),
      skyMid: uniform(new Color()),
      skyHorizon: uniform(new Color()),
      sunGlow: uniform(new Color()),
      sunAmount: uniform(0),
      cloudLit: uniform(new Color()),
      cloudShade: uniform(new Color()),
      cloudCover: uniform(0),
      haze: uniform(new Color()),
      farField: uniform(new Color()),
      gradeMul: uniform(new Vector3(1, 1, 1)),
      gradeAdd: uniform(new Vector3(0, 0, 0)),
    };
    this.name = initial;
    this.apply(initial);
  }

  /** Switch color scripts in place: rewrite the LUT, retune the atmosphere. */
  apply(name: PaletteName): void {
    const def = DEFS[name];
    this.name = name;

    const shadow = new Color();
    const lit = new Color();
    def.rows.forEach((ramp, row) => {
      shadow.setHex(ramp.shadow); // sRGB hex → linear working space
      lit.setHex(ramp.lit);
      for (let x = 0; x < LUT_WIDTH; x++) {
        const t = x / (LUT_WIDTH - 1);
        const q = Math.min(Math.floor(t * VALUE_STEPS), VALUE_STEPS - 1) / (VALUE_STEPS - 1);
        const i = (row * LUT_WIDTH + x) * 4;
        this.data[i] = shadow.r + (lit.r - shadow.r) * q;
        this.data[i + 1] = shadow.g + (lit.g - shadow.g) * q;
        this.data[i + 2] = shadow.b + (lit.b - shadow.b) * q;
        this.data[i + 3] = 1;
      }
    });
    this.texture.needsUpdate = true;

    const a = def.atmosphere;
    this.atm.skyTop.value.setHex(a.skyTop);
    this.atm.skyMid.value.setHex(a.skyMid);
    this.atm.skyHorizon.value.setHex(a.skyHorizon);
    this.atm.sunGlow.value.setHex(a.sunGlow);
    this.atm.sunAmount.value = a.sunAmount;
    this.atm.cloudLit.value.setHex(a.cloudLit);
    this.atm.cloudShade.value.setHex(a.cloudShade);
    this.atm.cloudCover.value = a.cloudCover;
    this.atm.haze.value.setHex(a.haze);
    this.atm.farField.value.setHex(a.farField);
    this.atm.gradeMul.value.set(...a.gradeMul);
    this.atm.gradeAdd.value.set(...a.gradeAdd);

    // The sun is shared by every shader through the SUN uniform (fields.ts):
    // mutate the vector in place and everything follows next frame.
    SUN_DIR.copy(a.sun);
  }

  toggle(): PaletteName {
    this.apply(this.name === "sunset" ? "overcast" : "sunset");
    return this.name;
  }
}
