import { BackSide, CylinderGeometry, Group, Mesh, NodeMaterial } from "three/webgpu";
import {
  Discard,
  Fn,
  cameraPosition,
  clamp,
  cos,
  float,
  hash,
  mix,
  mx_noise_float,
  positionLocal,
  sin,
  smoothstep,
  texture,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type Node from "three/src/nodes/core/Node.js";
import { SUN, type PaintFields } from "../paint/fields";
import { ROW, type AtmosphereUniforms, type PaletteLUT } from "../paint/palette";

type F = Node<"float">;

/**
 * The horizon band's outer layer: soft rolling hill silhouettes, always
 * present, always painted (ref_c's stacked ground planes, ref_d's mountain
 * shapes). Two rings anchored to the CAMERA (the group follows it on XZ), so
 * wherever the bird runs the composition holds and the world never shows an
 * edge. The profile is a function of world azimuth plus a very slow world-
 * position drift, so the skyline turns believably as you orbit and changes
 * over kilometers of travel without ever popping.
 */

interface RingSpec {
  readonly radius: number;
  readonly maxHeight: number;
  readonly skyShift: number; // how far the paint drifts toward the sky
  readonly noiseScale: number;
  readonly seedOffset: number;
}

const RINGS: readonly RingSpec[] = [
  { radius: 500, maxHeight: 46, skyShift: 0.62, noiseScale: 1.7, seedOffset: 311.5 },
  { radius: 445, maxHeight: 26, skyShift: 0.4, noiseScale: 2.6, seedOffset: 97.3 },
];

function buildRing(spec: RingSpec, fields: PaintFields, lut: PaletteLUT, atm: AtmosphereUniforms): Mesh {
  const material = new NodeMaterial();
  material.side = BackSide;

  // Height profile over azimuth: periodic by construction (noise sampled on
  // the unit circle), long swells + a second octave of shoulders.
  const profileOf = (az: F): F => {
    // Unit-circle sampling keeps the profile periodic; the tiny camera term
    // lets the skyline morph gently over kilometers of travel.
    const cx = cos(az).mul(spec.noiseScale).add(cameraPosition.x.mul(0.0011));
    const cz = sin(az).mul(spec.noiseScale).add(cameraPosition.z.mul(0.0011));
    const n1 = mx_noise_float(vec3(cx, cz, fields.seedU.add(spec.seedOffset))).mul(0.5).add(0.5);
    const n2 = mx_noise_float(vec3(cx.mul(3.1), cz.mul(3.1), fields.seedU.add(spec.seedOffset + 7.7)))
      .mul(0.5)
      .add(0.5);
    return n1.mul(0.72).add(n2.mul(0.28)).mul(0.85).add(0.15);
  };

  const azOf = (): F => positionLocal.x.atan(positionLocal.z);

  material.positionNode = Fn(() => {
    const az = azOf();
    const t = positionLocal.y; // 0 base → 1 crest (see geometry translate)
    const h = profileOf(az).mul(spec.maxHeight);
    return vec3(positionLocal.x, t.mul(h), positionLocal.z);
  })();

  const vFrac = varying(positionLocal.y);
  const vAz = varying(azOf());

  material.fragmentNode = Fn(() => {
    const az = vAz;
    const frac = vFrac;

    // Broken crest: the silhouette dissolves stroke-by-stroke at the top.
    const crest = mx_noise_float(vec3(az.mul(140.0), frac.mul(6.0), fields.seedU.add(spec.seedOffset)));
    Discard(frac.add(crest.mul(0.1)).greaterThan(0.985));

    // Slope-lit flanks: the side of each swell facing the sun catches the
    // low light (sunset only — sunAmount gates it).
    const d = float(0.03);
    const slope = profileOf(az.add(d)).sub(profileOf(az.sub(d))).div(d.mul(2.0));
    const sunAz = SUN.z.atan(SUN.x);
    const facing = clamp(slope.mul(sin(az.sub(sunAz))).negate().mul(2.2), 0.0, 1.0);
    const lit = facing.mul(atm.sunAmount).mul(smoothstep(0.25, 0.85, frac));

    // Paint: hillFar body, hillLit on the facing flanks, value climbing
    // gently toward the crest, broken by a lateral stroke texture.
    const strokeTex = mx_noise_float(vec3(az.mul(260.0), frac.mul(14.0), fields.seedU.add(1.9)));
    const dither = hash(az.mul(913.7).add(frac.mul(311.1))).sub(0.5).mul(0.05);
    const value = clamp(frac.mul(0.34).add(0.3).add(strokeTex.mul(0.13)).add(dither), 0.03, 0.95);
    const farBody = texture(lut.texture, vec2(value, (ROW.hillFar + 0.5) / lut.rows)).rgb;
    const litBody = texture(lut.texture, vec2(value.add(0.2), (ROW.hillLit + 0.5) / lut.rows)).rgb;
    let paint = mix(farBody, litBody, lit.mul(0.75));

    // The hills live inside the sky: shift toward the horizon color, harder
    // near the base so they seat into the haze with a lost edge.
    const seat = smoothstep(0.3, 0.0, frac).mul(0.35);
    paint = mix(paint, atm.skyHorizon, float(spec.skyShift).mul(0.7).add(seat));

    return vec4(paint, 1.0);
  })();

  const geometry = new CylinderGeometry(spec.radius, spec.radius, 1, 180, 10, true);
  geometry.translate(0, 0.5, 0); // base at y=0, wall spans 0..1 for uv.y
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export class HorizonBand {
  readonly group: Group;

  constructor(fields: PaintFields, lut: PaletteLUT, atm: AtmosphereUniforms) {
    this.group = new Group();
    for (const spec of RINGS) this.group.add(buildRing(spec, fields, lut, atm));
  }

  /** Follow the camera on XZ — the skyline is always out there. */
  update(camX: number, camZ: number): void {
    this.group.position.set(camX, 0, camZ);
  }
}
