import { BackSide, Mesh, NodeMaterial, SphereGeometry } from "three/webgpu";
import {
  clamp,
  color,
  mix,
  mx_noise_float,
  positionLocal,
  pow,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import { SUN_DIR, type PaintFields } from "../paint/fields";
import { HAZE } from "../paint/underpaint";

/**
 * Hazy high-key sky dome with massed cumulus, carried over from phase 0.
 * Real cloud brushwork arrives with the field in phases 3-4; this keeps the
 * value structure and warm light correct meanwhile.
 */

const SKY = {
  zenith: 0x77a3cf,
  horizon: 0xece5cf,
  cloud: 0xf7f2e3,
  cloudShade: 0xc3c6cc,
  sunGlow: 0xffe9b8,
} as const;

export function buildSkyDome(fields: PaintFields): Mesh {
  const seedZ = fields.seedU;
  const dir = positionLocal.normalize();
  const up = clamp(dir.y, 0.0, 1.0);

  let sky = mix(color(SKY.horizon), color(SKY.zenith), pow(up, 0.5));

  // Massed cumulus: noise on a plane projection so clouds flatten toward the
  // horizon, thresholded into shapes with lit tops and cool undersides.
  const proj = dir.xz.div(up.add(0.22));
  const cu = proj.mul(0.32);
  const c1 = mx_noise_float(vec3(cu, seedZ)).mul(0.5).add(0.5);
  const c2 = mx_noise_float(vec3(cu.mul(2.7), seedZ.add(17.4))).mul(0.5).add(0.5);
  const c3 = mx_noise_float(vec3(cu.mul(6.3), seedZ.add(41.2))).mul(0.5).add(0.5);
  const cloudField = c1.mul(0.55).add(c2.mul(0.3)).add(c3.mul(0.15));
  const horizonFade = smoothstep(0.02, 0.3, up);
  const cloudMask = smoothstep(0.55, 0.68, cloudField).mul(horizonFade);
  const cloudBody = mix(color(SKY.cloudShade), color(SKY.cloud), smoothstep(0.56, 0.78, cloudField));
  sky = mix(sky, cloudBody, cloudMask.mul(0.95));
  sky = mix(sky, color(SKY.cloud), smoothstep(0.42, 0.55, cloudField).mul(horizonFade).mul(0.12));

  // Warm sun glow, high and hazy.
  const g = clamp(dir.dot(vec3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z)), 0.0, 1.0);
  sky = mix(sky, color(SKY.sunGlow), pow(g, 5.0).mul(0.4));

  // Broken-color jitter so the gradient never reads photographic.
  const jitter = mx_noise_float(vec3(dir.x.mul(24.0), dir.y.mul(24.0), dir.z.mul(24.0).add(seedZ)));
  sky = sky.add(vec3(jitter.mul(0.015)));

  // Wide blend into the ground haze — a lost horizon, not a razor edge.
  const finalColor = mix(color(HAZE), sky, smoothstep(-0.05, 0.09, dir.y));

  const material = new NodeMaterial();
  material.side = BackSide;
  material.fragmentNode = vec4(finalColor, 1.0);

  return new Mesh(new SphereGeometry(600, 48, 24), material);
}
