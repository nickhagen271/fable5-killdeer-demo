import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  cameraPosition,
  clamp,
  color,
  hash,
  mix,
  positionWorld,
  sin,
  smoothstep,
  texture,
  vec2,
  vec4,
  vertexStage,
} from "three/tsl";
import type { PaintFields } from "./fields";
import type { PaletteLUT } from "./palette";

/**
 * The underpaint: the thin toned ground that shows between and beneath
 * strokes, with canvas tooth breaking through. It samples the same fields and
 * palette LUT as the strokes, sits slightly darker (thin paint recedes, loaded
 * paint advances), and carries the distance value-structure: cool far band,
 * then warm haze.
 */

// Scene atmosphere colors (shared with the sky's horizon treatment).
export const FAR_FIELD = 0xa3aebc;
export const HAZE = 0xdcdfd4;

export function buildUnderpaint(fields: PaintFields, lut: PaletteLUT): NodeMaterial {
  const material = new NodeMaterial();

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
    let paint = mix(row(0).rgb, row(3).rgb, smoothstep(0.3, 0.7, grain).mul(0.6));
    paint = mix(paint, row(9).rgb, smoothstep(0.5, 0.9, drift).mul(0.55));
    paint = mix(paint, row(4).rgb, vertexStage(fields.shadowMask(p)).mul(0.65));

    // Distance value structure: cool grey-violet far band, then warm haze.
    const farBand = smoothstep(120.0, 320.0, d);
    const cooled = mix(paint, color(FAR_FIELD), farBand.mul(0.75));
    const hazeAmt = smoothstep(220.0, 420.0, d).mul(0.96);
    const finalColor = mix(cooled, color(HAZE), hazeAmt);

    return vec4(finalColor, 1.0);
  })();

  return material;
}
