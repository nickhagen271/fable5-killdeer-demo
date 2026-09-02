import { NodeMaterial, Vector2 } from "three/webgpu";
import {
  Fn,
  cameraPosition,
  clamp,
  float,
  hash,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
  vertexStage,
} from "three/tsl";
import type UniformNode from "three/src/nodes/core/UniformNode.js";
import type { Terrain } from "../world/terrain";
import type { PaintFields } from "./fields";
import type { AtmosphereUniforms, PaletteLUT } from "./palette";

/**
 * The underpaint: the thin toned ground that shows between and beneath
 * strokes, with canvas tooth breaking through. It samples the same fields and
 * palette LUT as the strokes, sits slightly darker (thin paint recedes, loaded
 * paint advances), and carries the distance value-structure: cool far band,
 * then the palette's warm haze.
 */

export interface UnderpaintBuild {
  readonly material: NodeMaterial;
  /** Grid snap origin (meters, snapped) — set to the camera each frame. */
  readonly snapU: UniformNode<"vec2", Vector2>;
}

export function buildUnderpaint(
  fields: PaintFields,
  lut: PaletteLUT,
  atm: AtmosphereUniforms,
  terrain: Terrain,
  bare = false,
): UnderpaintBuild {
  const material = new NodeMaterial();

  // The ground is a camera-following grid: local XZ plus a snapped origin,
  // draped over the terrain heightfield per vertex.
  const snapU = uniform(new Vector2(0, 0));
  material.positionNode = Fn(() => {
    const wx = positionLocal.x.add(snapU.x);
    const wz = positionLocal.z.add(snapU.y);
    return vec3(wx, terrain.height(vec2(wx, wz)), wz);
  })();

  if (bare) {
    // Turnaround backdrop: a plain toned-canvas ground — cream wash, weave
    // tooth, nothing else. The bird is judged against it alone.
    material.fragmentNode = Fn(() => {
      const p = positionWorld.xz;
      const d = p.sub(cameraPosition.xz).length();
      const wobble = fields.n01(p, 4.0, 5.5).mul(2.4);
      const weave = sin(p.x.mul(1150.0).add(wobble)).mul(sin(p.y.mul(1150.0).sub(wobble)));
      const tooth = weave.mul(0.05).mul(smoothstep(9.0, 1.5, d));
      const wash = fields.n01(p, 0.6, 47.7).mul(0.08);
      const value = clamp(float(0.62).add(tooth).add(wash), 0.0, 1.0);
      const canvas = texture(lut.texture, vec2(value, (15 + 0.5) / lut.rows)).rgb; // birdCream row
      const finalColor = mix(canvas, atm.haze, smoothstep(30.0, 200.0, d).mul(0.8));
      return vec4(finalColor, 1.0);
    })();
    return { material, snapU };
  }

  material.fragmentNode = Fn(() => {
    const p = positionWorld.xz;
    // The field stack (many noise octaves) is evaluated per-vertex on the
    // subdivided ground plane and interpolated; only the fine grain and the
    // canvas tooth stay per-pixel. The underpaint is a broad toned wash —
    // vertex-rate light is exactly as soft as it should be.
    const lit = vertexStage(fields.litness(p));

    // Canvas tooth: a world-anchored weave, visible only near the camera
    // where the paint is thin. Faded by distance before it can alias.
    const d = p.sub(cameraPosition.xz).length();
    const toothFade = smoothstep(9.0, 2.0, d);
    const wobble = fields.n01(p, 4.0, 5.5).mul(2.4);
    const weave = sin(p.x.mul(1150.0).add(wobble)).mul(sin(p.y.mul(1150.0).sub(wobble)));
    const tooth = weave.mul(0.055).mul(toothFade);

    // The underpaint is a quiet toned ground: continuous drifts between a few
    // palette rows, sitting a step darker than the loaded strokes above it.
    const dither = hash(p.x.mul(53.9).add(p.y.mul(91.3))).sub(0.5).mul(0.05);
    const value = clamp(lit.mul(0.38).add(0.2).add(tooth).add(dither), 0.02, 0.98);

    const row = (i: number): ReturnType<typeof texture> =>
      texture(lut.texture, vec2(value, (i + 0.5) / lut.rows));
    const drift = vertexStage(fields.n01(p, 0.045, 0.0));
    const grain = fields.n01(p, 0.9, 77.7);
    let paint = mix(row(0).rgb, row(2).rgb, smoothstep(0.3, 0.7, grain).mul(0.6));
    paint = mix(paint, row(3).rgb, smoothstep(0.5, 0.9, drift).mul(0.55));
    paint = mix(paint, row(2).rgb, vertexStage(fields.shadowMask(p)).mul(0.65));
    // Bare soil patches: the worn ground worms cluster on.
    paint = mix(paint, row(3).rgb, vertexStage(terrain.soil(p)).mul(0.85));

    // Distance value structure: the palette's cool far band, then its haze.
    const farBand = smoothstep(120.0, 320.0, d);
    const cooled = mix(paint, atm.farField, farBand.mul(0.75));
    const hazeAmt = smoothstep(220.0, 420.0, d).mul(0.96);
    const finalColor = mix(cooled, atm.haze, hazeAmt);

    return vec4(finalColor, 1.0);
  })();

  return { material, snapU };
}
