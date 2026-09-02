import {
  Fn,
  float,
  uint,
  vec2,
} from "three/tsl";
import type Node from "three/src/nodes/core/Node.js";

/**
 * The terrain heightfield (Pillar C): long low swells, 2–8 m of relief over
 * 100 m, never flat, never tall enough to block the horizon band. Three
 * octaves of lattice value noise over a PCG-style u32 hash.
 *
 * The same arithmetic is implemented twice — in TSL for every shader and in
 * plain TS for the bird, the camera, the shots and the worms — using u32
 * operations that wrap identically in WGSL and in JS (`Math.imul` + `>>> 0`),
 * so the CPU and GPU disagree only by f32 rounding in the interpolation
 * (sub-millimeter). mx_noise is deliberately NOT used here: it has no CPU
 * twin.
 */

type F = Node<"float">;
type V2 = Node<"vec2">;

interface Octave {
  readonly cell: number; // lattice spacing in meters
  readonly amp: number; // amplitude in meters (peak, centered on 0)
  readonly salt: number; // per-octave hash salt
}

const OCTAVES: readonly Octave[] = [
  { cell: 148, amp: 4.2, salt: 0x51ed270b },
  { cell: 61, amp: 2.2, salt: 0x9e3779b1 },
  { cell: 24, amp: 0.6, salt: 0x85ebca77 },
];

// ---------------------------------------------------------------------------
// CPU
// ---------------------------------------------------------------------------

function hashU32(x: number): number {
  let h = (Math.imul(x, 747796405) + 2891336453) >>> 0;
  h = (((h >>> (((h >>> 28) + 4) & 31)) ^ h) >>> 0);
  h = Math.imul(h, 277803737) >>> 0;
  return ((h >>> 22) ^ h) >>> 0;
}

function latticeCPU(xi: number, zi: number, salt: number): number {
  const ux = Math.imul(xi, 0x9e3779b1) >>> 0;
  const uz = Math.imul(zi, 0x85ebca77) >>> 0;
  return hashU32((ux ^ uz ^ salt) >>> 0) / 4294967296;
}

function valueNoiseCPU(x: number, z: number, cell: number, salt: number): number {
  const gx = x / cell;
  const gz = z / cell;
  const xi = Math.floor(gx);
  const zi = Math.floor(gz);
  const fx = gx - xi;
  const fz = gz - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const h00 = latticeCPU(xi, zi, salt);
  const h10 = latticeCPU(xi + 1, zi, salt);
  const h01 = latticeCPU(xi, zi + 1, salt);
  const h11 = latticeCPU(xi + 1, zi + 1, salt);
  // Two-lerp form, operation-for-operation the same as the TSL twin.
  const a = h00 + (h10 - h00) * sx;
  const b = h01 + (h11 - h01) * sx;
  return a + (b - a) * sz;
}

function seedSalt(seed: number, salt: number): number {
  return ((Math.imul(seed, 0x27d4eb2f) >>> 0) ^ salt) >>> 0;
}

/** Terrain height in meters at a world XZ position (CPU twin). */
export function terrainHeightCPU(x: number, z: number, seed: number): number {
  let h = 0;
  for (const o of OCTAVES) {
    h += (valueNoiseCPU(x, z, o.cell, seedSalt(seed, o.salt)) - 0.5) * 2 * o.amp;
  }
  return h;
}

/**
 * Bare-soil patch mask in [0,1] (CPU twin) — worn ground where grass gives
 * way and worms cluster. Shares the hash so worm placement (CPU) agrees
 * with the painted patches (GPU).
 */
export function soilMaskCPU(x: number, z: number, seed: number): number {
  const n = valueNoiseCPU(x + 3117.3, z - 917.7, 34, seedSalt(seed, 0x2545f491));
  const t = (n - 0.78) / 0.07;
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// ---------------------------------------------------------------------------
// GPU (TSL) — same arithmetic, u32 ops wrap identically in WGSL
// ---------------------------------------------------------------------------

const hashU32Node = /* @__PURE__ */ Fn(([x]: [Node<"uint">]) => {
  const h = x.mul(uint(747796405)).add(uint(2891336453)).toVar();
  h.assign(h.shiftRight(h.shiftRight(uint(28)).add(uint(4)).bitAnd(uint(31))).bitXor(h));
  h.assign(h.mul(uint(277803737)));
  return h.shiftRight(uint(22)).bitXor(h);
});

const latticeNode = /* @__PURE__ */ Fn(([xi, zi, salt]: [Node<"int">, Node<"int">, Node<"uint">]) => {
  const ux = xi.toUint().mul(uint(0x9e3779b1));
  const uz = zi.toUint().mul(uint(0x85ebca77));
  return hashU32Node(ux.bitXor(uz).bitXor(salt)).toFloat().div(4294967296);
});

const valueNoiseNode = /* @__PURE__ */ Fn(([p, cell, salt]: [V2, F, Node<"uint">]) => {
  const g = p.div(cell);
  const gi = g.floor();
  const f = g.fract();
  const s = f.mul(f).mul(f.mul(-2.0).add(3.0));
  const xi = gi.x.toInt();
  const zi = gi.y.toInt();
  const h00 = latticeNode(xi, zi, salt);
  const h10 = latticeNode(xi.add(1), zi, salt);
  const h01 = latticeNode(xi, zi.add(1), salt);
  const h11 = latticeNode(xi.add(1), zi.add(1), salt);
  const a = h00.add(h10.sub(h00).mul(s.x));
  const b = h01.add(h11.sub(h01).mul(s.x));
  return a.add(b.sub(a).mul(s.y));
});

export class Terrain {
  private readonly saltsU: readonly number[];
  private readonly soilSaltU: number;

  constructor(readonly seed: number) {
    this.saltsU = OCTAVES.map((o) => seedSalt(seed, o.salt));
    this.soilSaltU = seedSalt(seed, 0x2545f491);
  }

  /** Terrain height in meters at world XZ (GPU). */
  height(p: V2): F {
    let h: F = float(0);
    OCTAVES.forEach((o, i) => {
      const n = valueNoiseNode(p, float(o.cell), uint(this.saltsU[i]));
      h = h.add(n.sub(0.5).mul(2 * o.amp));
    });
    return h;
  }

  heightCPU(x: number, z: number): number {
    return terrainHeightCPU(x, z, this.seed);
  }

  /** Bare-soil patch mask in [0,1] (GPU). */
  soil(p: V2): F {
    const n = valueNoiseNode(vec2(p.x.add(3117.3), p.y.sub(917.7)), float(34), uint(this.soilSaltU));
    return n.sub(0.78).div(0.07).clamp(0.0, 1.0).smoothstep(0.0, 1.0);
  }

  soilCPU(x: number, z: number): number {
    return soilMaskCPU(x, z, this.seed);
  }
}
