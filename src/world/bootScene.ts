import {
  BackSide,
  Mesh,
  NodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
} from "three/webgpu";
import {
  cameraPosition,
  clamp,
  color,
  float,
  mix,
  mx_noise_float,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import { Rng } from "../core/rng";

/**
 * Phase-0 smoke-test scene. This is NOT the paint system — phase 1 replaces
 * all of it with world-anchored strokes. It exists so the harness has a frame
 * to shoot: a seeded broken-color meadow plane and a hazy high-key sky, both
 * shaded by hand in TSL (no three lights, no PBR, no flat single-hue surface).
 */

export interface Shot {
  readonly name: string;
  readonly position: Vector3;
  readonly target: Vector3;
}

export interface BootScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly shots: readonly Shot[];
  applyShot(name: string): boolean;
}

// High-key palette pulled from the /reference paintings. Bounded and
// deliberate; the phase-1 palette LUT will formalize this.
const PAL = {
  meadowGreen: 0xa0b562,
  warmOchre: 0xcaa757,
  coolGreen: 0x74a07c,
  violetTouch: 0x968cb4,
  poppyNote: 0xc26a52,
  roseNote: 0xc79aa2,
  farField: 0xa3aebc,
  haze: 0xdcdfd4,
  zenith: 0x77a3cf,
  horizon: 0xece5cf,
  cloud: 0xf7f2e3,
  cloudShade: 0xc3c6cc,
  sunGlow: 0xffe9b8,
} as const;

const SUN_DIR = new Vector3(-0.4, 0.55, -0.35).normalize();

function groundMaterial(rng: Rng): NodeMaterial {
  const seedZ = float(rng.range(0, 100));

  const p = positionWorld.xz;
  // Three noise scales: large value masses, mid clumps, fine broken color.
  const nLarge = mx_noise_float(vec3(p.mul(0.045), seedZ)).mul(0.5).add(0.5);
  const nMid = mx_noise_float(vec3(p.mul(0.32), seedZ.add(11.7))).mul(0.5).add(0.5);
  const nFine = mx_noise_float(vec3(p.mul(1.7), seedZ.add(29.3))).mul(0.5).add(0.5);

  let base = mix(color(PAL.meadowGreen), color(PAL.warmOchre), nLarge);
  base = mix(base, color(PAL.coolGreen), smoothstep(0.1, 0.9, nMid).mul(0.7));
  base = mix(base, color(PAL.violetTouch), smoothstep(0.55, 0.95, nFine).mul(0.38));

  // Scattered warm flower notes in the poppy spirit — sparse thresholded
  // flecks of red-orange and dusty rose, denser in some drifts than others.
  const nFleck = mx_noise_float(vec3(p.mul(3.9), seedZ.add(53.1))).mul(0.5).add(0.5);
  const drift = mx_noise_float(vec3(p.mul(0.09), seedZ.add(71.9))).mul(0.5).add(0.5);
  const fleckGate = smoothstep(0.78, 0.86, nFleck.mul(drift.mul(0.5).add(0.62)));
  base = mix(base, color(PAL.roseNote), smoothstep(0.62, 0.78, nFleck).mul(drift).mul(0.5));
  base = mix(base, color(PAL.poppyNote), fleckGate.mul(0.85));

  // Hand-built warm-cool light ramp driven by the clump noise: shadows stay
  // colored and luminous (cool multiplier), lights push warm. No black.
  const lightAmt = clamp(nMid.mul(0.6).add(nFine.mul(0.4)), 0.0, 1.0);
  const shadowed = base.mul(vec3(0.66, 0.7, 0.9));
  const lit = base.mul(vec3(1.18, 1.1, 0.86));
  const shaded = mix(shadowed, lit, lightAmt);

  // Distant value structure: the field cools and greys toward a far band
  // (the reference's distant treeline mass) before dissolving into haze.
  const dist = positionWorld.sub(cameraPosition).length();
  const farBand = smoothstep(120.0, 320.0, dist);
  const cooled = mix(shaded, color(PAL.farField), farBand.mul(0.75));
  const hazeAmt = smoothstep(220.0, 420.0, dist).mul(0.96);
  const finalColor = mix(cooled, color(PAL.haze), hazeAmt);

  const material = new NodeMaterial();
  material.fragmentNode = vec4(finalColor, 1.0);
  return material;
}

function skyMaterial(rng: Rng): NodeMaterial {
  const seedZ = float(rng.range(0, 100));
  const dir = positionLocal.normalize();
  const up = clamp(dir.y, 0.0, 1.0);

  let sky = mix(color(PAL.horizon), color(PAL.zenith), pow(up, 0.5));

  // Massed cumulus in the Ref 1 manner: noise sampled on a plane projection
  // so clouds flatten toward the horizon, thresholded into real shapes.
  const proj = dir.xz.div(up.add(0.22));
  const cu = proj.mul(0.32);
  const c1 = mx_noise_float(vec3(cu, seedZ)).mul(0.5).add(0.5);
  const c2 = mx_noise_float(vec3(cu.mul(2.7), seedZ.add(17.4))).mul(0.5).add(0.5);
  const c3 = mx_noise_float(vec3(cu.mul(6.3), seedZ.add(41.2))).mul(0.5).add(0.5);
  const cloudField = c1.mul(0.55).add(c2.mul(0.3)).add(c3.mul(0.15));
  const horizonFade = smoothstep(0.02, 0.3, up);
  const cloudMask = smoothstep(0.55, 0.68, cloudField).mul(horizonFade);
  // Lit tops vs cool undersides, edges kept soft and broken.
  const cloudBody = mix(color(PAL.cloudShade), color(PAL.cloud), smoothstep(0.56, 0.78, cloudField));
  sky = mix(sky, cloudBody, cloudMask.mul(0.95));
  // Thin high veil so the blue between masses never reads flat.
  sky = mix(sky, color(PAL.cloud), smoothstep(0.42, 0.55, cloudField).mul(horizonFade).mul(0.12));

  // Warm sun glow, high and hazy.
  const g = clamp(dir.dot(vec3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z)), 0.0, 1.0);
  sky = mix(sky, color(PAL.sunGlow), pow(g, 5.0).mul(0.4));

  // Slight broken-color jitter so the gradient never reads photographic.
  const jitter = mx_noise_float(vec3(dir.x.mul(24.0), dir.y.mul(24.0), dir.z.mul(24.0).add(seedZ)));
  sky = sky.add(vec3(jitter.mul(0.015)));

  // Below the horizon the dome meets the ground haze; the band is wide so the
  // seam dissolves instead of cutting a razor edge (lost-and-found horizon).
  const finalColor = mix(color(PAL.haze), sky, smoothstep(-0.05, 0.09, dir.y));

  const material = new NodeMaterial();
  material.side = BackSide;
  material.fragmentNode = vec4(finalColor, 1.0);
  return material;
}

const SHOTS: readonly Shot[] = [
  { name: "vista", position: new Vector3(0, 3.4, 26), target: new Vector3(0, 2.4, -60) },
  { name: "ground", position: new Vector3(2, 0.6, 9), target: new Vector3(0, 0.4, -40) },
  { name: "sky", position: new Vector3(0, 2, 12), target: new Vector3(0, 26, -70) },
  { name: "detail", position: new Vector3(0, 1.6, 4), target: new Vector3(0.4, 0, -1.5) },
];

export function buildBootScene(seed: number, aspect: number): BootScene {
  const rng = new Rng(seed);
  const scene = new Scene();

  const ground = new Mesh(new PlaneGeometry(900, 900), groundMaterial(rng.fork("ground")));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const dome = new Mesh(new SphereGeometry(600, 48, 24), skyMaterial(rng.fork("sky")));
  scene.add(dome);

  const camera = new PerspectiveCamera(45, aspect, 0.1, 1500);

  const applyShot = (name: string): boolean => {
    const shot = SHOTS.find((s) => s.name === name);
    if (!shot) return false;
    camera.position.copy(shot.position);
    camera.lookAt(shot.target);
    return true;
  };

  applyShot("vista");

  return { scene, camera, shots: SHOTS, applyShot };
}
