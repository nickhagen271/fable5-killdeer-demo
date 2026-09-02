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
import { PaintFields, SUN } from "./fields";
import type { PaletteLUT } from "./palette";
import type { WindField } from "./wind";

/**
 * Upright vegetation strokes: grass blades and wildflowers. Same contract as
 * the ground strokes — world-anchored instanced ribbons, GPU-placed
 * deterministically per (world tile, slot, seed), tile-streamed, stochastic
 * ring erosion — but these RISE. Grass strokes follow growth direction
 * (reference note: "grass strokes rise"), tips catch the light and carry the
 * impasto; flower heads are the thickest paint in the field.
 */

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
  { name: "grass-near", tileSize: 4, grid: 9, perTile: 640, height: 0.13, width: 0.05, rIn: 0, rOut: 10 },
  { name: "grass-mid", tileSize: 12, grid: 7, perTile: 340, height: 0.22, width: 0.09, rIn: 7, rOut: 24 },
];

export class GrassLOD {
  readonly mesh: InstancedMesh;
  private readonly streamer: Streamer;

  constructor(cfg: GrassLODConfig, fields: PaintFields, lut: PaletteLUT, wind: WindField) {
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

      // Color: greens; warm-lit blades in the warm drifts, cool greens in
      // shadow. Flower and soil rows never appear in grass.
      const drift = fields.n01(p, 0.045, 0.0);
      const rPick = hash(r6.mul(517.7).add(9.1));
      const greens = select(rPick.lessThan(0.55), float(0.0), select(rPick.lessThan(0.85), float(1.0), float(2.0)));
      const dry = float(1.0);
      const warmProb = smoothstep(0.55, 0.9, drift).mul(0.25);
      let cIdx = select(hash(r2.mul(731.3)).lessThan(warmProb), dry, greens);
      cIdx = select(fields.shadowMask(p).mul(0.9).greaterThan(hash(r4.mul(211.7))), float(2.0), cIdx);

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
      // Wind: the blade bows downwind, quadratic in t so the root stays
      // planted. Amplitude scales with blade height — tall blades ride the
      // gusts, short tufts barely stir. Time is frozen in harness mode.
      const windDisp = wind
        .displacement(vec2(recA.x, recA.y), rand, 0.16)
        .mul(t.mul(t).mul(height.mul(3.2).min(1.2)));
      const pos = vec3(recA.x, 0.02, recA.y)
        .add(side.mul(across.mul(width).mul(taper)))
        .add(leanDir.mul(bend))
        .add(vec3(0.0, t.mul(height).mul(float(1.0).sub(lean.mul(bend).mul(0.3))), 0.0))
        .add(windDisp);
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
// Flowers: camera-facing palette-knife dabs (Pillar A1)
// ---------------------------------------------------------------------------

export interface FlowerConfig extends TileStream {
  readonly rOut: number;
}

/**
 * A flower is one to three overlapping DABS of pure palette color — not a
 * mesh with petals. Slots come in threes sharing one base position: dab 0
 * always lives, dabs 1–2 roll for existence, each offset a little and
 * rotated, so blooms read as loaded double-touches of the knife. Big dabs at
 * the feet (a rare XL class carries the ref_d foreground), specks by 30 m,
 * eroded away entirely by 80 m.
 */
export const FLOWER_CFG: FlowerConfig = { tileSize: 8, grid: 21, perTile: 36, rOut: 80 };

export class FlowerField {
  readonly mesh: InstancedMesh;
  private readonly streamer: Streamer;

  constructor(fields: PaintFields, lut: PaletteLUT, wind: WindField) {
    const cfg = FLOWER_CFG;
    const slots = cfg.grid * cfg.grid * cfg.perTile;
    const half = (cfg.grid - 1) / 2;

    // A: x, z, hover height, dab size   B: in-plane angle, aspect, row+lit, rand
    const bufA = instancedArray(slots, "vec4");
    const bufB = instancedArray(slots, "vec4");
    const snapU = uniform(new Vector2(0, 0));

    const computeNode = Fn(() => {
      const i = instanceIndex;
      const tileIdx = i.div(cfg.perTile);
      const slot = i.mod(cfg.perTile).toFloat();
      const group = slot.div(3.0).floor(); // three dab slots per bloom
      const sub = slot.mod(3.0);
      const gx = tileIdx.mod(cfg.grid).toFloat().sub(half);
      const gz = tileIdx.div(cfg.grid).toFloat().sub(half);
      const tile = vec2(snapU.x.add(gx), snapU.y.add(gz)).toVar();

      const tileHash = hash(tile.x.mul(151.3).add(tile.y.mul(337.1)).add(fields.seedU));
      const r1 = hash(group.mul(11.31).add(tileHash.mul(1024.0)));
      const r2 = hash(group.mul(19.73).add(tileHash.mul(2048.0)).add(0.71));
      const r3 = hash(r1.mul(797.3).add(r2.mul(233.9)));
      const r4 = hash(r3.mul(613.1).add(group));
      const r5 = hash(r4.mul(357.7).add(tileHash));
      const rSub = hash(r5.mul(147.9).add(sub.mul(53.7)));

      const bx = tile.x.add(r1).mul(cfg.tileSize);
      const bz = tile.y.add(r2).mul(cfg.tileSize);
      const p = vec2(bx, bz).toVar();

      // Blooms live in drifts, never in shadow masses, with a light scatter
      // of loners so no view is flowerless.
      const drift = fields.n01(p, 0.09, 71.9);
      const patch = smoothstep(0.42, 0.72, drift);
      const open = float(1.0).sub(fields.shadowMask(p));
      const keep = patch.mul(0.85).max(0.06).mul(open);
      const bloomAlive = select(keep.greaterThan(hash(group.mul(5.87).add(tileHash.mul(3.0)))), float(1.0), float(0.0));
      // Dab 0 always; dabs 1–2 are the overlapping second and third touches.
      const dabAlive = select(sub.lessThan(0.5), float(1.0), select(rSub.lessThan(0.72), float(1.0), float(0.0)));
      const alive = bloomAlive.mul(dabAlive);

      // Size: many small touches, a rare XL foreground dab; later touches of
      // one bloom are a bit smaller than the first.
      let size = mix(float(0.045), float(0.11), pow(r3, 1.7));
      size = size.mul(select(hash(r3.mul(719.3)).greaterThan(0.95), float(1.5), float(1.0)));
      size = size.mul(select(sub.lessThan(0.5), float(1.0), float(0.78))).mul(alive);

      // Dab offset within the bloom and hover height ("stems" are unseen).
      const offAng = rSub.mul(PI.mul(2.0));
      const offR = select(sub.lessThan(0.5), float(0.0), size.mul(rSub.mul(0.5).add(0.35)));
      const px = bx.add(cos(offAng).mul(offR));
      const pz = bz.add(sin(offAng).mul(offR));
      const hover = mix(float(0.06), float(0.24), pow(r4, 1.4)).add(rSub.mul(0.03));

      // Species: a slow field picks the local dominant; most blooms follow
      // it, the rest scatter across the palette's five dab rows.
      const speciesField = fields.n01(p, 0.03, 203.9);
      const dominant = clamp(speciesField.mul(5.0).floor(), 0.0, 4.0).add(7.0);
      const rC = hash(r5.mul(911.7).add(1.3));
      const scatterPick = clamp(hash(rC.mul(577.1)).mul(5.0).floor(), 0.0, 4.0).add(7.0);
      const cIdx = select(rC.lessThan(0.62), dominant, scatterPick);

      const lit = fields.litness(p);
      const rowPacked = cIdx.add(clamp(lit, 0.002, 0.998));
      const angle = r5.mul(PI.mul(2.0)).add(sub.mul(1.9));
      const aspect = mix(float(1.15), float(1.6), r4);

      bufA.element(i).assign(vec4(px, pz, hover, size));
      bufB.element(i).assign(vec4(angle, aspect, rowPacked, rSub));
    })().compute(slots);

    const material = new NodeMaterial();
    const dA = bufA.element(instanceIndex);
    const dB = bufB.element(instanceIndex);
    const dvA = varying(dA);
    const dvB = varying(dB);

    material.positionNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const size = dA.w;
      const angle = dB.x;
      const aspect = dB.y;
      const rand = dB.w;

      const center = vec3(dA.x, dA.z, dA.y).toVar();
      const windDisp = wind.displacement(vec2(dA.x, dA.y), rand, 0.2).mul(dA.z.mul(3.0).min(1.1));
      center.addAssign(windDisp);

      // Camera-facing frame (the dab is a touch of paint on the picture
      // plane), rotated in-plane per dab.
      const fwd = normalize(cameraPosition.sub(center));
      const right = normalize(vec3(0.0, 1.0, 0.0).cross(fwd));
      const upv = fwd.cross(right);
      const ru = u.mul(cos(angle)).sub(v.mul(sin(angle)));
      const rv = u.mul(sin(angle)).add(v.mul(cos(angle)));
      return center.add(right.mul(ru.mul(size).mul(aspect))).add(upv.mul(rv.mul(size)));
    })();

    material.fragmentNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const size = dvA.w;
      const cIdx = dvB.z.floor();
      const lit = dvB.z.fract();
      const rand = dvB.w;

      Discard(size.lessThan(0.004));
      const d = positionWorld.xz.sub(cameraPosition.xz).length();
      Discard(smoothstep(FLOWER_CFG.rOut, FLOWER_CFG.rOut * 0.6, d).lessThan(hash(rand.mul(1341.1))));

      // The dab footprint: a fat rounded knife touch, edge broken by noise,
      // one side slightly squared where the knife lifted.
      const radial = u.mul(u).mul(4.0).add(v.mul(v).mul(4.0));
      const edgeNoise = mx_noise_float(vec3(u.mul(5.0), v.mul(5.0), rand.mul(217.9))).mul(0.3);
      const liftEdge = smoothstep(0.1, 0.45, u.add(0.5)).mul(0.12);
      Discard(radial.add(edgeNoise).sub(liftEdge).greaterThan(1.0));

      const bristle = mx_noise_float(vec3(u.mul(7.0), v.mul(3.0), rand.mul(139.7))).mul(0.5).add(0.5);

      // Dabs are pure color and the thickest paint in the field: high value,
      // one plane per touch, knife-drag streaks inside.
      const dither = hash(positionWorld.x.mul(59.3).add(positionWorld.z.mul(83.1))).sub(0.5).mul(0.04);
      const touchJitter = hash(rand.mul(391.3)).sub(0.5).mul(0.14);
      const value = clamp(lit.mul(0.28).add(0.64).add(touchJitter).add(dither), 0.3, 0.98);
      const rowV = cIdx.add(0.5).div(lut.rows);
      const paint = texture(lut.texture, vec2(value, rowV)).rgb;

      // Heavy impasto: relief across the dab, glints near the camera.
      const n = normalize(vec3(u.mul(1.5), 1.0, v.mul(1.5)).add(vec3(bristle.sub(0.5).mul(0.7), 0.0, 0.0)));
      const relief = clamp(n.dot(SUN), 0.0, 1.0).sub(0.5).mul(0.65).add(1.0);
      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const graze = pow(clamp(float(1.0).sub(n.dot(viewDir)), 0.0, 1.0), 1.4);
      const sheenAmp = graze.mul(smoothstep(30.0, 8.0, d)).mul(bristle).mul(0.5);

      return vec4(paint.mul(relief).add(vec3(1.0, 0.96, 0.88).mul(sheenAmp)), 1.0);
    })();

    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1, 2, 2), material, slots);
    this.mesh.frustumCulled = false;
    this.streamer = new Streamer(cfg.tileSize, snapU, computeNode);
  }

  update(renderer: WebGPURenderer, camX: number, camZ: number): void {
    this.streamer.update(renderer, camX, camZ);
  }
}
