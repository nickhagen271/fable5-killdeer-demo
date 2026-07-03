import { Vector3 } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { installHooks } from "./core/hooks";
import { readParams } from "./core/params";
import { Hud } from "./debug/hud";
import { bootDone, bootMsg, failLoud } from "./render/diagnostics";
import { initWebGPU } from "./render/initWebGPU";
import { runComputeSelfTest } from "./render/selfTest";
import { buildPaintWorld } from "./world/field";

async function main(): Promise<void> {
  const params = readParams(window.location.search);
  const hooks = installHooks(params.seed);

  const container = document.getElementById("app");
  if (!container) failLoud("missing #app container", ["index.html is malformed."]);

  bootMsg("requesting WebGPU device", 0.2);
  const { renderer, adapter } = await initWebGPU(container);
  hooks.adapter = adapter;
  hooks.backend = "WebGPU";

  bootMsg("GPU compute self-test", 0.4);
  const computeOk = await runComputeSelfTest(renderer);
  hooks.computeTest = computeOk ? "pass" : "fail";
  if (!computeOk) {
    failLoud("GPU compute self-test failed", [
      "A trivial compute kernel wrote a storage buffer and the readback did",
      "not match. The stroke system is built on this path.",
      "",
      `adapter: ${adapter.vendor} / ${adapter.architecture} ${adapter.description}`,
    ]);
  }

  bootMsg("placing strokes", 0.7);
  const world = buildPaintWorld(params.seed, container.clientWidth / container.clientHeight);

  let currentShot = params.shot && world.applyShot(params.shot) ? params.shot : "vista";
  world.applyShot(currentShot);

  const hud = new Hud(
    document.body,
    { seed: params.seed, backend: "WebGPU", adapter, computeTest: hooks.computeTest, shot: currentShot },
    params.hud,
  );

  const controls = params.harness ? null : new OrbitControls(world.camera, renderer.domElement);

  const setShot = (name: string): boolean => {
    if (!world.applyShot(name)) return false;
    currentShot = name;
    const shot = world.shots.find((s) => s.name === name);
    if (controls && shot) {
      controls.target.copy(shot.target);
      controls.update();
    }
    hud.setInfo({ shot: name });
    return true;
  };
  hooks.shots = world.shots.map((s) => s.name);
  hooks.setShot = setShot;
  hooks.setPose = (px, py, pz, tx, ty, tz): void => {
    world.camera.position.set(px, py, pz);
    world.camera.lookAt(tx, ty, tz);
    if (controls) {
      controls.target.set(tx, ty, tz);
      controls.update();
    }
    hud.setInfo({ shot: "pose" });
  };

  // Ground-glide movement for the interactive coherence check: WASD moves
  // camera and orbit target together, shift sprints at bird speed.
  const held = new Set<string>();
  window.addEventListener("keydown", (ev) => held.add(ev.key.toLowerCase()));
  window.addEventListener("keyup", (ev) => held.delete(ev.key.toLowerCase()));

  if (controls) {
    controls.enableDamping = true;
    controls.target.copy(world.shots.find((s) => s.name === currentShot)?.target ?? controls.target);
    controls.update();
    window.addEventListener("keydown", (ev) => {
      const idx = Number(ev.key) - 1;
      const shot = world.shots[idx];
      if (shot) setShot(shot.name);
    });
  }

  const onResize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    world.camera.aspect = w / h;
    world.camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);
  onResize();

  bootMsg("first frame", 0.95);

  const fwd = new Vector3();
  const side = new Vector3();
  let lastTime = performance.now();
  let fpsSmoothed = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const frameMs = now - lastTime;
    lastTime = now;
    if (frameMs > 0) {
      const fps = 1000 / frameMs;
      fpsSmoothed = fpsSmoothed === 0 ? fps : fpsSmoothed * 0.92 + fps * 0.08;
    }

    if (controls) {
      const dt = Math.min(frameMs, 100) / 1000;
      const speed = (held.has("shift") ? 13 : 5.5) * dt;
      world.camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      side.set(-fwd.z, 0, fwd.x);
      const move = new Vector3();
      if (held.has("w")) move.add(fwd);
      if (held.has("s")) move.sub(fwd);
      if (held.has("d")) move.add(side);
      if (held.has("a")) move.sub(side);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        world.camera.position.add(move);
        controls.target.add(move);
      }
      controls.update();
    }

    world.update(renderer);
    renderer.render(world.scene, world.camera);

    hooks.frame += 1;
    hud.update(
      {
        fps: fpsSmoothed,
        frameMs,
        width: container.clientWidth,
        height: container.clientHeight,
        pixelRatio: renderer.getPixelRatio(),
        frame: hooks.frame,
      },
      now,
    );

    if (hooks.frame === 1) {
      bootDone();
      hooks.ready = true;
    }
  });
}

void main().catch((err: unknown) => {
  // failLoud already painted its own report; only handle unexpected errors.
  if (window.__PKD?.failed) return;
  failLoud("unhandled boot error", [String(err instanceof Error ? (err.stack ?? err.message) : err)]);
});
