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
import type { WindField } from "../paint/wind";

/**
 * Hazy high-key sky dome with massed cumulus. Since phase 4 the cloud layer
 * drifts downwind — slowly, at two slightly different rates per octave so the
 * masses churn instead of sliding as a decal. Wind time is frozen in harness
 * mode, so shot determinism is untouched.
 */

const SKY = {
  zenith: 0x5b92c8,
  horizon: 0xece5cf,
  cloud: 0xf8f3e4,
  cloudShade: 0xb4bac9,
  sunGlow: 0xffe9b8,
} as const;

export function buildSkyDome(fields: PaintFields, wind: WindField): Mesh {
  const seedZ = fields.seedU;
  const dir = positionLocal.normalize();
  const up = clamp(dir.y, 0.0, 1.0);

  let sky = mix(color(SKY.horizon), color(SKY.zenith), pow(up, 0.5));

  // Massed cumulus: noise on a plane projection so clouds flatten toward the
  // horizon, thresholded into shapes with lit tops and cool undersides.
  const proj = dir.xz.div(up.add(0.22));
  const cu = proj.mul(0.5).add(wind.cloudOffset(0.0045));
  const c1 = mx_noise_float(vec3(cu, seedZ)).mul(0.5).add(0.5);
  const c2 = mx_noise_float(vec3(cu.mul(2.7).add(wind.cloudOffset(0.0016)), seedZ.add(17.4))).mul(0.5).add(0.5);
  const c3 = mx_noise_float(vec3(cu.mul(6.3).add(wind.cloudOffset(0.0031)), seedZ.add(41.2))).mul(0.5).add(0.5);
  // Contrast-stretched so real cumulus bodies form with blue sky between
  // them (Ref 1's sky carries half the painting — ours has to hold its own).
  const cloudField = c1.sub(0.5).mul(1.9).add(c2.sub(0.5).mul(0.9)).add(c3.sub(0.5).mul(0.4)).add(0.5);
  const horizonFade = smoothstep(0.02, 0.26, up);
  const cloudMask = smoothstep(0.47, 0.6, cloudField).mul(horizonFade);
  const cloudBody = mix(color(SKY.cloudShade), color(SKY.cloud), smoothstep(0.5, 0.78, cloudField));
  sky = mix(sky, cloudBody, cloudMask.mul(0.97));
  sky = mix(sky, color(SKY.cloud), smoothstep(0.4, 0.52, cloudField).mul(horizonFade).mul(0.16));

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
