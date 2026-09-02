import { NodeMaterial } from "three/webgpu";
import {
  Fn,
  cameraPosition,
  clamp,
  float,
  hash,
  mx_noise_float,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  texture,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { SUN, type FloatExpr } from "../paint/fields";
import type { PaletteLUT } from "../paint/palette";

/**
 * The killdeer is painted in the same language as the world: palette-LUT
 * pigment in quantized value planes, bristle striations along the feather
 * flow, broken edges, warm-cool form light with luminous shadows. Each part
 * supplies a marking function mapping its LOCAL position to a palette row
 * (this is where the two breast bands, the face pattern and the rust rump
 * live); this factory turns that into paint.
 */

export type MarkingFn = (local: ReturnType<typeof positionLocal.toVar>) => FloatExpr;

export interface BirdMaterialOptions {
  /** Feather flow: axis in part-local space the striations run along. */
  readonly flow?: readonly [number, number, number];
  /** Extra value shift (e.g. slightly darker legs in shade). */
  readonly valueShift?: number;
}

export function buildBirdMaterial(lut: PaletteLUT, marking: MarkingFn, options: BirdMaterialOptions = {}): NodeMaterial {
  const flow = options.flow ?? [0, 0, 1];
  const valueShift = options.valueShift ?? 0;

  const material = new NodeMaterial();

  material.fragmentNode = Fn(() => {
    const local = positionLocal.toVar();
    const row = marking(local);

    // Bristle striations along the feather flow, in part-local space so they
    // stick to the body through animation (world-anchored to the bird).
    const flowV = vec3(flow[0], flow[1], flow[2]);
    const along = local.dot(flowV);
    const across = local.sub(flowV.mul(along));
    const bristle = mx_noise_float(vec3(across.mul(220.0).xy, along.mul(38.0))).mul(0.5).add(0.5);

    // Warm-cool form light. The floor keeps shadows luminous, never black.
    const form = clamp(normalWorld.dot(SUN), -1.0, 1.0).mul(0.5).add(0.5);
    const dither = hash(positionWorld.x.mul(311.7).add(positionWorld.y.mul(127.1)).add(positionWorld.z.mul(74.7)))
      .sub(0.5)
      .mul(0.05);
    const value = clamp(
      form.mul(0.58).add(0.3).add(bristle.sub(0.5).mul(0.12)).add(dither).add(valueShift),
      0.04,
      0.97,
    );

    const rowV = row.add(0.5).div(lut.rows);
    const paint = texture(lut.texture, vec2(value, rowV)).rgb;

    // Soft painted form edge: values dip a touch at the silhouette, the way
    // a brush turns the volume — not an outline shader.
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const rim = pow(clamp(float(1.0).sub(normalWorld.dot(viewDir).abs()), 0.0, 1.0), 2.2);
    const turned = paint.mul(float(1.0).sub(rim.mul(0.18)));

    // A restrained wet-paint sheen so the bird sits in the same varnish as
    // the field's strokes.
    const h = normalize(viewDir.add(SUN));
    const sheen = pow(clamp(normalWorld.dot(h), 0.0, 1.0), 14.0).mul(bristle.mul(0.5).add(0.2)).mul(0.18);

    return vec4(turned.add(vec3(1.0, 0.96, 0.86).mul(sheen)), 1.0);
  })();

  return material;
}
