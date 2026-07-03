import { Mesh, PerspectiveCamera, PlaneGeometry, Scene, Vector3, type WebGPURenderer } from "three/webgpu";
import { PaintFields } from "../paint/fields";
import { buildGroundLUT } from "../paint/palette";
import { STROKE_LODS, StrokeLOD } from "../paint/strokes";
import { buildUnderpaint } from "../paint/underpaint";
import { buildSkyDome } from "./sky";

/**
 * Phase-1 world: one open sunlit ground surface painted with world-anchored
 * impasto strokes over a canvas-tooth underpaint, beneath the hazy sky.
 */

export interface Shot {
  readonly name: string;
  readonly position: Vector3;
  readonly target: Vector3;
}

const SHOTS: readonly Shot[] = [
  { name: "vista", position: new Vector3(0, 3.4, 26), target: new Vector3(0, 2.4, -60) },
  { name: "ground", position: new Vector3(2, 0.75, 9), target: new Vector3(0, 0.35, -40) },
  { name: "detail", position: new Vector3(0, 1.15, 2.6), target: new Vector3(0.5, 0, -1.6) },
  { name: "macro", position: new Vector3(0.3, 0.5, 1.1), target: new Vector3(0.05, 0.06, -0.9) },
  { name: "sky", position: new Vector3(0, 2, 12), target: new Vector3(0, 26, -70) },
];

export interface PaintWorld {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly shots: readonly Shot[];
  readonly strokeCount: number;
  applyShot(name: string): boolean;
  /** Per-frame: stream stroke tiles around the camera. */
  update(renderer: WebGPURenderer): void;
}

export function buildPaintWorld(seed: number, aspect: number): PaintWorld {
  const fields = new PaintFields(seed);
  const lut = buildGroundLUT();
  const scene = new Scene();

  const ground = new Mesh(new PlaneGeometry(900, 900), buildUnderpaint(fields, lut));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  scene.add(buildSkyDome(fields));

  const lods = STROKE_LODS.map((cfg) => new StrokeLOD(cfg, fields, lut));
  let strokeCount = 0;
  for (const lod of lods) {
    scene.add(lod.mesh);
    strokeCount += lod.mesh.count;
  }

  const camera = new PerspectiveCamera(45, aspect, 0.1, 1500);

  const applyShot = (name: string): boolean => {
    const shot = SHOTS.find((s) => s.name === name);
    if (!shot) return false;
    camera.position.copy(shot.position);
    camera.lookAt(shot.target);
    return true;
  };
  applyShot("vista");

  const update = (renderer: WebGPURenderer): void => {
    for (const lod of lods) lod.update(renderer, camera.position.x, camera.position.z);
  };

  return { scene, camera, shots: SHOTS, strokeCount, applyShot, update };
}
