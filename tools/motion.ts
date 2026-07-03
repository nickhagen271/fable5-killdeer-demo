import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { launchBrowser, preparePage, settleFrames, startServer, waitForApp } from "./harness";

/**
 * Coherence verification — the phase-1 gate.
 *
 * Captures three camera sequences and writes frames, a flipbook viewer, and
 * consecutive-frame difference metrics per path:
 *
 *   static — same pose, N frames. Any nonzero diff is temporal boil
 *            (stroke shimmer with no camera motion) and fails outright.
 *   orbit  — camera circles a fixed point at ground height.
 *   sprint — camera translates at bird sprint speed just above the ground.
 *
 * Motion sequences necessarily differ frame to frame; their diffs are
 * recorded for trend comparison and the flipbooks are the human check for
 * swimming (strokes must move WITH the ground, never crawl across it).
 *
 *   npm run motion -- --seed 7 [--frames 40] [--size 960x540]
 */

interface Pose {
  readonly p: readonly [number, number, number];
  readonly t: readonly [number, number, number];
}

function orbitPose(i: number, n: number): Pose {
  const az = (i / n) * Math.PI * 2;
  return {
    p: [Math.sin(az) * 9, 2.4, Math.cos(az) * 9],
    t: [0, 0.5, 0],
  };
}

function sprintPose(i: number, n: number): Pose {
  // 8 m/s at 30 fps equivalent — full-speed bird sprint, low over the ground.
  const z = 16 - (i / (n - 1)) * ((8 * n) / 30);
  return { p: [0, 1.15, z], t: [0, 0.7, z - 12] };
}

function staticPose(): Pose {
  return { p: [2, 0.75, 9], t: [0, 0.35, -40] };
}

interface Args {
  readonly seed: number;
  readonly frames: number;
  readonly width: number;
  readonly height: number;
  readonly phase: number;
  readonly paths: readonly string[] | null;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const size = (get("--size") ?? "960x540").split("x");
  const paths = get("--paths");
  return {
    seed: Number(get("--seed") ?? 7),
    frames: Number(get("--frames") ?? 40),
    width: Number(size[0]),
    height: Number(size[1]),
    phase: Number(get("--phase") ?? 1),
    paths: paths ? paths.split(",") : null,
  };
}

/** Mean absolute per-channel difference between two same-size PNGs, 0..255. */
function meanAbsDiff(aPath: string, bPath: string): number {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) return Number.NaN;
  let sum = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n * 4; i += 4) {
    sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return sum / (n * 3);
}

function flipbook(dir: string, frames: readonly string[], title: string): void {
  const list = JSON.stringify(frames);
  writeFileSync(
    join(dir, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body { margin:0; background:#17181a; color:#dde2d6; font:13px ui-monospace,Menlo,monospace; }
      .bar { padding:8px 12px; } img { display:block; max-width:100vw; }
    </style></head><body>
    <div class="bar">${title} — space: play/pause · ←/→: step</div><img id="f">
    <script>
      const frames=${list};let i=0,run=true;const img=document.getElementById('f');
      const show=()=>{img.src=frames[i];document.querySelector('.bar').textContent='${title} · frame '+i+'/'+(frames.length-1)+' — space: play/pause, arrows: step';};
      setInterval(()=>{if(run){i=(i+1)%frames.length;show();}},83);
      addEventListener('keydown',(e)=>{if(e.key===' ')run=!run;if(e.key==='ArrowRight'){i=(i+1)%frames.length;show();}if(e.key==='ArrowLeft'){i=(i-1+frames.length)%frames.length;show();}});
      show();
    </script></body></html>`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outRoot = join(process.cwd(), "shots", `phase-${args.phase}`, "motion");

  const { server, baseUrl } = await startServer();
  const browser = await launchBrowser();

  const report: Record<string, { frames: number; meanDiff: number; maxDiff: number }> = {};

  try {
    const page = await browser.newPage({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: 1,
    });
    await preparePage(page);
    page.on("pageerror", (err) => console.error(`[page] ${err.message}`));

    await page.goto(`${baseUrl}/?seed=${args.seed}&harness=1`);
    await waitForApp(page);
    await settleFrames(page, 10);

    // Camera paths test stroke coherence; bird paths test the animation.
    // gait: run-cycle sweep at a fixed side camera. forage: a scripted
    // run-stop-peck-run behavior pass stepped at 30 fps.
    const paths: Record<string, (i: number, n: number) => Pose | null> = {
      static: () => staticPose(),
      orbit: orbitPose,
      sprint: sprintPose,
      gait: () => null,
      forage: () => null,
    };

    const active = args.paths ? Object.entries(paths).filter(([n]) => args.paths?.includes(n)) : Object.entries(paths);

    for (const [name, poseFn] of active) {
      const dir = join(outRoot, name);
      mkdirSync(dir, { recursive: true });
      const frameCount = name === "static" ? 12 : name === "gait" ? 16 : args.frames;
      const files: string[] = [];

      if (name === "gait") {
        await page.evaluate(() => window.__PKD?.setPose(0.55, 0.22, 0.06, 0, 0.14, 0.02));
      } else if (name === "forage") {
        await page.evaluate(() => window.__PKD?.setPose(1.5, 0.5, 1.9, 0, 0.1, -0.6));
      }

      for (let i = 0; i < frameCount; i++) {
        if (name === "gait") {
          await page.evaluate((ph) => window.__PKD?.birdPreset("run", ph), i / frameCount);
        } else if (name === "forage") {
          // 30 fps script: dash away, brake (auto-peck usually follows), dash again.
          const t = i / 30;
          const running = t < 1.1 || (t > 2.3 && t < 3.1);
          const mz = running ? -1 : 0;
          await page.evaluate(([dt, mx, z]) => window.__PKD?.birdStep(dt, mx, z, false), [1 / 30, 0, mz] as const);
        } else {
          const pose = poseFn(i, frameCount);
          if (pose) {
            await page.evaluate(
              ([p, t]) => window.__PKD?.setPose(p[0], p[1], p[2], t[0], t[1], t[2]),
              [pose.p, pose.t] as const,
            );
          }
        }
        await settleFrames(page, 2);
        const file = join(dir, `f${String(i).padStart(3, "0")}.png`);
        await page.screenshot({ path: file, clip: { x: 0, y: 0, width: args.width, height: args.height } });
        files.push(file);
      }

      const diffs: number[] = [];
      for (let i = 1; i < files.length; i++) diffs.push(meanAbsDiff(files[i - 1], files[i]));
      const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const maxDiff = Math.max(...diffs);
      report[name] = { frames: frameCount, meanDiff, maxDiff };
      console.log(`${name}: ${frameCount} frames, consecutive diff mean=${meanDiff.toFixed(4)} max=${maxDiff.toFixed(4)}`);

      flipbook(dir, files.map((f) => f.slice(dir.length + 1)), `phase ${args.phase} ${name}`);
    }

    const staticReport = report.static;
    const pass = staticReport === undefined ? null : staticReport.maxDiff === 0;
    if (pass !== null) {
      console.log(pass ? "BOIL CHECK PASS: static sequence is pixel-identical" : "BOIL CHECK FAIL: static frames differ — temporal shimmer present");
    }

    writeFileSync(
      join(outRoot, `report${args.paths ? `-${args.paths.join("-")}` : ""}.json`),
      `${JSON.stringify({ capturedAt: new Date().toISOString(), seed: args.seed, size: `${args.width}x${args.height}`, boilCheckPass: pass, paths: report }, null, 2)}\n`,
    );
    if (pass === false) process.exitCode = 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
