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
import type { PaintFields } from "./fields";
import type { PaletteLUT } from "./palette";

/**
 * The edge pass, done with paint instead of a filter: occasional dark
 * accents where a painter would place one — short deep-cool ticks laid along
 * the boundaries of the shadow masses, where one value plane meets another.
 * Everywhere else edges stay untouched (the haze and shared atmosphere
 * handle the lost edges). World-anchored like every other stroke; nothing
 * screen-space, nothing uniform-outline.
 */

const TILE = 16;
const GRID = 7;
const PER_TILE = 56;

type ComputeNode = Parameters<WebGPURenderer["computeAsync"]>[0];

export class AccentStrokes {
  readonly mesh: InstancedMesh;
  private readonly computeNode: ComputeNode;
  private readonly snapU: UniformNode<"vec2", Vector2>;
  private readonly snap = new Vector2(Number.NaN, Number.NaN);

  constructor(fields: PaintFields, lut: PaletteLUT) {
    const slots = GRID * GRID * PER_TILE;
    const half = (GRID - 1) / 2;

    // A: x, z, angle, length   B: width, alive, palette row, rand
    const bufA = instancedArray(slots, "vec4");
    const bufB = instancedArray(slots, "vec4");
    this.snapU = uniform(new Vector2(0, 0));
    const snapU = this.snapU;

    this.computeNode = Fn(() => {
      const i = instanceIndex;
      const tileIdx = i.div(PER_TILE);
      const slot = i.mod(PER_TILE).toFloat();
      const gx = tileIdx.mod(GRID).toFloat().sub(half);
      const gz = tileIdx.div(GRID).toFloat().sub(half);
      const tile = vec2(snapU.x.add(gx), snapU.y.add(gz)).toVar();

      const tileHash = hash(tile.x.mul(173.9).add(tile.y.mul(419.3)).add(fields.seedU));
      const r1 = hash(slot.mul(6.71).add(tileHash.mul(1024.0)));
      const r2 = hash(slot.mul(15.43).add(tileHash.mul(2048.0)).add(0.29));
      const r3 = hash(r1.mul(769.1).add(r2.mul(201.7)));
      const r4 = hash(r3.mul(577.9).add(slot));

      const px = tile.x.add(r1).mul(TILE);
      const pz = tile.y.add(r2).mul(TILE);

      // Accents live on the shadow-mass boundary: probe the mask's gradient.
      const eps = 0.9;
      const sxp = fields.shadowMask(vec2(px.add(eps), pz).toVar());
      const sxn = fields.shadowMask(vec2(px.sub(eps), pz).toVar());
      const szp = fields.shadowMask(vec2(px, pz.add(eps)).toVar());
      const szn = fields.shadowMask(vec2(px, pz.sub(eps)).toVar());
      const gradX = sxp.sub(sxn);
      const gradZ = szp.sub(szn);
      const gradMag = gradX.mul(gradX).add(gradZ.mul(gradZ));

      // Sparse: a boundary AND a dice roll. The tick lies along the boundary
      // (perpendicular to the gradient), the way an accent follows the form.
      const alive = select(gradMag.greaterThan(0.06).and(r3.lessThan(0.4)), float(1.0), float(0.0));
      const angle = gradZ.atan(gradX).add(PI.mul(0.5)).add(r4.sub(0.5).mul(0.5));
      const len = mix(float(0.16), float(0.42), r4).mul(alive);
      const wid = mix(float(0.035), float(0.06), r1);

      // Deep cool rows only: the cool grass note or the hedgerow dark.
      const row = select(r2.lessThan(0.6), float(2.0), float(4.0));

      bufA.element(i).assign(vec4(px, pz, angle, len));
      bufB.element(i).assign(vec4(wid, alive, row, r4));
    })().compute(slots);

    const material = new NodeMaterial();
    const recA = bufA.element(instanceIndex);
    const recB = bufB.element(instanceIndex);
    const vB = varying(recB);

    material.positionNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const angle = recA.z;
      const len = recA.w;
      const wid = recB.x;
      const dir = vec2(cos(angle), sin(angle));
      const side = vec2(sin(angle), cos(angle).negate());
      const off = dir.mul(u.mul(len)).add(side.mul(v.mul(wid)));
      return vec3(recA.x.add(off.x), 0.052, recA.y.add(off.y));
    })();

    material.fragmentNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const alive = vB.y;
      const row = vB.z;
      const rand = vB.w;

      Discard(alive.lessThan(0.5));

      const edgeNoise = mx_noise_float(vec3(u.mul(6.0), v.mul(3.0), rand.mul(287.3)));
      const endMask = smoothstep(0.5, 0.3, abs(u).add(edgeNoise.mul(0.12)));
      const sideMask = smoothstep(0.5, 0.26, abs(v).add(edgeNoise.mul(0.18)));
      Discard(endMask.mul(sideMask).lessThan(0.4));

      // Accents matter near the eye; they erode away with distance.
      const d = positionWorld.xz.sub(cameraPosition.xz).length();
      Discard(smoothstep(46.0, 30.0, d).lessThan(hash(rand.mul(1911.3))));

      // Deep, never black: the darkest LUT step of a cool row.
      const dither = hash(positionWorld.x.mul(71.9).add(positionWorld.z.mul(43.7))).sub(0.5).mul(0.04);
      const value = clamp(float(0.09).add(rand.mul(0.08)).add(dither), 0.02, 0.3);
      const paint = texture(lut.texture, vec2(value, row.add(0.5).div(lut.rows))).rgb;
      return vec4(paint, 1.0);
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
