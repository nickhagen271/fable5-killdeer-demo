import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { installHooks } from "./core/hooks";
import { readParams } from "./core/params";
import { Hud } from "./debug/hud";
import { bootDone, bootMsg, failLoud } from "./render/diagnostics";
import { initWebGPU } from "./render/initWebGPU";
import { runComputeSelfTest } from "./render/selfTest";
import { buildBootScene } from "./world/bootScene";

async function main(): Promise<void> {
  const params = readParams(window.location.search);
  const hooks = installHooks(params.seed);

  const container = document.getElementById("app");
  if (!container) failLoud("missing #app container", ["index.html is malformed."]);

  bootMsg("requesting WebGPU device", 0.2);
  const { renderer, adapter } = await initWebGPU(container);
  hooks.adapter = adapter;
  hooks.backend = "WebGPU";

  bootMsg("GPU compute self-test", 0.5);
  const computeOk = await runComputeSelfTest(renderer);
  hooks.computeTest = computeOk ? "pass" : "fail";
  if (!computeOk) {
    failLoud("GPU compute self-test failed", [
      "A trivial compute kernel wrote a storage buffer and the readback did",
      "not match. The stroke system in phase 1 is built on this path, so a",
      "silent pass-through here would only defer the failure.",
      "",
      `adapter: ${adapter.vendor} / ${adapter.architecture} ${adapter.description}`,
    ]);
  }

  bootMsg("building scene", 0.75);
  const boot = buildBootScene(params.seed, container.clientWidth / container.clientHeight);

  let currentShot = params.shot && boot.applyShot(params.shot) ? params.shot : "vista";
  boot.applyShot(currentShot);

  const hud = new Hud(
    document.body,
    { seed: params.seed, backend: "WebGPU", adapter, computeTest: hooks.computeTest, shot: currentShot },
    params.hud,
  );

  const controls = params.harness ? null : new OrbitControls(boot.camera, renderer.domElement);

  const setShot = (name: string): boolean => {
    if (!boot.applyShot(name)) return false;
    currentShot = name;
    const shot = boot.shots.find((s) => s.name === name);
    if (controls && shot) {
      controls.target.copy(shot.target);
      controls.update();
    }
    hud.setInfo({ shot: name });
    return true;
  };
  hooks.shots = boot.shots.map((s) => s.name);
  hooks.setShot = setShot;

  if (controls) {
    controls.enableDamping = true;
    controls.target.copy(boot.shots.find((s) => s.name === currentShot)?.target ?? controls.target);
    controls.update();
    window.addEventListener("keydown", (ev) => {
      const idx = Number(ev.key) - 1;
      const shot = boot.shots[idx];
      if (shot) setShot(shot.name);
    });
  }

  const onResize = (): void => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    boot.camera.aspect = w / h;
    boot.camera.updateProjectionMatrix();
  };
  window.addEventListener("resize", onResize);
  onResize();

  bootMsg("first frame", 0.95);

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

    controls?.update();
    renderer.render(boot.scene, boot.camera);

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
