import { BackSide, Mesh, NodeMaterial, SphereGeometry } from "three/webgpu";
import {
  clamp,
  mix,
  mx_noise_float,
  positionLocal,
  pow,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import { SUN, type PaintFields } from "../paint/fields";
import type { AtmosphereUniforms } from "../paint/palette";
import type { WindField } from "../paint/wind";

/**
 * The painted sky (Pillar A, ref_d / ref_a): a three-stop gradient from the
 * palette (horizon → mid → zenith), a soft sun glow disc (sunset only — its
 * strength is a palette uniform), massed cloud dabs with lit tops and the
 * palette's cloud-shade undersides, and a lateral dragged-stroke texture so
 * no patch of sky is ever a clean gradient even before the post stack works
 * it over. Clouds drift downwind; wind time is frozen in harness mode.
 */
export function buildSkyDome(fields: PaintFields, wind: WindField, atm: AtmosphereUniforms): Mesh {
  const seedZ = fields.seedU;
  const dir = positionLocal.normalize();
  const up = clamp(dir.y, 0.0, 1.0);

  // Three-stop painted gradient. The low sky warms toward the horizon color
  // on the sun side a touch more than opposite it (ref_d's peach pools
  // around the glow).
  const sunward = clamp(dir.xz.normalize().dot(SUN.xz.normalize()), -1.0, 1.0).mul(0.5).add(0.5);
  const horizonC = mix(atm.skyHorizon, atm.sunGlow, sunward.mul(atm.sunAmount).mul(0.35));
  let sky = mix(horizonC, atm.skyMid, smoothstep(0.0, 0.3, up));
  sky = mix(sky, atm.skyTop, smoothstep(0.22, 0.85, up));

  // Massed cumulus: noise on a plane projection so clouds flatten toward the
  // horizon, thresholded into shapes with lit tops and cool undersides.
  const proj = dir.xz.div(up.add(0.22));
  const cu = proj.mul(0.5).add(wind.cloudOffset(0.0045));
  const c1 = mx_noise_float(vec3(cu, seedZ)).mul(0.5).add(0.5);
  const c2 = mx_noise_float(vec3(cu.mul(2.7).add(wind.cloudOffset(0.0016)), seedZ.add(17.4))).mul(0.5).add(0.5);
  const c3 = mx_noise_float(vec3(cu.mul(6.3).add(wind.cloudOffset(0.0031)), seedZ.add(41.2))).mul(0.5).add(0.5);
  const cloudField = c1.sub(0.5).mul(1.9).add(c2.sub(0.5).mul(0.9)).add(c3.sub(0.5).mul(0.4)).add(0.5).add(atm.cloudCover);
  const horizonFade = smoothstep(0.02, 0.26, up);
  const cloudMask = smoothstep(0.47, 0.6, cloudField).mul(horizonFade);
  // Cloud bodies: shaded undersides low in each mass, lit tops high; the lit
  // side leans toward the sun glow so cream cloud bellies read (ref_d).
  const litTop = smoothstep(0.5, 0.78, cloudField);
  const cloudBody = mix(atm.cloudShade, mix(atm.cloudLit, atm.sunGlow, sunward.mul(atm.sunAmount).mul(0.4)), litTop);
  sky = mix(sky, cloudBody, cloudMask.mul(0.97));
  sky = mix(sky, atm.cloudLit, smoothstep(0.4, 0.52, cloudField).mul(horizonFade).mul(0.16));

  // The sun as a soft glow disc: a hot core melting into a broad halo —
  // never a hard-edged circle. Strength is the palette's sunAmount.
  const g = clamp(dir.dot(SUN), 0.0, 1.0);
  const halo = pow(g, 7.0).mul(0.45).add(pow(g, 60.0).mul(0.55)).add(pow(g, 320.0).mul(0.5));
  sky = mix(sky, atm.sunGlow, clamp(halo.mul(atm.sunAmount), 0.0, 0.96));

  // Dragged-stroke texture: elongated lateral noise (long in azimuth, short
  // in elevation) — the sky is laid in with a wide dry brush, and it shows.
  const az = dir.x.atan(dir.z);
  const strokeA = mx_noise_float(vec3(az.mul(9.0), dir.y.mul(58.0), seedZ.add(5.1)));
  const strokeB = mx_noise_float(vec3(az.mul(23.0), dir.y.mul(130.0), seedZ.add(23.7)));
  sky = sky.mul(strokeA.mul(0.045).add(strokeB.mul(0.03)).add(1.0));

  // Broken-color jitter so the gradient never reads photographic.
  const jitter = mx_noise_float(vec3(dir.x.mul(24.0), dir.y.mul(24.0), dir.z.mul(24.0).add(seedZ)));
  sky = sky.add(vec3(jitter.mul(0.014)));

  // Wide blend into the ground haze — a lost horizon, not a razor edge.
  const finalColor = mix(atm.haze, sky, smoothstep(-0.05, 0.09, dir.y));

  const material = new NodeMaterial();
  material.side = BackSide;
  material.fragmentNode = vec4(finalColor, 1.0);

  return new Mesh(new SphereGeometry(600, 48, 24), material);
}
