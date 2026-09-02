import { Vector2, Vector3, type Group } from "three/webgpu";
import type { PaletteLUT } from "../paint/palette";
import type { Terrain } from "../world/terrain";
import { BirdAnim, type BirdPreset } from "./birdAnim";
import { buildBirdRig, type BirdRig } from "./birdMesh";

/**
 * The playable killdeer: locomotion integration (quick accelerations, hard
 * stops, fast pivots — plover, not waterfowl) driving the procedural
 * animation, all attached to one root the camera can follow.
 */

export interface BirdActions {
  readonly peck: boolean;
  readonly alert: boolean;
}

const MAX_SPEED = 2.0; // m/s — a dashing killdeer covers ground fast
const ACCEL = 14;
const BRAKE = 22;
const TURN_RATE = 9; // rad/s

export class Bird {
  readonly rig: BirdRig;
  readonly anim: BirdAnim;
  heading = 0; // yaw, +Z forward at 0
  private readonly velocity = new Vector2(0, 0); // world XZ

  constructor(lut: PaletteLUT, seed: number, private readonly terrain: Terrain) {
    this.rig = buildBirdRig(lut);
    // The visible ground is the TOP of the paint: the impasto strokes reach
    // ~0.045 above the underpaint surface, which itself rides the terrain.
    this.rig.root.position.y = 0.045 + terrain.heightCPU(0, 0);
    this.anim = new BirdAnim(seed);
    this.anim.apply(this.rig, 0);
  }

  get root(): Group {
    return this.rig.root;
  }

  get position(): Vector3 {
    return this.rig.root.position;
  }

  get speed01(): number {
    return this.velocity.length() / MAX_SPEED;
  }

  update(dt: number, moveWorld: Vector2, actions: BirdActions): void {
    const wants = moveWorld.lengthSq() > 0.001;

    if (wants) {
      const targetHeading = Math.atan2(moveWorld.x, moveWorld.y);
      let d = targetHeading - this.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const step = Math.min(Math.abs(d), TURN_RATE * dt) * Math.sign(d);
      this.heading += step;

      // Killdeer run along their nose: velocity follows heading, and speed
      // drops while pivoting hard.
      const align = Math.max(0, Math.cos(d));
      const targetSpeed = MAX_SPEED * Math.min(1, moveWorld.length()) * (0.25 + 0.75 * align);
      const fwd = new Vector2(Math.sin(this.heading), Math.cos(this.heading));
      const desired = fwd.multiplyScalar(targetSpeed);
      this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, ACCEL * dt);
      this.velocity.y += (desired.y - this.velocity.y) * Math.min(1, ACCEL * dt);
    } else {
      const k = Math.min(1, BRAKE * dt);
      this.velocity.multiplyScalar(1 - k);
      if (this.velocity.lengthSq() < 0.0004) this.velocity.set(0, 0);
    }

    this.root.position.x += this.velocity.x * dt;
    this.root.position.z += this.velocity.y * dt;
    this.root.position.y = 0.045 + this.terrain.heightCPU(this.root.position.x, this.root.position.z);
    this.root.rotation.y = this.heading;

    if (actions.peck) this.anim.requestPeck();
    if (actions.alert) this.anim.requestAlert();

    this.anim.update(dt, this.speed01);
    this.anim.apply(this.rig, this.speed01);
  }

  /** Deterministic harness pose. */
  applyPreset(preset: BirdPreset, phase: number): void {
    this.anim.applyPreset(this.rig, preset, phase);
  }
}
