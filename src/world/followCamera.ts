import { Vector3, type PerspectiveCamera } from "three/webgpu";
import type { Bird } from "../bird/bird";

/**
 * Third-person follow: behind and slightly above the killdeer, smooth and
 * gentle. The bird is the subject of the painting at all times.
 */

const OFFSET = new Vector3(0, 0.46, -1.2); // in bird heading space
const LOOK_AHEAD = new Vector3(0, 0.12, 0.35);
const POS_RATE = 4.2;
const LOOK_RATE = 6.5;

export class FollowCamera {
  private readonly lookPoint = new Vector3();
  private initialized = false;

  constructor(private readonly camera: PerspectiveCamera) {}

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
    if (this.camera.position.y < 0.18) this.camera.position.y = 0.18;
    this.lookPoint.lerp(this.desiredLook(bird), kl);
    this.camera.lookAt(this.lookPoint);
  }

  private desiredPos(bird: Bird): Vector3 {
    return OFFSET.clone().applyAxisAngle(new Vector3(0, 1, 0), bird.heading).add(bird.position);
  }

  private desiredLook(bird: Bird): Vector3 {
    return LOOK_AHEAD.clone().applyAxisAngle(new Vector3(0, 1, 0), bird.heading).add(bird.position);
  }
}
