import { Mesh, PerspectiveCamera, PlaneGeometry, Scene, Vector3, type WebGPURenderer } from "three/webgpu";
import { Bird } from "../bird/bird";
import type { BirdPreset } from "../bird/birdAnim";
import { PaintFields } from "../paint/fields";
import { buildGroundLUT } from "../paint/palette";
import { STROKE_LODS, StrokeLOD } from "../paint/strokes";
import { buildUnderpaint } from "../paint/underpaint";
import { FlowerField, GRASS_LODS, GrassLOD } from "../paint/vegetation";
import { FoodSystem } from "./food";
import { buildSkyDome } from "./sky";
import { buildTreeline } from "./treeline";

/**
 * The world: one open sunlit ground surface painted with world-anchored
 * impasto strokes, the hazy sky, and — since phase 2 — the killdeer.
 */

export interface Shot {
  readonly name: string;
  readonly position: Vector3;
  readonly target: Vector3;
  /** Optional deterministic bird pose applied with the shot (harness). */
  readonly bird?: { readonly preset: BirdPreset; readonly phase: number };
}

const SHOTS: readonly Shot[] = [
  { name: "vista", position: new Vector3(0, 3.4, 26), target: new Vector3(0, 2.4, -60) },
  { name: "ground", position: new Vector3(2, 0.75, 9), target: new Vector3(0, 0.35, -40) },
  { name: "detail", position: new Vector3(0, 1.15, 2.6), target: new Vector3(0.5, 0, -1.6) },
  { name: "macro", position: new Vector3(0.3, 0.5, 1.1), target: new Vector3(0.05, 0.06, -0.9) },
  { name: "sky", position: new Vector3(0, 2, 12), target: new Vector3(0, 26, -70) },
  { name: "meadow", position: new Vector3(1.2, 0.38, 4.2), target: new Vector3(-0.6, 0.22, -5) },
  { name: "treeline", position: new Vector3(0, 2.4, 30), target: new Vector3(0, 7, -190) },
  {
    name: "bird_idle",
    position: new Vector3(0.34, 0.25, 0.42),
    target: new Vector3(0, 0.17, 0),
    bird: { preset: "idle", phase: 0 },
  },
  {
    name: "bird_run",
    position: new Vector3(0.52, 0.21, 0.1),
    target: new Vector3(0, 0.16, 0.02),
    bird: { preset: "run", phase: 0.18 },
  },
  {
    name: "bird_peck",
    position: new Vector3(0.36, 0.23, 0.38),
    target: new Vector3(0, 0.12, 0.06),
    bird: { preset: "peck", phase: 0.5 },
  },
  {
    name: "bird_alert",
    position: new Vector3(0.3, 0.29, 0.52),
    target: new Vector3(0, 0.2, 0),
    bird: { preset: "alert", phase: 0 },
  },
  {
    name: "follow",
    position: new Vector3(0, 0.51, -1.2),
    target: new Vector3(0, 0.2, 0.35),
    bird: { preset: "idle", phase: 0 },
  },
];

export interface PaintWorld {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly shots: readonly Shot[];
  readonly strokeCount: number;
  readonly bird: Bird;
  readonly food: FoodSystem;
  applyShot(name: string): boolean;
  /** Per-frame: stream stroke tiles around the camera. */
  update(renderer: WebGPURenderer): void;
}

export function buildPaintWorld(seed: number, aspect: number): PaintWorld {
  const fields = new PaintFields(seed);
  const lut = buildGroundLUT();
  const scene = new Scene();

  // Subdivided so the underpaint's field noise can run at vertex rate.
  const ground = new Mesh(new PlaneGeometry(900, 900, 300, 300), buildUnderpaint(fields, lut));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  scene.add(buildSkyDome(fields));
  scene.add(buildTreeline(seed, lut));

  const lods = STROKE_LODS.map((cfg) => new StrokeLOD(cfg, fields, lut));
  let strokeCount = 0;
  for (const lod of lods) {
    scene.add(lod.mesh);
    strokeCount += lod.mesh.count;
  }

  const grass = GRASS_LODS.map((cfg) => new GrassLOD(cfg, fields, lut));
  for (const g of grass) {
    scene.add(g.mesh);
    strokeCount += g.mesh.count;
  }
  const flowers = new FlowerField(fields, lut);
  scene.add(flowers.stems);
  scene.add(flowers.heads);
  strokeCount += flowers.stems.count * 2;

  const bird = new Bird(lut, seed);
  scene.add(bird.root);

  const food = new FoodSystem(seed, lut);
  scene.add(food.mesh);

  // The forage connect: when the bill meets the ground, the nearest live
  // spot within reach is taken, and the bird gets its gulp-and-scan beat.
  bird.anim.onPeckContact = (): void => {
    const bx = bird.position.x + Math.sin(bird.heading) * 0.14;
    const bz = bird.position.z + Math.cos(bird.heading) * 0.14;
    if (food.tryEat(bx, bz, 0.15)) bird.anim.notifyEat();
  };

  const camera = new PerspectiveCamera(45, aspect, 0.05, 1500);

  const applyShot = (name: string): boolean => {
    const shot = SHOTS.find((s) => s.name === name);
    if (!shot) return false;
    camera.position.copy(shot.position);
    camera.lookAt(shot.target);
    if (shot.bird) bird.applyPreset(shot.bird.preset, shot.bird.phase);
    return true;
  };
  applyShot("vista");

  const update = (renderer: WebGPURenderer): void => {
    for (const lod of lods) lod.update(renderer, camera.position.x, camera.position.z);
    for (const g of grass) g.update(renderer, camera.position.x, camera.position.z);
    flowers.update(renderer, camera.position.x, camera.position.z);
  };

  return { scene, camera, shots: SHOTS, strokeCount, bird, food, applyShot, update };
}
