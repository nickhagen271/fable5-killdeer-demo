import { Vector3 } from "three/webgpu";
import { clamp, float, hash, mix, mx_noise_float, select, smoothstep, uniform, vec3 } from "three/tsl";
import type Node from "three/src/nodes/core/Node.js";
import type UniformNode from "three/src/nodes/core/UniformNode.js";

/**
 * The shared procedural fields every paint pass reads: light, flow, color.
 * Underpaint, stroke placement (compute) and stroke shading all sample the
 * same seeded fields, so strokes agree with the ground beneath them and the
 * whole frame keeps one value structure.
 */

export type Vec2Expr = Node<"vec2">;
export type FloatExpr = Node<"float">;

/**
 * The sun. LOW and warm in the sunset script, higher and diffuse in
 * overcast. The Vector3 is mutated in place by PaletteState.apply; the SUN
 * uniform wraps the same instance, so every shader tracks the palette.
 */
export const SUN_DIR = new Vector3(-0.55, 0.3, -0.42).normalize();
export const SUN = uniform(SUN_DIR);

export class PaintFields {
  readonly seedU: UniformNode<"float", number>;

  constructor(seed: number) {
    this.seedU = uniform(((seed % 1024) + 1024) * 0.7311);
  }

  /** Seeded value noise in [0,1] over a world-space XZ position. */
  n01(p: Vec2Expr, scale: number, offset: number): FloatExpr {
    return mx_noise_float(vec3(p.mul(scale), this.seedU.add(offset))).mul(0.5).add(0.5);
  }

  /**
   * Macro shadow masses — a few dark cool clumps in the field (the bushes and
   * shadow pools of the references) that give the frame its 4th value mass.
   */
  shadowMask(p: Vec2Expr): FloatExpr {
    const n = this.n01(p, 0.032, 91.7);
    return smoothstep(0.6, 0.76, n);
  }

  /**
   * Master light field in [0,1]: where the sun piles up. Drives value,
   * impasto thickness, and the warm-cool ramp. Shadows stay luminous — the
   * floor never reaches 0.
   */
  litness(p: Vec2Expr): FloatExpr {
    const broad = this.n01(p, 0.055, 131.1); // the big light masses
    const mid = this.n01(p, 0.32, 11.7);
    const fine = this.n01(p, 1.7, 29.3);
    const combined = broad.mul(0.6).add(mid.mul(0.25)).add(fine.mul(0.15));
    // Contrast stretch so the frame separates into real value masses.
    const base = smoothstep(0.36, 0.68, combined);
    const shadowed = mix(base, base.mul(0.22).add(0.06), this.shadowMask(p));
    return clamp(shadowed.mul(0.92).add(0.08), 0.0, 1.0);
  }

  /**
   * Stroke flow direction (radians). Ground strokes lie flat and drift with
   * this field — never one global angle.
   */
  flowAngle(p: Vec2Expr): FloatExpr {
    const broad = this.n01(p, 0.022, 47.3).sub(0.5).mul(4.4);
    const local = this.n01(p, 0.21, 63.9).sub(0.5).mul(1.3);
    return broad.add(local);
  }

  /**
   * Palette row for a ground stroke, given a per-sample random r in [0,1).
   * v2 semantic rows: grass(0) / grassWarm(1) / grassCool(2) dominate,
   * soil(3) in the warm drifts, and sparse flowerA/E flecks of broken color
   * in the open. Actual flower DABS are their own system; these are just the
   * flecks a loaded brush drops between them.
   */
  colorIndex(p: Vec2Expr, r: FloatExpr): FloatExpr {
    const drift = this.n01(p, 0.045, 0.0); // green ↔ warm macro drift
    const flower = this.n01(p, 3.9, 53.1);
    const flowerDrift = this.n01(p, 0.09, 71.9);
    const shadow = this.shadowMask(p);

    // Independent decision rolls derived from the sample's random r.
    const rPick = hash(r.mul(913.7).add(17.1));
    const rFamily = hash(r.mul(371.3).add(3.7));
    const rShadow = hash(r.mul(541.9).add(29.5));
    const rFlower = hash(r.mul(197.3).add(8.9));

    // Greens dominate; warm-lit blades and soil notes in the warm drifts.
    const greens = select(rPick.lessThan(0.6), float(0.0), select(rPick.lessThan(0.86), float(1.0), float(2.0)));
    const warms = select(rPick.lessThan(0.7), float(1.0), float(3.0));
    const warmProb = smoothstep(0.55, 0.88, drift).mul(0.55);
    let idx = select(rFamily.lessThan(warmProb), warms, greens);

    // Cool shadow masses swap to the blue-green note.
    idx = select(shadow.mul(0.85).greaterThan(rShadow), float(2.0), idx);

    // Sparse broken-color flecks in the open (never inside shadow masses).
    const open = float(1.0).sub(shadow);
    const fleck = smoothstep(0.62, 0.8, flower).mul(flowerDrift).mul(open);
    idx = select(fleck.mul(0.2).greaterThan(rFlower), float(7.0), idx);
    idx = select(fleck.mul(0.12).greaterThan(hash(rFlower.mul(733.1))), float(11.0), idx);

    return idx;
  }
}
