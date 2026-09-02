import { BackSide, BufferAttribute, BufferGeometry, Group, Mesh, NodeMaterial } from "three/webgpu";
import {
  Discard,
  Fn,
  attribute,
  clamp,
  float,
  hash,
  mix,
  mx_noise_float,
  smoothstep,
  texture,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { Rng } from "../core/rng";
import type { PaintFields } from "../paint/fields";
import { ROW, type AtmosphereUniforms, type PaletteLUT } from "../paint/palette";

/**
 * The horizon band's outer layer: soft rolling hill silhouettes, always
 * present, always painted (ref_c's stacked ground planes, ref_d's mountain
 * shapes). Two rings anchored to the CAMERA (the group follows it on XZ), so
 * wherever the bird runs the composition holds and the world never shows an
 * edge.
 *
 * The displaced ring is BAKED on the CPU: the height profile is a small sum
 * of seeded sine harmonics over azimuth — periodic by construction and
 * analytically differentiable, so the sun-facing flanks are baked as a
 * per-vertex attribute alongside (frac, az). NodeMaterial.positionNode is
 * deliberately not used here: it assigns into positionLocal and was found to
 * be unreliable on plain (non-instanced) meshes on this stack.
 */

interface RingSpec {
  readonly radius: number;
  readonly maxHeight: number;
  readonly skyShift: number; // how far the paint drifts toward the sky
  readonly harmonics: number;
  readonly rngLabel: string;
}

const RINGS: readonly RingSpec[] = [
  { radius: 500, maxHeight: 72, skyShift: 0.38, harmonics: 7, rngLabel: "hills-far" },
  { radius: 445, maxHeight: 40, skyShift: 0.22, harmonics: 10, rngLabel: "hills-near" },
];

const RADIAL_SEGMENTS = 360;
const HEIGHT_SEGMENTS = 10;

interface Profile {
  height(az: number): number; // 0..1
  slope(az: number): number; // dh/daz
}

function buildProfile(rng: Rng, harmonics: number): Profile {
  const amps: number[] = [];
  const phases: number[] = [];
  const freqs: number[] = [];
  let norm = 0;
  for (let k = 0; k < harmonics; k++) {
    const freq = k + 1;
    const amp = rng.range(0.4, 1.0) / Math.pow(freq, 0.9);
    amps.push(amp);
    phases.push(rng.range(0, Math.PI * 2));
    freqs.push(freq);
    norm += amp;
  }
  return {
    height: (az) => {
      let h = 0;
      for (let k = 0; k < amps.length; k++) h += amps[k] * Math.sin(freqs[k] * az + phases[k]);
      return 0.15 + 0.85 * (0.5 + (0.5 * h) / norm);
    },
    slope: (az) => {
      let s = 0;
      for (let k = 0; k < amps.length; k++) s += amps[k] * freqs[k] * Math.cos(freqs[k] * az + phases[k]);
      return (0.5 * 0.85 * s) / norm;
    },
  };
}

function buildRing(
  spec: RingSpec,
  seed: number,
  sunAz: number,
  fields: PaintFields,
  lut: PaletteLUT,
  atm: AtmosphereUniforms,
): Mesh {
  const profile = buildProfile(new Rng(seed).fork(spec.rngLabel), spec.harmonics);

  // Baked wall: rows of vertices from base (frac 0) to crest (frac 1), each
  // column displaced to its azimuth's height. Vertex data: position + a vec3
  // (frac, az, lit) the fragment paints from.
  const cols = RADIAL_SEGMENTS + 1;
  const rows = HEIGHT_SEGMENTS + 1;
  const positions = new Float32Array(cols * rows * 3);
  const info = new Float32Array(cols * rows * 3);
  for (let c = 0; c < cols; c++) {
    const az = (c / RADIAL_SEGMENTS) * Math.PI * 2;
    const h = profile.height(az) * spec.maxHeight;
    const slope = profile.slope(az);
    // The flank facing the sun's azimuth catches the low light.
    const lit = Math.max(0, Math.min(1, -slope * Math.sin(az - sunAz) * 2.2));
    const x = Math.sin(az) * spec.radius;
    const z = Math.cos(az) * spec.radius;
    for (let r = 0; r < rows; r++) {
      const frac = r / HEIGHT_SEGMENTS;
      const i = (r * cols + c) * 3;
      positions[i] = x;
      positions[i + 1] = frac * h;
      positions[i + 2] = z;
      info[i] = frac;
      info[i + 1] = az;
      info[i + 2] = lit;
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < HEIGHT_SEGMENTS; r++) {
    for (let c = 0; c < RADIAL_SEGMENTS; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      indices.push(a, b, d, b, e, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("hillInfo", new BufferAttribute(info, 3));
  geometry.setIndex(indices);

  const material = new NodeMaterial();
  material.side = BackSide;

  const vInfo = varying(attribute<"vec3">("hillInfo", "vec3"));

  material.fragmentNode = Fn(() => {
    const frac = vInfo.x;
    const az = vInfo.y;
    const lit = vInfo.z.mul(atm.sunAmount).mul(smoothstep(0.25, 0.85, frac));

    // Broken crest: the silhouette dissolves stroke-by-stroke at the top.
    const crest = mx_noise_float(vec3(az.mul(140.0), frac.mul(6.0), fields.seedU.add(spec.radius)));
    Discard(frac.add(crest.mul(0.1)).greaterThan(0.985));

    // Paint: hillFar body, hillLit on the facing flanks, value climbing
    // gently toward the crest, broken by a lateral stroke texture.
    const strokeTex = mx_noise_float(vec3(az.mul(260.0), frac.mul(14.0), fields.seedU.add(1.9)));
    const dither = hash(az.mul(913.7).add(frac.mul(311.1))).sub(0.5).mul(0.05);
    const value = clamp(frac.mul(0.3).add(0.16).add(strokeTex.mul(0.13)).add(dither), 0.03, 0.95);
    const farBody = texture(lut.texture, vec2(value, (ROW.hillFar + 0.5) / lut.rows)).rgb;
    const litBody = texture(lut.texture, vec2(value.add(0.2), (ROW.hillLit + 0.5) / lut.rows)).rgb;
    let paint = mix(farBody, litBody, lit.mul(0.75));

    // The hills live inside the sky: shift toward the horizon color, harder
    // near the base so they seat into the haze with a lost edge.
    const seat = smoothstep(0.3, 0.0, frac).mul(0.2);
    paint = mix(paint, atm.skyHorizon, float(spec.skyShift).add(seat));

    return vec4(paint, 1.0);
  })();

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export class HorizonBand {
  readonly group: Group;

  constructor(seed: number, sunAz: number, fields: PaintFields, lut: PaletteLUT, atm: AtmosphereUniforms) {
    this.group = new Group();
    for (const spec of RINGS) this.group.add(buildRing(spec, seed, sunAz, fields, lut, atm));
  }

  /** Follow the camera on XZ — the skyline is always out there. */
  update(camX: number, camZ: number): void {
    this.group.position.set(camX, 0, camZ);
  }
}
