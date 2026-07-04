import { Rng } from "../core/rng";
import type { BirdRig } from "./birdMesh";

/**
 * Procedural killdeer animation. No clips — a state machine writes pose
 * parameters, cyclic gait terms layer on top, and everything is applied to
 * the rig each frame. The character IS the timing: quick dashes, abrupt
 * stops, a tilt and a peck, long watchful stillness.
 */

export type BirdState = "idle" | "run" | "peck" | "alert" | "preen";
export type BirdPreset = "idle" | "run" | "peck" | "alert";

interface Pose {
  bodyY: number;
  bodyPitch: number;
  bodyRoll: number;
  neckPitch: number;
  headPitch: number;
  headYaw: number;
  tailPitch: number;
}

const REST: Pose = { bodyY: 0, bodyPitch: 0.02, bodyRoll: 0, neckPitch: 0.05, headPitch: 0, headYaw: 0, tailPitch: 0.1 };

function approach(current: number, target: number, rate: number, dt: number): number {
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}

export class BirdAnim {
  state: BirdState = "idle";
  /** Fired once per peck at bill-to-ground contact (foraging hook). */
  onPeckContact: (() => void) | null = null;
  private contactFired = false;
  private gulp = false;

  private readonly pose: Pose = { ...REST };
  private readonly rng: Rng;
  private t = 0;
  private stateT = 0;
  private gaitPhase = 0;
  private gaitAmp = 0; // smoothed leg swing amplitude
  private lookTarget = 0;
  private nextLookAt = 1.5;
  private nextAlertAt = 8;
  private nextPreenAt = 20;
  private pendingPeckAt = Number.POSITIVE_INFINITY;

  constructor(seed: number) {
    this.rng = new Rng(seed ^ 0x5eed).fork("bird");
    this.nextAlertAt = this.rng.range(6, 14);
    this.nextPreenAt = this.rng.range(14, 30);
  }

  /** Force a peck (player action). Works from idle or run. */
  requestPeck(): void {
    if (this.state !== "peck") this.enter("peck");
  }

  /** A peck connected with food: after it finishes, a head-up gulp beat. */
  notifyEat(): void {
    this.gulp = true;
  }

  requestAlert(): void {
    if (this.state === "idle") this.enter("alert");
  }

  private enter(state: BirdState): void {
    this.state = state;
    this.stateT = 0;
    if (state === "peck") this.contactFired = false;
  }

  update(dt: number, speed01: number): void {
    this.t += dt;
    this.stateT += dt;
    const moving = speed01 > 0.04;

    // --- state transitions --------------------------------------------------
    if (this.state === "run" && !moving) {
      this.enter("idle");
      // The signature: stop, a beat, then usually a peck.
      if (this.rng.next() < 0.6) this.pendingPeckAt = this.stateT + this.rng.range(0.2, 0.55);
    } else if (this.state !== "run" && moving && this.state !== "peck") {
      this.enter("run");
      this.pendingPeckAt = Number.POSITIVE_INFINITY;
    }

    if (this.state === "idle") {
      if (this.stateT >= this.pendingPeckAt) {
        this.pendingPeckAt = Number.POSITIVE_INFINITY;
        this.enter("peck");
      } else if (this.t > this.nextAlertAt) {
        this.nextAlertAt = this.t + this.rng.range(6, 14);
        this.enter("alert");
      } else if (this.t > this.nextPreenAt) {
        this.nextPreenAt = this.t + this.rng.range(14, 30);
        this.enter("preen");
      }
    }
    // Bill meets the ground as the dip bottoms out.
    if (this.state === "peck" && !this.contactFired && this.stateT >= 0.19) {
      this.contactFired = true;
      this.onPeckContact?.();
    }
    if (this.state === "peck" && this.stateT > 0.62) {
      if (moving) {
        this.enter("run");
        this.gulp = false;
      } else if (this.gulp) {
        this.gulp = false;
        this.enter("alert"); // the swallow-and-scan beat after a catch
      } else {
        this.enter("idle");
      }
    }
    if (this.state === "alert" && this.stateT > this.alertHold) this.enter("idle");
    if (this.state === "preen" && this.stateT > 1.6) this.enter("idle");

    // --- pose targets ---------------------------------------------------------
    const target: Pose = { ...REST };
    let rate = 10;

    switch (this.state) {
      case "run": {
        target.bodyPitch = 0.12 * speed01 + 0.02;
        target.neckPitch = -0.06;
        target.tailPitch = 0.16;
        break;
      }
      case "idle": {
        // Watchful micro-motion: weight shifts and head scanning.
        if (this.t > this.nextLookAt) {
          this.nextLookAt = this.t + this.rng.range(1.2, 3.8);
          this.lookTarget = this.rng.range(-1.0, 1.0);
        }
        target.headYaw = this.lookTarget;
        target.bodyRoll = Math.sin(this.t * 0.9) * 0.025;
        target.bodyY = Math.sin(this.t * 1.7) * 0.0012;
        rate = 5;
        break;
      }
      case "peck": {
        const u = Math.min(this.stateT / 0.62, 1);
        const dip = u < 0.3 ? u / 0.3 : u > 0.72 ? (1 - u) / 0.28 : 1;
        const tap = u >= 0.3 && u <= 0.72 ? Math.sin((u - 0.3) * 48) * 0.5 + 0.5 : 0;
        target.bodyPitch = 0.48 * dip;
        target.bodyY = -0.014 * dip;
        target.neckPitch = (0.7 + tap * 0.16) * dip;
        target.headPitch = 0.28 * dip;
        target.tailPitch = -0.25 * dip; // tail up as the head goes down
        rate = 18; // pecks are quick
        break;
      }
      case "alert": {
        target.neckPitch = -0.4;
        target.bodyPitch = -0.05;
        target.headYaw = 0;
        target.tailPitch = 0.02;
        rate = 14;
        break;
      }
      case "preen": {
        const side = this.rng.next() > 0.5 ? 1 : -1;
        target.headYaw = 2.1 * side;
        target.neckPitch = 0.55 + Math.sin(this.stateT * 22) * 0.06;
        target.bodyRoll = 0.06 * side;
        rate = 7;
        break;
      }
    }

    const p = this.pose;
    p.bodyY = approach(p.bodyY, target.bodyY, rate, dt);
    p.bodyPitch = approach(p.bodyPitch, target.bodyPitch, rate, dt);
    p.bodyRoll = approach(p.bodyRoll, target.bodyRoll, rate, dt);
    p.neckPitch = approach(p.neckPitch, target.neckPitch, rate, dt);
    p.headPitch = approach(p.headPitch, target.headPitch, rate, dt);
    p.headYaw = approach(p.headYaw, target.headYaw, rate, dt);
    p.tailPitch = approach(p.tailPitch, target.tailPitch, rate, dt);

    // --- gait ----------------------------------------------------------------
    const stepRate = 4 + speed01 * 6.5; // steps per second
    this.gaitPhase = (this.gaitPhase + dt * stepRate * 0.5) % 1; // stride = 2 steps
    this.gaitAmp = approach(this.gaitAmp, moving ? 0.32 + speed01 * 0.34 : 0, moving ? 12 : 8, dt);
  }

  private get alertHold(): number {
    return 1.4 + (this.rng.next() < 0.3 ? 1.0 : 0);
  }

  /** Deterministic pose for harness shots: pure function of (preset, phase). */
  applyPreset(rig: BirdRig, preset: BirdPreset, phase: number): void {
    const p: Pose = { ...REST };
    let amp = 0;
    let gait = 0;
    switch (preset) {
      case "idle":
        p.headYaw = 0.45;
        p.bodyRoll = 0.02;
        break;
      case "run":
        p.bodyPitch = 0.13;
        p.neckPitch = -0.06;
        p.tailPitch = 0.16;
        amp = 0.62;
        gait = phase;
        break;
      case "peck":
        p.bodyPitch = 0.48;
        p.bodyY = -0.014;
        p.neckPitch = 0.78;
        p.headPitch = 0.28;
        p.tailPitch = -0.25;
        break;
      case "alert":
        p.neckPitch = -0.4;
        p.bodyPitch = -0.05;
        break;
    }
    Object.assign(this.pose, p);
    this.gaitAmp = amp;
    this.gaitPhase = gait;
    this.state = preset === "run" ? "run" : "idle";
    this.apply(rig, 0);
  }

  /** Write the current pose + gait cycle into the rig. */
  apply(rig: BirdRig, speed01: number): void {
    const p = this.pose;
    const bob = this.gaitAmp > 0.01 ? Math.sin(this.gaitPhase * Math.PI * 4) * 0.004 * (0.4 + speed01) : 0;

    rig.bodyG.position.y = 0.088 + p.bodyY + bob;
    rig.bodyG.rotation.set(p.bodyPitch, 0, p.bodyRoll);
    rig.neckG.rotation.x = p.neckPitch;
    rig.headG.rotation.set(p.headPitch, p.headYaw, 0);
    rig.tailG.rotation.x = 0.1 + p.tailPitch;

    for (let i = 0; i < 2; i++) {
      const leg = i === 0 ? this.gaitPhase : (this.gaitPhase + 0.5) % 1;
      const swing = Math.cos(leg * Math.PI * 2) * this.gaitAmp;
      const lift = Math.max(0, Math.sin(leg * Math.PI * 2)) * this.gaitAmp;
      rig.hips[i].rotation.x = swing;
      rig.feet[i].rotation.x = -swing * 0.7 + lift * 0.9;
      rig.feet[i].position.y = -0.08 + lift * 0.008;
    }
  }
}
