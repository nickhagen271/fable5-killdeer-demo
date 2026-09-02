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
  select,
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
import type { Terrain } from "./terrain";

/**
 * Food spots: worms and small beetles, painted in the same dark-warm notes as
 * everything else. Seeded once per world; a peck that connects consumes the
 * mark. No score, no HUD — the reward is that the world responds.
 */

interface Spot {
  readonly x: number;
  readonly z: number;
  readonly kind: 0 | 1; // 0 worm, 1 beetle
  alive: boolean;
}

const SPOT_COUNT = 90;
const FIELD_RADIUS = 60;

export class FoodSystem {
  readonly mesh: InstancedMesh;
  readonly total = SPOT_COUNT;
  eaten = 0;

  private readonly spots: Spot[] = [];
  private readonly attr: InstancedBufferAttribute;

  constructor(seed: number, lut: PaletteLUT, terrain: Terrain) {
    const rng = new Rng(seed).fork("food");
    // One instanced attribute only (this stack misreads a third per-instance
    // stream): x, z, code (kind·10 + alive), rand.
    const data = new Float32Array(SPOT_COUNT * 4);
    for (let i = 0; i < SPOT_COUNT; i++) {
      const r = Math.sqrt(rng.next()) * FIELD_RADIUS + 1.2;
      const az = rng.range(0, Math.PI * 2);
      const kind: 0 | 1 = rng.next() < 0.55 ? 0 : 1;
      const spot: Spot = { x: Math.sin(az) * r, z: Math.cos(az) * r, kind, alive: true };
      this.spots.push(spot);
      data.set([spot.x, spot.z, kind * 10 + 1, rng.next()], i * 4);
    }
    this.attr = new InstancedBufferAttribute(data, 4);

    const material = new NodeMaterial();
    const rec = instancedBufferAttribute<"vec4">(this.attr);
    const vRec = varying(rec);

    material.positionNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const code = rec.z;
      const alive = code.mod(10.0);
      const isWorm = code.lessThan(5.0);
      const rand = rec.w;

      const az = rand.mul(37.7);
      const dir = vec2(cos(az), sin(az));
      const side = vec2(sin(az), cos(az).negate());

      const len = select(isWorm, 0.075, 0.03);
      const wid = select(isWorm, 0.012, 0.02);
      // Worms lie in a lazy S; beetles are compact ovals.
      const wiggle = select(isWorm, sin(u.mul(9.0).add(rand.mul(20.0))).mul(0.012), 0.0);
      const off = dir.mul(u.mul(len)).add(side.mul(v.mul(wid).add(wiggle)));
      const y = clamp(alive, 0.0, 1.0).mul(0.052); // eaten → collapse under paint
      return vec3(rec.x.add(off.x), y.add(terrain.height(vec2(rec.x, rec.y))), rec.y.add(off.y));
    })();

    material.fragmentNode = Fn(() => {
      const u = uv().x.sub(0.5);
      const v = uv().y.sub(0.5);
      const code = vRec.z;
      const alive = code.mod(10.0);
      const isWorm = code.lessThan(5.0);
      const rand = vRec.w;

      Discard(alive.lessThan(0.5));

      const edgeNoise = mx_noise_float(vec3(u.mul(6.0), v.mul(4.0), rand.mul(233.1)));
      const endMask = smoothstep(0.5, 0.32, abs(u).add(edgeNoise.mul(0.1)));
      const sideMask = smoothstep(0.5, 0.26, abs(v).add(edgeNoise.mul(0.12)));
      Discard(endMask.mul(sideMask).lessThan(0.4));

      // Worm: dark rust, segment banding. Beetle: warm near-black, one glint.
      const seg = sin(u.mul(40.0).add(rand.mul(9.0))).mul(0.5).add(0.5);
      const wormValue = seg.mul(0.12).add(0.2);
      const beetleValue = smoothstep(0.12, 0.0, abs(u.add(0.08)).add(abs(v))).mul(0.3).add(0.08);
      const value = select(isWorm, wormValue, beetleValue);
      const row = select(isWorm, 19.5, 16.5); // worm / band-black rows
      const dith = hash(u.mul(913.7).add(rand)).sub(0.5).mul(0.04);
      const paint = texture(lut.texture, vec2(clamp(value.add(dith), 0.02, 0.98), row.div(lut.rows))).rgb;
      return vec4(paint, 1.0);
    })();

    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1, 3, 1), material, SPOT_COUNT);
    this.mesh.frustumCulled = false;
  }

  /** Nearest live spot to a point, or null. */
  nearest(x: number, z: number): { x: number; z: number; d: number } | null {
    let best: { x: number; z: number; d: number } | null = null;
    for (const s of this.spots) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (!best || d < best.d) best = { x: s.x, z: s.z, d };
    }
    return best;
  }

  /** Consume the nearest live spot within radius. Returns true on a catch. */
  tryEat(x: number, z: number, radius: number): boolean {
    let bestIdx = -1;
    let bestD = radius;
    this.spots.forEach((s, i) => {
      if (!s.alive) return;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d <= bestD) {
        bestD = d;
        bestIdx = i;
      }
    });
    if (bestIdx < 0) return false;
    this.spots[bestIdx].alive = false;
    this.eaten += 1;
    const code = this.spots[bestIdx].kind * 10; // alive bit cleared
    this.attr.array[bestIdx * 4 + 2] = code;
    this.attr.needsUpdate = true;
    return true;
  }
}
