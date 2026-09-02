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
  vertexStage,
  cameraPosition,
  positionWorld,
} from "three/tsl";
import type UniformNode from "three/src/nodes/core/UniformNode.js";
import { PaintFields, SUN } from "./fields";
import type { PaletteLUT } from "./palette";

/**
 * The world-anchored stroke field — the temporal-anchoring solution.
 *
 * Strokes are instanced paint ribbons laid flat on the ground in WORLD space.
 * A compute kernel places them deterministically from (world tile, slot,
 * seed); the camera streams tiles by moving a snapped grid origin, but a
 * given world tile always regenerates the identical strokes. Because every
 * stroke is geometry fixed in the world, camera motion reprojects it exactly
 * like any other surface: there is no screen-space term anywhere, so there is
 * nothing that can swim. LOD rings keep stroke screen size roughly constant
 * with distance; ring transitions erode stroke-by-stroke (stochastic,
 * camera-distance driven), never by popping tiles.
 */

export interface StrokeLODConfig {
  readonly name: string;
  /** World tile size in meters; tiles regenerate as a grid around the camera. */
  readonly tileSize: number;
  /** Odd grid width in tiles, centered on the camera's tile. */
  readonly grid: number;
  readonly strokesPerTile: number;
  readonly length: number;
  readonly width: number;
  /** Ring band: strokes erode in below rIn and out beyond rOut. */
  readonly rIn: number;
  readonly rOut: number;
  /** Base lift above the underpaint; higher LODs stack on lower ones. */
  readonly yBase: number;
}

export const STROKE_LODS: readonly StrokeLODConfig[] = [
  { name: "far", tileSize: 32, grid: 11, strokesPerTile: 340, length: 3.6, width: 0.68, rIn: 38, rOut: 165, yBase: 0.004 },
  { name: "mid", tileSize: 16, grid: 7, strokesPerTile: 500, length: 1.15, width: 0.3, rIn: 10, rOut: 48, yBase: 0.018 },
  { name: "near", tileSize: 4, grid: 9, strokesPerTile: 340, length: 0.5, width: 0.075, rIn: 0, rOut: 13, yBase: 0.032 },
];

type ComputeNode = Parameters<WebGPURenderer["computeAsync"]>[0];

export class StrokeLOD {
  readonly mesh: InstancedMesh;
  private readonly cfg: StrokeLODConfig;
  private readonly computeNode: ComputeNode;
  private readonly snapU: UniformNode<"vec2", Vector2>;
  private readonly snap = new Vector2(Number.NaN, Number.NaN);

  constructor(cfg: StrokeLODConfig, fields: PaintFields, lut: PaletteLUT) {
    this.cfg = cfg;
    const slots = cfg.grid * cfg.grid * cfg.strokesPerTile;
    const half = (cfg.grid - 1) / 2;

    // Two vec4 records per stroke:
    //   A: center.x, center.z, flow angle, length
    //   B: width, impasto amplitude, palette row, stroke random
    const bufA = instancedArray(slots, "vec4");
    const bufB = instancedArray(slots, "vec4");

    this.snapU = uniform(new Vector2(0, 0));
    const snapU = this.snapU;
    const perTile = cfg.strokesPerTile;
    const grid = cfg.grid;

    // ---- placement kernel (GPU) -------------------------------------------
    this.computeNode = Fn(() => {
      const i = instanceIndex;
      const tileIdx = i.div(perTile);
      const slot = i.mod(perTile).toFloat();

      const gx = tileIdx.mod(grid).toFloat().sub(half);
      const gz = tileIdx.div(grid).toFloat().sub(half);
      const tile = vec2(snapU.x.add(gx), snapU.y.add(gz)).toVar();

      // World-tile identity → deterministic strokes regardless of grid slot.
      const tileHash = hash(tile.x.mul(127.1).add(tile.y.mul(311.7)).add(fields.seedU));
      const r1 = hash(slot.mul(7.13).add(tileHash.mul(1024.0)));
      const r2 = hash(slot.mul(13.87).add(tileHash.mul(2048.0)).add(0.618));
      const r3 = hash(r1.mul(913.1).add(r2.mul(217.7)));
      const r4 = hash(r3.mul(701.3).add(slot));
      const r5 = hash(r4.mul(419.7).add(tileHash));
      const r6 = hash(r5.mul(325.9).add(r1.mul(97.7)));
      const r7 = hash(r6.mul(587.1).add(r2.mul(41.3)));

      const px = tile.x.add(r1).mul(cfg.tileSize);
      const pz = tile.y.add(r2).mul(cfg.tileSize);
      const p = vec2(px, pz).toVar();

      const lit = fields.litness(p);
      const angle = fields.flowAngle(p).add(r3.sub(0.5).mul(0.55));
      // Skewed size distribution: many small touches, occasional broad
      // loaded passages — one brush never leaves uniform marks.
      const len = float(cfg.length).mul(mix(float(0.55), float(1.75), pow(r4, 1.6)));
      const wid = float(cfg.width).mul(mix(float(0.6), float(1.6), pow(r5, 1.6)));

      // Impasto follows the light: thick where lit, thin in shadow.
      const hAmp = mix(float(0.12), float(1.0), pow(lit, 1.5)).mul(r6.mul(0.5).add(0.72));
      const cIdx = fields.colorIndex(p, r7);

      bufA.element(i).assign(vec4(px, pz, angle, len));
      bufB.element(i).assign(vec4(wid, hAmp, cIdx, r7));
    })().compute(slots);

    // ---- material ---------------------------------------------------------
    const material = new NodeMaterial();

    const recA = bufA.element(instanceIndex);
    const recB = bufB.element(instanceIndex);
    const vA = varying(recA);
    const vB = varying(recB);

    material.positionNode = Fn(() => {
      const u = uv().x.sub(0.5); // along stroke
      const v = uv().y.sub(0.5); // across stroke
      const angle = recA.z;
      const len = recA.w;
      const wid = recB.x;
      const hAmp = recB.y;
      const rand = recB.w;

      const dir = vec2(cos(angle), sin(angle));
      // side chosen so cross(dir, side) faces +Y: the ribbon shows the paint,
      // not its backface, and survives front-face culling.
      const side = vec2(sin(angle), cos(angle).negate());

      // Gentle arc along the flow; zero at the tips.
      const bend = rand.sub(0.5).mul(0.66);
      const centerShift = u.mul(u).mul(4.0).sub(1.0).mul(bend).mul(wid).mul(0.55);
      const off = dir.mul(u.mul(len)).add(side.mul(v.mul(wid).add(centerShift)));

      // Real ridge height along the stroke — paint body, not a normal map.
      const ridge = cos(u.mul(PI)).max(0.0);
      const hWorld = wid.mul(0.3).mul(hAmp);
      const y = float(cfg.yBase).add(rand.mul(0.012)).add(ridge.mul(hWorld));

      return vec3(recA.x.add(off.x), y, recA.y.add(off.y));
    })();

    material.fragmentNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const angle = vA.z;
      const hAmp = vB.y;
      const cIdx = vB.z;
      const rand = vB.w;

      // --- footprint: ragged tips and edges, bristle streaks along length
      const edgeNoise = mx_noise_float(vec3(u.mul(5.0), v.mul(2.5), rand.mul(311.7)));
      const bristle = mx_noise_float(vec3(v.mul(9.0), u.mul(2.0), rand.mul(157.3))).mul(0.5).add(0.5);
      const endMask = smoothstep(0.5, 0.36, abs(u).add(edgeNoise.mul(0.1)));
      const sideMask = smoothstep(0.5, 0.3, abs(v).add(edgeNoise.mul(0.16)));
      const alpha = endMask.mul(sideMask).mul(bristle.mul(0.35).add(0.78));

      // --- LOD ring erosion, stochastic per stroke, driven only by distance
      const d = positionWorld.xz.sub(cameraPosition.xz).length();
      const visOut = smoothstep(float(cfg.rOut), float(cfg.rOut).mul(0.82), d);
      const visIn = cfg.rIn > 0 ? smoothstep(float(cfg.rIn).mul(0.82), float(cfg.rIn), d) : float(1.0);
      const vis = visOut.mul(visIn);

      Discard(alpha.lessThan(0.34));
      Discard(vis.lessThan(hash(rand.mul(1723.7))));

      // --- impasto shading: analytic cross-section, self-shadow, aniso sheen
      const dir3 = vec3(cos(angle), 0.0, sin(angle));
      const side3 = vec3(sin(angle), 0.0, cos(angle).negate());

      const crossH = cos(v.mul(PI)); // bell across the width
      const slope = sin(v.mul(PI)).negate().mul(PI).mul(hAmp).mul(0.38);
      const bristleSlope = bristle.sub(0.5).mul(hAmp).mul(0.55);
      const n = normalize(vec3(0.0, 1.0, 0.0).add(side3.mul(slope.add(bristleSlope))));

      // Light field evaluated per-vertex and interpolated — the noise stack
      // is far too heavy per fragment, and a stroke-scale gradient is enough.
      const lit = vertexStage(fields.litness(positionWorld.xz));
      const form = clamp(vec3(0.0, 1.0, 0.0).dot(SUN), 0.0, 1.0).mul(0.4).add(0.6);

      // Ridge self-shadow: the trough on the lee side of the sun darkens.
      const sunAcross = side3.xz.dot(SUN.xz.normalize());
      const lee = clamp(v.mul(sunAcross).negate().mul(2.0), 0.0, 1.0);
      const selfShadow = float(1.0).sub(lee.mul(float(1.0).sub(crossH)).mul(hAmp).mul(0.42));

      const dither = hash(positionWorld.x.mul(37.7).add(positionWorld.z.mul(71.3))).sub(0.5).mul(0.05);
      // Each stroke holds its own plane of value — mixed on the palette, laid
      // down whole, the way a loaded brush leaves one note per touch.
      const strokeJitter = hash(rand.mul(391.7)).sub(0.5).mul(0.16);
      const value = clamp(
        lit.mul(0.82).add(0.1).mul(form).mul(selfShadow).add(dither).add(strokeJitter),
        0.02,
        0.98,
      );

      const rowV = cIdx.add(0.5).div(lut.rows);
      const paint = texture(lut.texture, vec2(value, rowV)).rgb;

      // Relief lighting of the paint BODY rides on top of the quantized
      // pigment: the LUT fixes the mixed color, the ridge catches the light
      // continuously. Without this the value steps flatten the impasto away.
      const ridgeLight = clamp(n.dot(SUN), 0.0, 1.0);
      const relief = ridgeLight.sub(0.5).mul(hAmp).mul(0.55).add(1.0).mul(selfShadow.mul(0.35).add(0.65));
      const litPaint = paint.mul(relief);

      // Wet-paint sheen: anisotropic along the stroke, strongest at grazing
      // view over lit impasto, broken into glints by the bristle texture.
      const viewDir = normalize(cameraPosition.sub(positionWorld));
      const h = normalize(viewDir.add(SUN));
      const tDotH = dir3.dot(h);
      const sheen = pow(sqrt(clamp(float(1.0).sub(tDotH.mul(tDotH)), 0.0, 1.0)), 10.0);
      const graze = pow(clamp(float(1.0).sub(n.dot(viewDir)), 0.0, 1.0), 1.2).mul(0.8).add(0.2);
      const glint = bristle.mul(bristle).mul(0.85).add(0.15);
      // The sheen is a near-field effect: at distance it collapses into
      // glitter noise, so it fades out well before the far ring.
      const sheenReach = smoothstep(85.0, 22.0, d);
      const specAmp = sheen.mul(graze).mul(hAmp).mul(lit.mul(0.7).add(0.3)).mul(glint).mul(sheenReach).mul(0.9);

      const colorOut = litPaint.add(vec3(1.0, 0.96, 0.85).mul(specAmp));
      return vec4(colorOut, 1.0);
    })();

    const geometry = new PlaneGeometry(1, 1, 4, 1);
    this.mesh = new InstancedMesh(geometry, material, slots);
    this.mesh.frustumCulled = false;
  }

  /** Re-place strokes when the camera crosses a tile boundary. */
  update(renderer: WebGPURenderer, camX: number, camZ: number): void {
    const sx = Math.floor(camX / this.cfg.tileSize);
    const sz = Math.floor(camZ / this.cfg.tileSize);
    if (sx === this.snap.x && sz === this.snap.y) return;
    this.snap.set(sx, sz);
    this.snapU.value.set(sx, sz);
    // Enqueued before this frame's render pass, so the draw sees a complete
    // buffer; identical world tiles regenerate identical strokes.
    void renderer.computeAsync(this.computeNode);
  }
}
