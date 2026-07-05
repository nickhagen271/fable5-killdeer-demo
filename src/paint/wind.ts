import { Vector2 } from "three/webgpu";
import { float, mx_noise_float, sin, uniform, vec2, vec3 } from "three/tsl";
import type UniformNode from "three/src/nodes/core/UniformNode.js";
import { Rng } from "../core/rng";
import type { FloatExpr, PaintFields, Vec2Expr } from "./fields";

/**
 * The wind field — phase 4's breath. One global gentle direction per seed
 * plus travelling gust noise; grass, flowers and the cloud layer sample the
 * same field so the whole painting moves together. Pastoral by construction:
 * amplitudes are small, frequencies slow, nothing storms.
 *
 * Time is a uniform owned by the app loop. In harness mode it stays frozen
 * at 0 unless a capture advances it explicitly, so every existing
 * determinism gate (static boil check, shot reproducibility) is untouched.
 */
export class WindField {
  readonly timeU: UniformNode<"float", number>;
  /** Unit wind direction on the ground plane (world XZ). */
  readonly dir: Vector2;

  constructor(seed: number, private readonly fields: PaintFields) {
    this.timeU = uniform(0);
    const angle = new Rng(seed).fork("wind").range(0, Math.PI * 2);
    this.dir = new Vector2(Math.cos(angle), Math.sin(angle));
  }

  set time(t: number) {
    this.timeU.value = t;
  }

  /**
   * Scalar sway in [-1, 1] for a ground point: a slow travelling primary
   * wave plus gust bands drifting downwind. Cheap enough for vertex stage.
   */
  sway(p: Vec2Expr, rand: FloatExpr): FloatExpr {
    const t = this.timeU;
    const along = p.x.mul(this.dir.x).add(p.y.mul(this.dir.y));
    // Primary wave travels downwind; each plant carries its own phase so the
    // meadow ripples instead of nodding in unison.
    const wave = sin(t.mul(1.4).sub(along.mul(0.5)).add(rand.mul(6.283)));
    // Gust bands: low-frequency noise drifting with the wind.
    const gustUv = vec2(
      p.x.sub(t.mul(this.dir.x).mul(1.1)).mul(0.05),
      p.y.sub(t.mul(this.dir.y).mul(1.1)).mul(0.05),
    );
    const gust = mx_noise_float(vec3(gustUv, this.fields.seedU.add(191.3)));
    return wave.mul(0.45).add(gust.mul(0.8)).clamp(-1.0, 1.0);
  }

  /** Wind displacement vector for a plant top: dir * sway * amplitude. */
  displacement(p: Vec2Expr, rand: FloatExpr, amplitude: number): ReturnType<typeof vec3> {
    const s = this.sway(p, rand).mul(amplitude);
    // A touch of cross-wind wobble keeps the motion from reading mechanical.
    const wobble = sin(this.timeU.mul(2.3).add(rand.mul(17.0))).mul(amplitude).mul(0.22);
    const cross = vec2(-this.dir.y, this.dir.x);
    return vec3(
      s.mul(this.dir.x).add(wobble.mul(cross.x)),
      float(0.0).sub(s.abs().mul(amplitude).mul(0.18)), // bowing dips the tip slightly
      s.mul(this.dir.y).add(wobble.mul(cross.y)),
    );
  }

  /** Cloud-layer drift offset (slow, in cloud-projection units). */
  cloudOffset(scale: number): ReturnType<typeof vec2> {
    const t = this.timeU;
    return vec2(t.mul(this.dir.x).mul(scale), t.mul(this.dir.y).mul(scale));
  }
}
