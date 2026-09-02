import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, preparePage, settleFrames, startServer, waitForApp } from "./harness";

/**
 * The Phase 2 gate: a 2 km run in a straight line, screenshot every 200 m.
 * The bird is driven by scripted birdStep calls; at each checkpoint the
 * camera is posed low behind it (horizon in the upper third) and a frame is
 * captured after the streamers settle. Reports streaming stalls at the end.
 *
 *   npm run trek -- --seed 7 [--palette overcast]
 */

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const seed = Number(arg("--seed", "7"));
  const palette = arg("--palette", "sunset");
  const outDir = join(process.cwd(), "shots", "phase-2");
  mkdirSync(outDir, { recursive: true });

  const { server, baseUrl } = await startServer();
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await preparePage(page);
    page.on("pageerror", (err) => console.error(`[page] ${err.message}`));
    await page.goto(`${baseUrl}/?seed=${seed}&harness=1&palette=${palette}`);
    await waitForApp(page);

    const captures: { m: number; file: string }[] = [];
    for (let checkpoint = 0; checkpoint <= 2000; checkpoint += 200) {
      // Drive the bird east to the checkpoint (2 m/s top speed, 20 ms steps).
      await page.evaluate(`(() => {
        const h = window.__PKD;
        let guard = 0;
        while (h.foodInfo().bird[0] < ${checkpoint} && guard++ < 40000) {
          h.birdStep(0.02, 1, 0, false);
        }
      })()`);
      const state = (await page.evaluate(`(() => {
        const h = window.__PKD;
        const [bx, bz] = h.foodInfo().bird;
        const g = (x, z) => h.groundHeight(x, z);
        h.setPose(bx - 2.6, g(bx - 2.6, bz) + 0.85, bz + 0.9, bx + 14, g(bx + 14, bz) + 0.6, bz);
        return { bx, bz };
      })()`)) as { bx: number; bz: number };
      await settleFrames(page, 10);
      const file = join(outDir, `trek-${String(checkpoint).padStart(4, "0")}m.png`);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 720 }, timeout: 120_000 });
      captures.push({ m: checkpoint, file });
      console.log(`trek ${checkpoint}m  bird=(${state.bx.toFixed(1)}, ${state.bz.toFixed(1)})  ${file}`);
    }

    const stalls = (await page.evaluate(
      "({ stallCount: window.__PKD.stallCount, worstUpdateMs: window.__PKD.worstUpdateMs })",
    )) as { stallCount: number; worstUpdateMs: number };
    console.log(`streaming stalls >8ms: ${stalls.stallCount}  worst update: ${stalls.worstUpdateMs.toFixed(2)} ms`);

    writeFileSync(
      join(outDir, "trek-manifest.json"),
      `${JSON.stringify({ seed, palette, capturedAt: new Date().toISOString(), stalls, captures: captures.map((c) => c.file) }, null, 2)}\n`,
    );
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
