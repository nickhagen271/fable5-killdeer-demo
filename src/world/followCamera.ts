import { Vector3, type PerspectiveCamera } from "three/webgpu";
import type { Bird } from "../bird/bird";
import type { Terrain } from "./terrain";

/**
 * The painter's eye: third person, low and slightly behind the killdeer,
 * tilted so the horizon lands in the upper third by default. Mouse drag
 * orbits, scroll zooms; everything is damped — slow settles, no snapping.
 */

const LOOK_AHEAD = new Vector3(0, 0.12, 0.35);
const POS_RATE = 4.2;
const LOOK_RATE = 6.5;

export class FollowCamera {
  private readonly lookPoint = new Vector3();
  private initialized = false;

  private yawOff = 0; // orbit around the bird, relative to its heading
  private pitch = 0.36; // rad above horizontal
  private dist = 1.35; // m from the bird

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly terrain: Terrain,
  ) {}

  /** Wire mouse orbit (drag) and zoom (scroll) to the canvas. */
  attach(dom: HTMLElement): void {
    let dragging = false;
    dom.addEventListener("pointerdown", (ev) => {
      dragging = true;
      dom.setPointerCapture(ev.pointerId);
    });
    dom.addEventListener("pointerup", (ev) => {
      dragging = false;
      dom.releasePointerCapture(ev.pointerId);
    });
    dom.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      this.yawOff -= ev.movementX * 0.006;
      this.pitch = Math.min(1.25, Math.max(0.07, this.pitch + ev.movementY * 0.004));
    });
    dom.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        this.dist = Math.min(4.2, Math.max(0.65, this.dist * (1 + ev.deltaY * 0.0012)));
      },
      { passive: false },
    );
  }

  snap(bird: Bird): void {
    this.camera.position.copy(this.desiredPos(bird));
    this.lookPoint.copy(this.desiredLook(bird));
    this.camera.lookAt(this.lookPoint);
    this.initialized = true;
  }

  update(dt: number, bird: Bird): void {
    if (!this.initialized) {
      this.snap(bird);
      return;
    }
    const kp = 1 - Math.exp(-POS_RATE * dt);
    const kl = 1 - Math.exp(-LOOK_RATE * dt);
    this.camera.position.lerp(this.desiredPos(bird), kp);
    const floor = this.terrain.heightCPU(this.camera.position.x, this.camera.position.z) + 0.16;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
    this.lookPoint.lerp(this.desiredLook(bird), kl);
    this.camera.lookAt(this.lookPoint);
  }

  private desiredPos(bird: Bird): Vector3 {
    const az = bird.heading + Math.PI + this.yawOff; // behind, plus the orbit
    const horiz = Math.cos(this.pitch) * this.dist;
    return new Vector3(
      bird.position.x + Math.sin(az) * horiz,
      bird.position.y + Math.sin(this.pitch) * this.dist,
      bird.position.z + Math.cos(az) * horiz,
    );
  }

  private desiredLook(bird: Bird): Vector3 {
    return LOOK_AHEAD.clone().applyAxisAngle(new Vector3(0, 1, 0), bird.heading).add(bird.position);
  }
}
