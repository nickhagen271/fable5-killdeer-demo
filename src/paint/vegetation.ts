import { InstancedMesh, NodeMaterial, PlaneGeometry, Vector2, type WebGPURenderer } from "three/webgpu";
import {
  Discard,
  Fn,
  PI,
  abs,
  clamp,
  cos,
  float,
  hash,
  instanceIndex,
  instancedArray,
  mix,
  mx_noise_float,
  normalize,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  texture,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  cameraPosition,
  positionWorld,
} from "three/tsl";
import type UniformNode from "three/src/nodes/core/UniformNode.js";
import { PaintFields, SUN_DIR, type FloatExpr } from "./fields";
import type { PaletteLUT } from "./palette";

/**
 * Upright vegetation strokes: grass blades and wildflowers. Same contract as
 * the ground strokes — world-anchored instanced ribbons, GPU-placed
 * deterministically per (world tile, slot, seed), tile-streamed, stochastic
 * ring erosion — but these RISE. Grass strokes follow growth direction
 * (reference note: "grass strokes rise"), tips catch the light and carry the
 * impasto; flower heads are the thickest paint in the field.
 */

const SUN = vec3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);

type ComputeNode = Parameters<WebGPURenderer["computeAsync"]>[0];

interface TileStream {
  readonly tileSize: number;
  readonly grid: number;
  readonly perTile: number;
}

/** Shared tile-snap streaming driver (same scheme as StrokeLOD). */
class Streamer {
  private readonly snap = new Vector2(Number.NaN, Number.NaN);
  constructor(
    private readonly tileSize: number,
    private readonly snapU: UniformNode<"vec2", Vector2>,
    private readonly computeNode: ComputeNode,
  ) {}

  update(renderer: WebGPURenderer, camX: number, camZ: number): void {
    const sx = Math.floor(camX / this.tileSize);
    const sz = Math.floor(camZ / this.tileSize);
    if (sx === this.snap.x && sz === this.snap.y) return;
    this.snap.set(sx, sz);
    this.snapU.value.set(sx, sz);
    void renderer.computeAsync(this.computeNode);
  }
}

// ---------------------------------------------------------------------------
// Grass
// ---------------------------------------------------------------------------

export interface GrassLODConfig extends TileStream {
  readonly name: string;
  readonly height: number; // base blade height (m)
  readonly width: number; // base blade width (m)
  readonly rIn: number;
  readonly rOut: number;
}

export const GRASS_LODS: readonly GrassLODConfig[] = [
  { name: "grass-near", tileSize: 4, grid: 9, perTile: 560, height: 0.13, width: 0.05, rIn: 0, rOut: 10 },
  { name: "grass-mid", tileSize: 12, grid: 7, perTile: 340, height: 0.22, width: 0.09, rIn: 7, rOut: 24 },
];

export class GrassLOD {
  readonly mesh: InstancedMesh;
  private readonly streamer: Streamer;

  constructor(cfg: GrassLODConfig, fields: PaintFields, lut: PaletteLUT) {
    const slots = cfg.grid * cfg.grid * cfg.perTile;
    const half = (cfg.grid - 1) / 2;

    // A: base.x, base.z, blade azimuth, height   B: width, lean, palette row, rand
    const bufA = instancedArray(slots, "vec4");
    const bufB = instancedArray(slots, "vec4");

    const snapU = uniform(new Vector2(0, 0));

    const computeNode = Fn(() => {
      const i = instanceIndex;
      const tileIdx = i.div(cfg.perTile);
      const slot = i.mod(cfg.perTile).toFloat();
      const gx = tileIdx.mod(cfg.grid).toFloat().sub(half);
      const gz = tileIdx.div(cfg.grid).toFloat().sub(half);
      const tile = vec2(snapU.x.add(gx), snapU.y.add(gz)).toVar();

      const tileHash = hash(tile.x.mul(113.5).add(tile.y.mul(271.9)).add(fields.seedU));
      const r1 = hash(slot.mul(9.17).add(tileHash.mul(1024.0)));
      const r2 = hash(slot.mul(17.29).add(tileHash.mul(2048.0)).add(0.37));
      const r3 = hash(r1.mul(883.3).add(r2.mul(191.9)));
      const r4 = hash(r3.mul(647.7).add(slot));
      const r5 = hash(r4.mul(389.9).add(tileHash));
      const r6 = hash(r5.mul(311.1).add(r1.mul(73.3)));

      const px = tile.x.add(r1).mul(cfg.tileSize);
      const pz = tile.y.add(r2).mul(cfg.tileSize);
      const p = vec2(px, pz).toVar();

      // Grass grows in tufts: a clump field gates density so bare ground
      // strokes read between them. Shadow masses keep grass but darker.
      // Tight tufts: dense inside clumps, sparse strays between them.
      const clump = fields.n01(p, 0.5, 143.7);
      const keep = pow(smoothstep(0.3, 0.64, clump), 1.4).mul(0.85).add(0.08);
      const lit = fields.litness(p);

      const azimuth = r3.mul(PI.mul(2.0));
      const height = float(cfg.height)
        .mul(mix(float(0.6), float(1.65), pow(r4, 1.4)))
        .mul(clump.mul(0.5).add(0.65))
        .mul(select(keep.greaterThan(hash(slot.mul(3.31).add(tileHash))), float(1.0), float(0.0)));
      const width = float(cfg.width).mul(r5.mul(0.7).add(0.65));
      const lean = r6.mul(0.34).add(0.14);

      // Color: greens; dry cream/ochre blades in the warm drifts, cool greens
      // in shadow. Poppy rows never appear in grass.
      const drift = fields.n01(p, 0.045, 0.0);
      const rPick = hash(r6.mul(517.7).add(9.1));
      const greens = select(rPick.lessThan(0.55), float(0.0), select(rPick.lessThan(0.85), float(1.0), float(3.0)));
      // Dry blades are ochre only — cream wires read as scratches, not grass.
      const dry = float(2.0);
      const warmProb = smoothstep(0.55, 0.9, drift).mul(0.25);
      let cIdx = select(hash(r2.mul(731.3)).lessThan(warmProb), dry, greens);
      cIdx = select(fields.shadowMask(p).mul(0.9).greaterThan(hash(r4.mul(211.7))), float(4.0), cIdx);

      // The light field is sampled ONCE per blade here and packed into the
      // row float's fraction — the fragment stage never touches the noise.
      const rowPacked = cIdx.add(clamp(lit, 0.002, 0.998));
      bufA.element(i).assign(vec4(px, pz, azimuth, height));
      bufB.element(i).assign(vec4(width, lean.mul(lit.mul(0.5).add(0.5)), rowPacked, r6));
    })().compute(slots);

    const material = new NodeMaterial();
    const recA = bufA.element(instanceIndex);
    const recB = bufB.element(instanceIndex);
    const vA = varying(recA);
    const vB = varying(recB);

    material.positionNode = Fn(() => {
      const across = uv().x.sub(0.5);
      const t = uv().y; // 0 root → 1 tip
      const azimuth = recA.z;
      const height = recA.w;
      const width = recB.x;
      const lean = recB.y;
      const rand = recB.w;

      // The blade's face is a fixed world plane; the lean bends the ribbon
      // over in the flow direction, quadratic so the root stays planted.
      const side = vec3(cos(azimuth), 0.0, sin(azimuth));
      const leanAz = fields.flowAngle(vec2(recA.x, recA.y)).add(rand.sub(0.5).mul(1.2));
      const leanDir = vec3(cos(leanAz), 0.0, sin(leanAz));

      const taper = float(1.0).sub(t.mul(0.72));
      const bend = t.mul(t).mul(lean).mul(height);
      const pos = vec3(recA.x, 0.02, recA.y)
        .add(side.mul(across.mul(width).mul(taper)))
        .add(leanDir.mul(bend))
        .add(vec3(0.0, t.mul(height).mul(float(1.0).sub(lean.mul(bend).mul(0.3))), 0.0));
      return pos;
    })();

    material.fragmentNode = Fn(() => {
      const across = uv().x.sub(0.5);
      const t = uv().y;
      const height = vA.w;
      const cIdx = vB.z.floor();
      const lit = vB.z.fract();
      const rand = vB.w;

      Discard(height.lessThan(0.005)); // clump-culled blades

      // One instance is a TUFT: the ribbon splits into a few blade streaks
      // (a single drybrush flick leaving several hairs), each with its own
      // ragged tip height.
      const streaks = mx_noise_float(vec3(across.mul(13.0), rand.mul(431.7), t.mul(0.5))).mul(0.5).add(0.5);
      const edgeNoise = mx_noise_float(vec3(t.mul(6.0), across.mul(3.0), rand.mul(271.3)));
      const tipMask = smoothstep(1.0, 0.82, t.add(edgeNoise.mul(0.1)).add(streaks.sub(0.5).mul(0.34)));
      const sideMask = smoothstep(0.5, 0.3, abs(across).add(edgeNoise.mul(0.1)));
      const streakMask = smoothstep(0.34, 0.52, streaks);
      const bristle = mx_noise_float(vec3(t.mul(7.0), rand.mul(157.3), across.mul(2.0))).mul(0.5).add(0.5);

      const d = positionWorld.xz.sub(cameraPosition.xz).length();
      const visOut = smoothstep(float(cfg.rOut), float(cfg.rOut).mul(0.8), d);
      const visIn = cfg.rIn > 0 ? smoothstep(float(cfg.rIn).mul(0.8), float(cfg.rIn), d) : float(1.0);

      Discard(tipMask.mul(sideMask).mul(streakMask).lessThan(0.38));
      Discard(visOut.mul(visIn).lessThan(hash(rand.mul(1531.7))));

      // Value climbs the blade: roots sit in their own shadow, lit tips catch
      // the sun — where the impasto piles.
      const dither = hash(positionWorld.x.mul(41.3).add(positionWorld.z.mul(67.9))).sub(0.5).mul(0.05);
      const bladeJitter = hash(rand.mul(419.3)).sub(0.5).mul(0.11);
      const value = clamp(
        lit.mul(0.6).add(0.16).add(t.mul(t).mul(lit).mul(0.42)).add(dither).add(bladeJitter),
        0.02,
        0.98,
      );
      const rowV = cIdx.add(0.5).div(lut.rows);
      const paint = texture(lut.texture, vec2(value, rowV)).rgb;

      // Paint-body relief: a slim ridge along the blade center.
      const crossH = cos(across.mul(PI));
      const hAmp = lit.mul(t).mul(0.9).add(0.1);
      const slope = sin(across.mul(PI)).negate().mul(hAmp).mul(0.5).add(bristle.sub(0.5).mul(0.4));
      const side3 = vec3(cos(vA.z), 0.0, sin(vA.z));
      const n = normalize(vec3(0.0, 1.0, 0.0).add(side3.mul(slope)));
      const relief = clamp(n.dot(SUN), 0.0, 1.0).sub(0.5).mul(hAmp).mul(0.5).add(1.0);

      // Sheen along the blade tangent, near-field, glinting on lit tips.
      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const hv = normalize(viewDir.add(SUN));
      const tangent = normalize(vec3(0.0, 1.0, 0.0).add(side3.mul(0.15)));
      const tDotH = tangent.dot(hv);
      const sheen = pow(sqrt(clamp(float(1.0).sub(tDotH.mul(tDotH)), 0.0, 1.0)), 10.0);
      const sheenAmp = sheen
        .mul(hAmp)
        .mul(t)
        .mul(smoothstep(40.0, 12.0, d))
        .mul(bristle.mul(0.7).add(0.3))
        .mul(0.5)
        .mul(crossH.mul(0.5).add(0.5));

      return vec4(paint.mul(relief).add(vec3(1.0, 0.96, 0.85).mul(sheenAmp)), 1.0);
    })();

    const geometry = new PlaneGeometry(1, 1, 1, 4);
    this.mesh = new InstancedMesh(geometry, material, slots);
    this.mesh.frustumCulled = false;
    this.streamer = new Streamer(cfg.tileSize, snapU, computeNode);
  }

  update(renderer: WebGPURenderer, camX: number, camZ: number): void {
    this.streamer.update(renderer, camX, camZ);
  }
}

// ---------------------------------------------------------------------------
// Flowers: stems + impasto heads from one placement
// ---------------------------------------------------------------------------

export interface FlowerConfig extends TileStream {
  readonly rOut: number;
}

export const FLOWER_CFG: FlowerConfig = { tileSize: 8, grid: 9, perTile: 120, rOut: 30 };

export class FlowerField {
  readonly stems: InstancedMesh;
  readonly heads: InstancedMesh;
  private readonly streamer: Streamer;

  constructor(fields: PaintFields, lut: PaletteLUT) {
    const cfg = FLOWER_CFG;
    const slots = cfg.grid * cfg.grid * cfg.perTile;
    const half = (cfg.grid - 1) / 2;

    // A: x, z, stem height, head azimuth   B: head size, tilt, palette row, rand
    const bufA = instancedArray(slots, "vec4");
    const bufB = instancedArray(slots, "vec4");
    const snapU = uniform(new Vector2(0, 0));

    const computeNode = Fn(() => {
      const i = instanceIndex;
      const tileIdx = i.div(cfg.perTile);
      const slot = i.mod(cfg.perTile).toFloat();
      const gx = tileIdx.mod(cfg.grid).toFloat().sub(half);
      const gz = tileIdx.div(cfg.grid).toFloat().sub(half);
      const tile = vec2(snapU.x.add(gx), snapU.y.add(gz)).toVar();

      const tileHash = hash(tile.x.mul(151.3).add(tile.y.mul(337.1)).add(fields.seedU));
      const r1 = hash(slot.mul(11.31).add(tileHash.mul(1024.0)));
      const r2 = hash(slot.mul(19.73).add(tileHash.mul(2048.0)).add(0.71));
      const r3 = hash(r1.mul(797.3).add(r2.mul(233.9)));
      const r4 = hash(r3.mul(613.1).add(slot));
      const r5 = hash(r4.mul(357.7).add(tileHash));

      const px = tile.x.add(r1).mul(cfg.tileSize);
      const pz = tile.y.add(r2).mul(cfg.tileSize);
      const p = vec2(px, pz).toVar();

      // Flowers live in drifts (the poppy-patch fields), never in shadow,
      // with a light scatter of loners so no view is flowerless.
      const drift = fields.n01(p, 0.09, 71.9);
      const patch = smoothstep(0.42, 0.7, drift);
      const open = float(1.0).sub(fields.shadowMask(p));
      const keep = patch.mul(0.9).max(0.07).mul(open);
      const alive = select(keep.greaterThan(hash(slot.mul(5.87).add(tileHash.mul(3.0)))), float(1.0), float(0.0));

      const stemH = mix(float(0.12), float(0.26), pow(r3, 1.3)).mul(alive);
      const headSize = mix(float(0.04), float(0.075), r4);
      const tilt = r5.mul(0.9).add(0.25); // rad from vertical, toward the sun-ish
      const azimuth = r2.mul(PI.mul(2.0));

      // Color script: poppy red dominates, dusty rose, cream, sun-yellow.
      const rC = hash(r5.mul(911.7).add(1.3));
      let cIdx: FloatExpr = float(7.0);
      cIdx = select(rC.greaterThan(0.62), float(6.0), cIdx);
      cIdx = select(rC.greaterThan(0.82), float(8.0), cIdx);
      cIdx = select(rC.greaterThan(0.93), float(1.0), cIdx);

      const lit = fields.litness(p);
      const rowPacked = cIdx.add(clamp(lit, 0.002, 0.998));
      bufA.element(i).assign(vec4(px, pz, stemH, azimuth));
      bufB.element(i).assign(vec4(headSize, tilt, rowPacked, r5));
    })().compute(slots);

    // ---- stems: thin dark-green rising strokes ----------------------------
    const stemMat = new NodeMaterial();
    const sA = bufA.element(instanceIndex);
    const sB = bufB.element(instanceIndex);
    const svA = varying(sA);

    stemMat.positionNode = Fn(() => {
      const across = uv().x.sub(0.5);
      const t = uv().y;
      const stemH = sA.z;
      const rand = sB.w;
      const az = hash(rand.mul(631.7)).mul(PI.mul(2.0));
      const side = vec3(cos(az), 0.0, sin(az));
      const leanDir = vec3(cos(sA.w), 0.0, sin(sA.w));
      const bend = t.mul(t).mul(0.18).mul(stemH);
      return vec3(sA.x, 0.02, sA.y)
        .add(side.mul(across.mul(0.011)))
        .add(leanDir.mul(bend))
        .add(vec3(0.0, t.mul(stemH), 0.0));
    })();

    const svB = varying(sB);

    stemMat.fragmentNode = Fn(() => {
      const stemH = svA.z;
      Discard(stemH.lessThan(0.01));
      const d = positionWorld.xz.sub(cameraPosition.xz).length();
      Discard(smoothstep(FLOWER_CFG.rOut, FLOWER_CFG.rOut * 0.8, d).lessThan(hash(svA.x.mul(77.7).add(svA.y))));
      const lit = svB.z.fract();
      const value = clamp(lit.mul(0.4).add(0.14), 0.02, 0.98);
      const paint = texture(lut.texture, vec2(value, float(3.5).div(lut.rows))).rgb;
      return vec4(paint, 1.0);
    })();

    // ---- heads: the thickest paint in the field ---------------------------
    const headMat = new NodeMaterial();
    const hA = bufA.element(instanceIndex);
    const hB = bufB.element(instanceIndex);
    const hvA = varying(hA);
    const hvB = varying(hB);

    headMat.positionNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const stemH = hA.z;
      const az = hA.w;
      const size = hB.x;
      const tilt = hB.y;

      // A daub plane tilted off vertical, facing sunward-ish; its center sits
      // at the stem top.
      const facing = vec3(cos(az), 0.0, sin(az));
      const side = vec3(sin(az), 0.0, cos(az).negate());
      const upT = mix(vec3(0.0, 1.0, 0.0), facing, tilt.mul(0.55));
      return vec3(hA.x, 0.015, hA.y)
        .add(vec3(0.0, stemH, 0.0))
        .add(side.mul(u.mul(size).mul(1.5)))
        .add(normalize(upT).mul(v.mul(size)));
    })();

    headMat.fragmentNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const stemH = hvA.z;
      const cIdx = hvB.z.floor();
      const lit = hvB.z.fract();
      const rand = hvB.w;

      Discard(stemH.lessThan(0.01));
      const d = positionWorld.xz.sub(cameraPosition.xz).length();
      Discard(smoothstep(FLOWER_CFG.rOut, FLOWER_CFG.rOut * 0.8, d).lessThan(hash(rand.mul(1341.1))));

      // Loose petal daub: radial mask broken by noise, a couple of lobes.
      const ang = v.atan(u);
      const lobes = sin(ang.mul(5.0).add(rand.mul(37.0))).mul(0.12);
      const radial = u.mul(u).add(v.mul(v)).mul(4.0);
      const edgeNoise = mx_noise_float(vec3(u.mul(6.0), v.mul(6.0), rand.mul(217.9))).mul(0.22);
      Discard(radial.add(lobes).add(edgeNoise).greaterThan(1.0));

      const bristle = mx_noise_float(vec3(u.mul(9.0), v.mul(9.0), rand.mul(139.7))).mul(0.5).add(0.5);

      // Flower heads carry the highest value and the thickest paint.
      const dither = hash(positionWorld.x.mul(59.3).add(positionWorld.z.mul(83.1))).sub(0.5).mul(0.05);
      let value = clamp(lit.mul(0.42).add(0.52).add(dither), 0.02, 0.98);
      // Poppy centers go dark — the near-black eye of the bloom.
      const isPoppy = cIdx.sub(7.0).abs().lessThan(0.25);
      const center = smoothstep(0.16, 0.06, radial);
      value = select(isPoppy, mix(value, float(0.04), center), value);

      const rowV = cIdx.add(0.5).div(lut.rows);
      const paint = texture(lut.texture, vec2(value, rowV)).rgb;

      // Heavy impasto: strong relief + sheen — light piles on the petals.
      const hAmp = lit.mul(0.7).add(0.3);
      const nTilt = vec3(u.mul(1.6), 1.0, v.mul(1.6));
      const n = normalize(nTilt.add(vec3(bristle.sub(0.5).mul(0.6), 0.0, 0.0)));
      const relief = clamp(n.dot(SUN), 0.0, 1.0).sub(0.5).mul(hAmp).mul(0.7).add(1.0);
      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const graze = pow(clamp(float(1.0).sub(n.dot(viewDir)), 0.0, 1.0), 1.4);
      const sheenAmp = graze.mul(hAmp).mul(smoothstep(30.0, 8.0, d)).mul(bristle).mul(0.55);

      return vec4(paint.mul(relief).add(vec3(1.0, 0.96, 0.88).mul(sheenAmp)), 1.0);
    })();

    this.stems = new InstancedMesh(new PlaneGeometry(1, 1, 1, 2), stemMat, slots);
    this.stems.frustumCulled = false;
    this.heads = new InstancedMesh(new PlaneGeometry(1, 1, 2, 2), headMat, slots);
    this.heads.frustumCulled = false;
    this.streamer = new Streamer(cfg.tileSize, snapU, computeNode);
  }

  update(renderer: WebGPURenderer, camX: number, camZ: number): void {
    this.streamer.update(renderer, camX, camZ);
  }
}
