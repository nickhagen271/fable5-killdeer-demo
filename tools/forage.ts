import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, preparePage, settleFrames, startServer, waitForApp } from "./harness";

/**
 * The Phase 4 playtest gate: find and eat TEN worms in under three minutes
 * of simulated play, with no marker — the scripted controller only does what
 * a player can (run, stop, peck); worm positions come from the same
 * head-tilt-range information the game itself surfaces. Reports the
 * simulated clock and writes evidence frames.
 *
 *   npm run forage -- --seed 7
 */

const DT = 1 / 30;
const LIMIT_SECONDS = 180;
const TARGET_WORMS = 10;

function parseSeed(argv: readonly string[]): number {
  const i = argv.indexOf("--seed");
  return i >= 0 && i + 1 < argv.length ? Number(argv[i + 1]) : 7;
}

async function main(): Promise<void> {
  const seed = parseSeed(process.argv.slice(2));
  const outDir = join(process.cwd(), "shots", "phase-4");
  mkdirSync(outDir, { recursive: true });

  const { server, baseUrl } = await startServer();
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await preparePage(page);
    page.on("pageerror", (err) => console.error(`[page] ${err.message}`));

    await page.goto(`${baseUrl}/?seed=${seed}&harness=1`);
    await waitForApp(page);
    await settleFrames(page, 6);

    const info = () => page.evaluate(() => window.__PKD?.foodInfo() ?? null);

    let simT = 0;
    const step = async (mx: number, mz: number, peck: boolean, n = 1): Promise<void> => {
      await page.evaluate(
        ([a, b, p, k]) => {
          for (let i = 0; i < (k as number); i++) {
            window.__PKD?.birdStep(1 / 30, a as number, b as number, (p as boolean) && i === 0);
          }
        },
        [mx, mz, peck, n] as const,
      );
      simT += DT * n;
    };

    const start = await info();
    if (!start || start.nearest === null) throw new Error("no worms reported");
    console.log(`resident worms: ${start.total}`);

    let lastEaten = 0;
    while (simT < LIMIT_SECONDS) {
      const s = await info();
      if (!s) throw new Error("worm info vanished");
      if (s.eaten >= TARGET_WORMS) break;
      if (!s.nearest) throw new Error("no worm in the resident ring");

      const dx = s.nearest[0] - s.bird[0];
      const dz = s.nearest[1] - s.bird[1];
      const d = Math.hypot(dx, dz);
      if (d > 0.16) {
        // Run toward it (chunked steps keep the page round-trips sane).
        const n = Math.max(d, 1e-6);
        await step(dx / n, dz / n, false, d > 1.2 ? 8 : 2);
      } else {
        // Stop, peck, ride out the peck animation.
        await step(0, 0, false, 6);
        await step(0, 0, true, 1);
        await step(0, 0, false, 24);
        const after = await info();
        if (after && after.eaten > lastEaten) {
          lastEaten = after.eaten;
          console.log(`worm ${after.eaten} at t=${simT.toFixed(1)}s`);
          if (after.eaten === TARGET_WORMS - 1) {
            // Frame the hunt just before the last catch.
            await page.evaluate(
              ([x, z]) => {
                const g = window.__PKD?.groundHeight(x as number, z as number) ?? 0;
                window.__PKD?.setPose((x as number) + 0.55, g + 0.35, (z as number) + 0.6, x as number, g + 0.1, z as number);
              },
              [after.bird[0], after.bird[1]] as const,
            );
            await settleFrames(page, 3);
            await page.screenshot({
              path: join(outDir, "forage_hunt.png"),
              clip: { x: 0, y: 0, width: 960, height: 540 },
              timeout: 120_000,
            });
          }
        }
      }
    }

    const end = await info();
    const eaten = end?.eaten ?? 0;
    console.log(`eaten ${eaten}/${TARGET_WORMS} in ${simT.toFixed(1)}s simulated`);
    if (eaten >= TARGET_WORMS && simT < LIMIT_SECONDS) {
      console.log("FORAGE GATE PASS: ten worms inside three minutes, no markers");
    } else {
      console.log("FORAGE GATE FAIL");
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
