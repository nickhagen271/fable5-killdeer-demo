import { Vector2, Vector3 } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { installHooks } from "./core/hooks";
import { readParams } from "./core/params";
import { Hud } from "./debug/hud";
import { bootDone, bootMsg, failLoud } from "./render/diagnostics";
import { PaintPost } from "./paint/post";
import { initWebGPU } from "./render/initWebGPU";
import { runComputeSelfTest } from "./render/selfTest";
import { buildPaintWorld } from "./world/field";
import { FollowCamera } from "./world/followCamera";

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
  const world = buildPaintWorld(params.seed, container.clientWidth / container.clientHeight, params.palette);

  let currentShot = params.shot && world.applyShot(params.shot) ? params.shot : "vista";
  world.applyShot(currentShot);

  const hud = new Hud(
    document.body,
    {
      seed: params.seed,
      backend: "WebGPU",
      adapter,
      computeTest: hooks.computeTest,
      shot: currentShot,
      palette: params.palette,
    },
    params.hud,
  );

  // Interactive mode: the follow camera owns the view; 'c' toggles a free
  // orbit camera for inspection. Harness mode: shots and setPose only.
  const followCam = params.harness ? null : new FollowCamera(world.camera);
  let freeCam: OrbitControls | null = null;
  let freeMode = false;

  const setShot = (name: string): boolean => {
    if (!world.applyShot(name)) return false;
    currentShot = name;
    hud.setInfo({ shot: name });
    return true;
  };
  hooks.shots = world.shots.map((s) => s.name);
  hooks.setShot = setShot;
  hooks.setPose = (px, py, pz, tx, ty, tz): void => {
    world.camera.position.set(px, py, pz);
    world.camera.lookAt(tx, ty, tz);
    hud.setInfo({ shot: "pose" });
  };
  hooks.birdPreset = (preset, phase): boolean => {
    if (preset !== "idle" && preset !== "run" && preset !== "peck" && preset !== "alert") return false;
    world.bird.applyPreset(preset, phase);
    return true;
  };
  const scriptMove = new Vector2();
  hooks.birdStep = (dt, moveX, moveZ, peck): void => {
    scriptMove.set(moveX, moveZ);
    world.bird.update(dt, scriptMove, { peck, alert: false });
  };
  hooks.setWindTime = (t): void => {
    world.wind.time = t;
  };
  hooks.foodInfo = () => {
    const bx = world.bird.position.x;
    const bz = world.bird.position.z;
    const near = world.food.nearest(bx, bz);
    return {
      total: world.food.total,
      eaten: world.food.eaten,
      bird: [bx, bz] as const,
      nearest: near ? ([near.x, near.z] as const) : null,
    };
  };

  const held = new Set<string>();
  const pressed = new Set<string>();
  window.addEventListener("keydown", (ev) => {
    if (!ev.repeat) pressed.add(ev.key.toLowerCase());
    held.add(ev.key.toLowerCase());
    if (ev.key === "p" || ev.key === "P") {
      hud.setInfo({ palette: world.palette.toggle() });
    }
  });
  window.addEventListener("keyup", (ev) => held.delete(ev.key.toLowerCase()));

  if (followCam) {
    followCam.snap(world.bird);
    window.addEventListener("keydown", (ev) => {
      if (ev.key.toLowerCase() === "c") {
        freeMode = !freeMode;
        if (freeMode && !freeCam) {
          freeCam = new OrbitControls(world.camera, renderer.domElement);
          freeCam.enableDamping = true;
        }
        if (freeCam) {
          freeCam.enabled = freeMode;
          if (freeMode) freeCam.target.copy(world.bird.position);
        }
      }
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

  // The painterly post stack — the frame becomes paint here. `?post=0`
  // bypasses it (debug); `?grade=0` keeps the stack but skips the last glaze.
  const post = params.post
    ? new PaintPost(renderer, world.scene, world.camera, { grade: params.grade, atm: world.palette.atm })
    : null;

  const camFwd = new Vector3();
  const move = new Vector2();
  let lastTime = performance.now();
  let fpsSmoothed = 0;
  let windClock = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const frameMs = now - lastTime;
    lastTime = now;
    if (frameMs > 0) {
      const fps = 1000 / frameMs;
      fpsSmoothed = fpsSmoothed === 0 ? fps : fpsSmoothed * 0.92 + fps * 0.08;
    }

    if (!params.harness) {
      const dt = Math.min(frameMs, 100) / 1000;
      windClock += dt;
      world.wind.time = windClock;

      // Camera-relative input on the ground plane.
      world.camera.getWorldDirection(camFwd);
      camFwd.y = 0;
      camFwd.normalize();
      move.set(0, 0);
      const f = new Vector2(camFwd.x, camFwd.z);
      const s = new Vector2(-camFwd.z, camFwd.x);
      if (held.has("w") || held.has("arrowup")) move.add(f);
      if (held.has("s") || held.has("arrowdown")) move.sub(f);
      if (held.has("d") || held.has("arrowright")) move.add(s);
      if (held.has("a") || held.has("arrowleft")) move.sub(s);
      if (move.lengthSq() > 0) move.normalize();

      world.bird.update(dt, move, {
        peck: pressed.has(" "),
        alert: pressed.has("f"),
      });
      pressed.clear();

      if (freeMode && freeCam) {
        freeCam.update();
      } else if (followCam) {
        followCam.update(dt, world.bird);
      }
      hud.setInfo({ bird: world.bird.anim.state });
    }

    world.update(renderer);
    if (post) post.render();
    else renderer.render(world.scene, world.camera);

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
