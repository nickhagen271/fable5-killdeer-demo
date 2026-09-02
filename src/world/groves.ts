import { InstancedMesh, NodeMaterial, PlaneGeometry, Vector2, type WebGPURenderer } from "three/webgpu";
import {
  Discard,
  Fn,
  PI,
  abs,
  cameraPosition,
  clamp,
  cos,
  float,
  hash,
  instanceIndex,
  instancedArray,
  mix,
  mx_noise_float,
  positionWorld,
  pow,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type UniformNode from "three/src/nodes/core/UniformNode.js";
import { SUN, type PaintFields } from "../paint/fields";
import type { AtmosphereUniforms, PaletteLUT } from "../paint/palette";
import type { Terrain } from "./terrain";

/**
 * Streamed tree masses and hedgerow lines (Pillar C): the middle band of the
 * horizon composition, generated per world tile on the GPU exactly like the
 * ground strokes, so groves drift into the mid-distance and pass as the bird
 * travels — no ring, no repeats, no edge. Same painted language as v1's
 * treeline: stacked foliage daubs, cool and dark, dissolving into the
 * palette's atmosphere; every mass seats on the terrain.
 *
 * Slot layout per tile (SLOTS_PER_TILE):
 *   0..79   crown daubs of the tile's single potential tree (gated ~38%)
 *   80..95  understory skirt daubs
 *   96..99  trunk strokes
 *   100..127 hedgerow daubs — alive only where the hedge ridge field runs
 */

const TILE = 48;
const GRID = 13;
const SLOTS_PER_TILE = 128;
const CROWN_END = 80;
const SKIRT_END = 96;
const TRUNK_END = 100;

type ComputeNode = Parameters<WebGPURenderer["computeAsync"]>[0];

export class Groves {
  readonly mesh: InstancedMesh;
  private readonly computeNode: ComputeNode;
  private readonly snapU: UniformNode<"vec2", Vector2>;
  private readonly snap = new Vector2(Number.NaN, Number.NaN);

  constructor(fields: PaintFields, lut: PaletteLUT, atm: AtmosphereUniforms, terrain: Terrain) {
    const slots = GRID * GRID * SLOTS_PER_TILE;
    const half = (GRID - 1) / 2;

    // A: center.xyz, len·100+rand      B: azimuth, pitch, wid, row·10+value·9
    const bufA = instancedArray(slots, "vec4");
    const bufB = instancedArray(slots, "vec4");
    this.snapU = uniform(new Vector2(0, 0));
    const snapU = this.snapU;

    this.computeNode = Fn(() => {
      const i = instanceIndex;
      const tileIdx = i.div(SLOTS_PER_TILE);
      const slot = i.mod(SLOTS_PER_TILE).toFloat();
      const gx = tileIdx.mod(GRID).toFloat().sub(half);
      const gz = tileIdx.div(GRID).toFloat().sub(half);
      const tile = vec2(snapU.x.add(gx), snapU.y.add(gz)).toVar();

      const tileHash = hash(tile.x.mul(211.7).add(tile.y.mul(457.1)).add(fields.seedU));
      const r1 = hash(slot.mul(7.91).add(tileHash.mul(1024.0)));
      const r2 = hash(slot.mul(13.57).add(tileHash.mul(2048.0)).add(0.43));
      const r3 = hash(r1.mul(661.7).add(r2.mul(149.3)));
      const r4 = hash(r3.mul(521.3).add(slot));
      const r5 = hash(r4.mul(347.9).add(tileHash));

      // --- the tile's single potential tree ---------------------------------
      // Trees come in drifts: a slow grove field makes some regions treeless
      // and others grove-y, so masses pass in occasional clumps and loners.
      const siteRand = hash(tileHash.mul(717.9));
      const siteX = tile.x.add(hash(tileHash.mul(91.3))).mul(TILE);
      const siteZ = tile.y.add(hash(tileHash.mul(37.7))).mul(TILE);
      const groveN = fields.n01(vec2(siteX, siteZ), 0.006, 733.7);
      const treeAlive = select(siteRand.lessThan(groveN.mul(0.5)), float(1.0), float(0.0));
      const siteGround = terrain.height(vec2(siteX, siteZ));

      const poplar = select(hash(tileHash.mul(517.3)).lessThan(0.2), float(1.0), float(0.0));
      const treeH = mix(mix(float(9.0), float(14.0), hash(tileHash.mul(211.1))), mix(float(14.0), float(22.0), hash(tileHash.mul(211.1))), poplar);
      const crownR = mix(mix(float(6.5), float(11.0), hash(tileHash.mul(613.9))), mix(float(2.2), float(3.4), hash(tileHash.mul(613.9))), poplar);
      const crownBase = treeH.mul(mix(float(0.35), float(0.18), poplar));

      const isCrown = slot.lessThan(CROWN_END);
      const isSkirt = slot.greaterThanEqual(CROWN_END).and(slot.lessThan(SKIRT_END));
      const isTrunk = slot.greaterThanEqual(SKIRT_END).and(slot.lessThan(TRUNK_END));
      const isHedge = slot.greaterThanEqual(TRUNK_END);

      // Crown daubs: canopy shell, gently biased upward.
      const t = pow(r1, 0.85);
      const shellY = crownBase.add(t.mul(treeH.sub(crownBase)));
      // Filled canopy (not a hollow shell): daubs all the way to the axis so
      // the mass reads solid from any side.
      const shellR = crownR
        .mul(pow(float(1.0).sub(t.mul(t).mul(0.85)).max(0.15), 0.5))
        .mul(mix(float(0.12), float(0.9), pow(r2, 0.7)));
      const theta = r3.mul(PI.mul(2.0));
      const crownX = siteX.add(cos(theta).mul(shellR));
      const crownZ = siteZ.add(sin(theta).mul(shellR).mul(0.8));

      // Lit side toward the sun's azimuth; tops lighter.
      const sunSide = cos(theta).mul(SUN.x.sign().negate()).add(1.0).mul(0.5);
      const litAmt = t.mul(0.6).add(sunSide.mul(0.4)).min(1.0);
      const crownRow = select(litAmt.greaterThan(0.82), float(1.0), select(litAmt.greaterThan(0.45), float(2.0), float(4.0)));
      const crownValue = litAmt.mul(0.32).add(0.12).add(r4.sub(0.5).mul(0.1)).clamp(0.05, 0.8);
      const crownLen = mix(mix(float(3.4), float(5.8), r4), mix(float(2.2), float(3.6), r4), poplar).mul(t.mul(0.3).add(0.75));
      const crownWid = mix(float(1.6), float(2.9), r5);
      const crownAz = theta.add(PI.mul(0.5)).add(r5.sub(0.5).mul(0.9));
      const crownPitch = r4.sub(0.43).mul(0.55);

      // Skirt daubs: broad dark understory seating the mass on the ground.
      const skTheta = r1.mul(PI.mul(2.0));
      const skR = crownR.mul(mix(float(0.4), float(1.15), r2));
      const skX = siteX.add(cos(skTheta).mul(skR));
      const skZ = siteZ.add(sin(skTheta).mul(skR).mul(0.8));
      const skY = mix(float(0.4), float(2.2), r3);

      // Trunk strokes: short dark verticals under the crown.
      const trX = siteX.add(r1.sub(0.5).mul(2.4));
      const trZ = siteZ.add(r2.sub(0.5).mul(2.4));

      // Hedgerow: daubs alive only on the ridge lines of a slow field —
      // broken dark bands wandering through the meadow and passing by.
      const hx = tile.x.add(r1).mul(TILE);
      const hz = tile.y.add(r2).mul(TILE);
      const hedgeN = fields.n01(vec2(hx, hz), 0.011, 601.3);
      const onRidge = smoothstep(0.045, 0.02, abs(hedgeN.sub(0.5)));
      const hedgeAlive = select(onRidge.mul(0.9).greaterThan(hash(r3.mul(881.3))), float(1.0), float(0.0));
      // Daubs lie ALONG the ridge line: perpendicular to the field gradient.
      const heps = float(1.6);
      const hgx = fields.n01(vec2(hx.add(heps), hz), 0.011, 601.3).sub(fields.n01(vec2(hx.sub(heps), hz), 0.011, 601.3));
      const hgz = fields.n01(vec2(hx, hz.add(heps)), 0.011, 601.3).sub(fields.n01(vec2(hx, hz.sub(heps)), 0.011, 601.3));
      const hedgeAz = hgz.atan(hgx).add(PI.mul(0.5)).add(r5.sub(0.5).mul(0.3));
      const hedgeGround = terrain.height(vec2(hx, hz));
      const hedgeY = mix(float(0.5), float(2.6), pow(r4, 1.3));
      const hedgeRow = select(hash(r5.mul(313.7)).lessThan(0.8), float(4.0), float(2.0));
      const hedgeValue = r4.mul(0.16).add(0.08);

      // --- select the slot's record -----------------------------------------
      const alive = select(isHedge, hedgeAlive, treeAlive).toVar();

      const cx = select(isCrown, crownX, select(isSkirt, skX, select(isTrunk, trX, hx))).toVar();
      const cz = select(isCrown, crownZ, select(isSkirt, skZ, select(isTrunk, trZ, hz))).toVar();
      const localY = select(isCrown, shellY, select(isSkirt, skY, select(isTrunk, crownBase.mul(0.55), hedgeY)));
      const cy = select(isHedge, hedgeGround, siteGround).add(localY);

      const len = select(
        isCrown,
        crownLen,
        select(isSkirt, mix(float(4.5), float(8.0), r4), select(isTrunk, crownBase.mul(1.15), mix(float(2.2), float(4.6), r4))),
      ).mul(alive);
      const wid = select(isCrown, crownWid, select(isSkirt, mix(float(1.8), float(3.2), r5), select(isTrunk, mix(float(0.35), float(0.6), r5), mix(float(0.9), float(1.7), r5))));
      const az = select(isTrunk, float(0.0), select(isHedge, hedgeAz, crownAz));
      const pitch = select(isTrunk, float(PI.mul(0.5)), select(isCrown, crownPitch, r4.sub(0.5).mul(0.1)));
      const row = select(isCrown, crownRow, select(isTrunk, float(14.0), select(isSkirt, float(4.0), hedgeRow)));
      const value = select(isCrown, crownValue, select(isSkirt, r3.mul(0.1).add(0.08), select(isTrunk, r3.mul(0.06).add(0.1), hedgeValue)));

      const lenRand = len.mul(100.0).floor().add(r5.min(0.99));
      const rowValue = row.mul(10.0).add(value.clamp(0.0, 0.99).mul(9.0));
      bufA.element(i).assign(vec4(cx, cy, cz, lenRand));
      bufB.element(i).assign(vec4(az, pitch, wid, rowValue));
    })().compute(slots);

    // ---- material: the treeline ribbon, driven from the streamed buffers ---
    const material = new NodeMaterial();
    const recA = bufA.element(instanceIndex);
    const recB = bufB.element(instanceIndex);
    const vB = varying(recB);
    const vRand = varying(recA.w.fract());
    const vLen = varying(recA.w.floor());

    material.positionNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const center = recA.xyz;
      const len = recA.w.floor().mul(0.01);
      const rand = recA.w.fract();
      const az = recB.x;
      const pitch = recB.y;
      const wid = recB.z;

      const cp = cos(pitch);
      const dir = vec3(cp.mul(cos(az)), sin(pitch), cp.mul(sin(az)));
      const sideH = vec3(sin(az).negate(), 0.0, cos(az));
      const upness = abs(sin(pitch)).mul(0.85).add(0.15);
      const side = mix(vec3(0.0, 1.0, 0.0), sideH, upness).normalize();

      const arc = u.mul(u).mul(4.0).sub(1.0).mul(rand.sub(0.5)).mul(wid).mul(0.4);
      return center.add(dir.mul(u.mul(len))).add(side.mul(v.mul(wid).add(arc)));
    })();

    material.fragmentNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const row = vB.w.mul(0.1).floor();
      const value = vB.w.sub(row.mul(10.0)).div(9.0);
      const rand = vRand;

      Discard(vLen.lessThan(0.5)); // gated-out slots (no tree, no ridge)

      const edgeNoise = mx_noise_float(vec3(u.mul(4.0), v.mul(3.0), rand.mul(311.7)));
      const endMask = smoothstep(0.5, 0.3, abs(u).add(edgeNoise.mul(0.16)));
      const sideMask = smoothstep(0.5, 0.26, abs(v).add(edgeNoise.mul(0.2)));
      Discard(endMask.mul(sideMask).lessThan(0.4));

      // Masses live in the middle distance: erode in close (the bird passes
      // beside them, never through a wall of paint) and melt far into haze.
      const d = positionWorld.xz.sub(cameraPosition.xz).length();
      const visNear = smoothstep(48.0, 90.0, d);
      const visFar = smoothstep(320.0, 240.0, d).mul(0.75).add(0.25);
      Discard(visNear.mul(visFar).lessThan(hash(rand.mul(1637.3))));

      const bristle = mx_noise_float(vec3(v.mul(6.0), u.mul(3.0), rand.mul(157.3))).mul(0.5).add(0.5);
      const dither = hash(positionWorld.x.mul(31.7).add(positionWorld.y.mul(57.3))).sub(0.5).mul(0.05);
      const vFinal = clamp(value.add(bristle.sub(0.5).mul(0.12)).add(dither), 0.03, 0.95);
      const paint = texture(lut.texture, vec2(vFinal, row.add(0.5).div(lut.rows))).rgb;

      // Seated in the atmosphere: cool far-band shift, then the haze.
      const farBand = smoothstep(120.0, 320.0, d);
      const cooled = mix(paint, atm.farField, farBand.mul(0.42));
      const hazeAmt = smoothstep(220.0, 460.0, d).mul(0.75);
      const finalColor = mix(cooled, atm.haze, hazeAmt);

      return vec4(finalColor, 1.0);
    })();

    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1, 2, 1), material, slots);
    this.mesh.frustumCulled = false;
  }

  update(renderer: WebGPURenderer, camX: number, camZ: number): void {
    const sx = Math.floor(camX / TILE);
    const sz = Math.floor(camZ / TILE);
    if (sx === this.snap.x && sz === this.snap.y) return;
    this.snap.set(sx, sz);
    this.snapU.value.set(sx, sz);
    void renderer.computeAsync(this.computeNode);
  }
}
