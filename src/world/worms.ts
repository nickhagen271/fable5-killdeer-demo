import { InstancedBufferAttribute, InstancedMesh, NodeMaterial, PlaneGeometry } from "three/webgpu";
import {
  Discard,
  Fn,
  abs,
  clamp,
  cos,
  hash,
  instancedBufferAttribute,
  mx_noise_float,
  sin,
  smoothstep,
  texture,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { Rng } from "../core/rng";
import type { PaletteLUT } from "../paint/palette";
import type { WindField } from "../paint/wind";
import type { Terrain } from "./terrain";

/**
 * Worms — the whole game (Pillar D). Static, small (a curled pink-brown
 * stroke 2–4 cm long), seeded per 16 m chunk at roughly one per 15–25 m²,
 * clustered near the soil patches (the same CPU/GPU-twin mask the ground
 * paints), occasionally in grass. They persist until eaten; eaten worms
 * never respawn in that spot for the session. No markers, no glow — within
 * about 2 m the bird's head-tilt is the only hint.
 *
 * Placement is CPU-side (the peck needs exact positions); chunks within a
 * radius of the bird are resident and written into one fixed-capacity
 * instanced buffer whenever the bird crosses a chunk boundary — a few
 * hundred floats, no stall. A tiny stroke-puff mesh plays where one is
 * eaten.
 */

const CHUNK = 16;
const RADIUS_CHUNKS = 3; // resident ring: 7×7 chunks ≈ 112 m square
const CAPACITY = 640;
const PUFF_CAPACITY = 48;
const PUFF_DABS = 6;
const PUFF_SECONDS = 0.45;

interface Worm {
  readonly x: number;
  readonly z: number;
  readonly rand: number;
  readonly key: string;
}

export class WormSystem {
  readonly mesh: InstancedMesh;
  readonly puffs: InstancedMesh;
  eaten = 0;

  private readonly attr: InstancedBufferAttribute;
  private readonly puffAttr: InstancedBufferAttribute;
  private readonly eatenKeys = new Set<string>();
  private resident: Worm[] = [];
  private snapX = Number.NaN;
  private snapZ = Number.NaN;
  private puffCursor = 0;
  private readonly puffRng: Rng;

  constructor(
    private readonly seed: number,
    lut: PaletteLUT,
    private readonly terrain: Terrain,
    private readonly wind: WindField,
  ) {
    this.puffRng = new Rng(seed ^ 0x9f0f).fork("puffs");
    // Worm instances: x, z, alive(0/1), rand.
    const data = new Float32Array(CAPACITY * 4);
    this.attr = new InstancedBufferAttribute(data, 4);
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1, 3, 1), this.buildWormMaterial(lut), CAPACITY);
    this.mesh.frustumCulled = false;

    // Puff dabs: x, z, birthTime, rand.
    const puffData = new Float32Array(PUFF_CAPACITY * 4);
    puffData.fill(-1e3, 2); // ancient birth times → invisible
    this.puffAttr = new InstancedBufferAttribute(puffData, 4);
    this.puffs = new InstancedMesh(new PlaneGeometry(1, 1, 1, 1), this.buildPuffMaterial(lut), PUFF_CAPACITY);
    this.puffs.frustumCulled = false;
  }

  private buildWormMaterial(lut: PaletteLUT): NodeMaterial {
    const material = new NodeMaterial();
    const rec = instancedBufferAttribute<"vec4">(this.attr);
    const vRec = varying(rec);
    const terrain = this.terrain;

    material.positionNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const alive = rec.z;
      const rand = rec.w;

      const az = rand.mul(37.7);
      const dir = vec2(cos(az), sin(az));
      const side = vec2(sin(az), cos(az).negate());

      // A curled 2–4 cm stroke lying on the ground.
      const len = rand.mul(0.02).add(0.02);
      const wid = 0.011;
      const curl = sin(u.mul(9.0).add(rand.mul(20.0))).mul(0.011);
      const off = dir.mul(u.mul(len)).add(side.mul(v.mul(wid).add(curl)));
      const y = clamp(alive, 0.0, 1.0).mul(0.055); // eaten → sink under paint
      const px = rec.x.add(off.x);
      const pz = rec.y.add(off.y);
      return vec3(px, y.add(terrain.height(vec2(rec.x, rec.y))), pz);
    })();

    material.fragmentNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const alive = vRec.z;
      const rand = vRec.w;

      Discard(alive.lessThan(0.5));

      const edgeNoise = mx_noise_float(vec3(u.mul(6.0), v.mul(4.0), rand.mul(233.1)));
      const endMask = smoothstep(0.5, 0.32, abs(u).add(edgeNoise.mul(0.1)));
      const sideMask = smoothstep(0.5, 0.26, abs(v).add(edgeNoise.mul(0.12)));
      Discard(endMask.mul(sideMask).lessThan(0.4));

      // Pink-brown, faint segment banding, a touch lighter mid-body.
      const seg = sin(u.mul(46.0).add(rand.mul(9.0))).mul(0.5).add(0.5);
      const value = seg.mul(0.14).add(0.3).add(cos(u.mul(3.14)).mul(0.08));
      const dith = hash(u.mul(913.7).add(rand)).sub(0.5).mul(0.04);
      const paint = texture(lut.texture, vec2(clamp(value.add(dith), 0.02, 0.98), 19.5 / lut.rows)).rgb;
      return vec4(paint, 1.0);
    })();
    return material;
  }

  private buildPuffMaterial(lut: PaletteLUT): NodeMaterial {
    const material = new NodeMaterial();
    const rec = instancedBufferAttribute<"vec4">(this.puffAttr);
    const vRec = varying(rec);
    const terrain = this.terrain;
    const timeU = this.wind.timeU;

    material.positionNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const rand = rec.w;
      const age = timeU.sub(rec.z).div(PUFF_SECONDS).clamp(0.0, 1.0);

      // Little dabs kick up and outward, growing as they fade.
      const az = rand.mul(41.3);
      const out = vec2(cos(az), sin(az)).mul(age.mul(0.05));
      const size = age.mul(0.028).add(0.008);
      const px = rec.x.add(out.x).add(u.mul(size));
      const pz = rec.y.add(out.y).add(v.mul(size));
      const y = age.mul(0.09).add(0.05).add(terrain.height(vec2(rec.x, rec.y)));
      return vec3(px, y, pz);
    })();

    material.fragmentNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const rand = vRec.w;
      const age = timeU.sub(vRec.z).div(PUFF_SECONDS);

      Discard(age.lessThan(0.0).or(age.greaterThan(1.0)));
      const r = u.mul(u).add(v.mul(v)).mul(4.0);
      const edgeNoise = mx_noise_float(vec3(u.mul(7.0), v.mul(7.0), rand.mul(311.3))).mul(0.3);
      Discard(r.add(edgeNoise).greaterThan(smoothstep(0.0, 0.25, age).mul(1.0)));

      const value = clamp(age.mul(-0.35).add(0.55), 0.05, 0.98);
      const paint = texture(lut.texture, vec2(value, 3.5 / lut.rows)).rgb; // soil note
      return vec4(paint, 1.0);
    })();
    return material;
  }

  /** Deterministic worms of one chunk, minus the session's eaten set. */
  private chunkWorms(cx: number, cz: number): Worm[] {
    const rng = new Rng(this.seed ^ 0x707c).fork(`worms:${cx}:${cz}`);
    const worms: Worm[] = [];
    // ~one per 15–25 m² before clustering: try more sites, keep by soil.
    const sites = 26;
    for (let i = 0; i < sites; i++) {
      const x = (cx + rng.next()) * CHUNK;
      const z = (cz + rng.next()) * CHUNK;
      const soil = this.terrain.soilCPU(x, z);
      const roll = rng.next();
      const rand = rng.next();
      // ~one per 15–25 m² overall, clustered on bare soil, some in grass.
      if (roll > 0.3 + soil * 0.5) continue;
      const key = `${cx}:${cz}:${i}`;
      if (this.eatenKeys.has(key)) continue;
      worms.push({ x, z, rand, key });
    }
    return worms;
  }

  private rebuildResident(): void {
    this.resident = [];
    for (let dz = -RADIUS_CHUNKS; dz <= RADIUS_CHUNKS; dz++) {
      for (let dx = -RADIUS_CHUNKS; dx <= RADIUS_CHUNKS; dx++) {
        this.resident.push(...this.chunkWorms(this.snapX + dx, this.snapZ + dz));
      }
    }
    const arr = this.attr.array as Float32Array;
    arr.fill(0);
    this.resident.slice(0, CAPACITY).forEach((w, i) => {
      arr.set([w.x, w.z, 1, w.rand], i * 4);
    });
    this.attr.needsUpdate = true;
  }

  /** Follow the bird; regenerate the resident set on chunk crossings. */
  update(birdX: number, birdZ: number): void {
    const sx = Math.floor(birdX / CHUNK);
    const sz = Math.floor(birdZ / CHUNK);
    if (sx === this.snapX && sz === this.snapZ) return;
    this.snapX = sx;
    this.snapZ = sz;
    this.rebuildResident();
  }

  /** Nearest live worm to a point, or null. */
  nearest(x: number, z: number): { x: number; z: number; d: number } | null {
    let best: { x: number; z: number; d: number } | null = null;
    for (const w of this.resident) {
      const d = Math.hypot(w.x - x, w.z - z);
      if (!best || d < best.d) best = { x: w.x, z: w.z, d };
    }
    return best;
  }

  /** Total live worms currently resident around the bird. */
  get residentCount(): number {
    return this.resident.length;
  }

  /** Consume the nearest live worm within radius. True on a catch. */
  tryEat(x: number, z: number, radius: number): boolean {
    let bestIdx = -1;
    let bestD = radius;
    this.resident.forEach((w, i) => {
      const d = Math.hypot(w.x - x, w.z - z);
      if (d <= bestD) {
        bestD = d;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) return false;
    const worm = this.resident[bestIdx];
    this.eatenKeys.add(worm.key);
    this.eaten += 1;
    this.spawnPuff(worm.x, worm.z);
    // Rewrite the buffer without the eaten worm (cheap: few hundred floats).
    this.resident.splice(bestIdx, 1);
    const arr = this.attr.array as Float32Array;
    arr.fill(0);
    this.resident.slice(0, CAPACITY).forEach((w, i) => {
      arr.set([w.x, w.z, 1, w.rand], i * 4);
    });
    this.attr.needsUpdate = true;
    return true;
  }

  private spawnPuff(x: number, z: number): void {
    const now = this.wind.timeU.value;
    const arr = this.puffAttr.array as Float32Array;
    for (let k = 0; k < PUFF_DABS; k++) {
      const i = this.puffCursor % PUFF_CAPACITY;
      this.puffCursor += 1;
      arr.set([x, z, now, this.puffRng.next()], i * 4);
    }
    this.puffAttr.needsUpdate = true;
  }
}
