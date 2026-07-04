import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, preparePage, settleFrames, startServer, waitForApp } from "./harness";

/**
 * Foraging gate test: steer the bird to the nearest seeded food spot with the
 * scripted controller, peck, and assert the spot is consumed. Deterministic
 * per seed. Writes before/after evidence frames.
 *
 *   npm run forage -- --seed 7
 */

function parseSeed(argv: readonly string[]): number {
  const i = argv.indexOf("--seed");
  return i >= 0 && i + 1 < argv.length ? Number(argv[i + 1]) : 7;
}

async function main(): Promise<void> {
  const seed = parseSeed(process.argv.slice(2));
  const outDir = join(process.cwd(), "shots", "phase-3");
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

    const info = () =>
      page.evaluate(() => window.__PKD?.foodInfo() ?? null);

    const start = await info();
    if (!start || start.nearest === null) throw new Error("no food spots reported");
    console.log(`spots: ${start.total}, nearest at (${start.nearest[0].toFixed(2)}, ${start.nearest[1].toFixed(2)})`);

    // Walk toward the nearest spot at 30 fps; re-aim each step.
    const maxSteps = 900;
    let arrived = false;
    for (let i = 0; i < maxSteps; i++) {
      const s = await info();
      if (!s || !s.nearest) throw new Error("food info vanished");
      const dx = s.nearest[0] - s.bird[0];
      const dz = s.nearest[1] - s.bird[1];
      const d = Math.hypot(dx, dz);
      if (d < 0.11) {
        arrived = true;
        break;
      }
      const n = Math.max(d, 1e-6);
      await page.evaluate(
        ([mx, mz]) => window.__PKD?.birdStep(1 / 30, mx, mz, false),
        [dx / n, dz / n] as const,
      );
    }
    if (!arrived) throw new Error("bird never reached the food spot");

    // Settle to a stop, frame the moment, then peck.
    for (let i = 0; i < 12; i++) await page.evaluate(() => window.__PKD?.birdStep(1 / 30, 0, 0, false));
    const before = await info();
    const pose = await info();
    if (pose) {
      await page.evaluate(
        ([x, z]) => window.__PKD?.setPose(x + 0.55, 0.32, z + 0.6, x, 0.1, z),
        [pose.bird[0], pose.bird[1]] as const,
      );
    }
    await settleFrames(page, 2);
    await page.screenshot({ path: join(outDir, "forage_before.png"), clip: { x: 0, y: 0, width: 960, height: 540 }, timeout: 120_000 });

    await page.evaluate(() => window.__PKD?.birdStep(1 / 30, 0, 0, true));
    for (let i = 0; i < 30; i++) await page.evaluate(() => window.__PKD?.birdStep(1 / 30, 0, 0, false));
    await settleFrames(page, 2);
    await page.screenshot({ path: join(outDir, "forage_after.png"), clip: { x: 0, y: 0, width: 960, height: 540 }, timeout: 120_000 });

    const after = await info();
    const ate = (after?.eaten ?? 0) > (before?.eaten ?? 0);
    console.log(`eaten before=${before?.eaten ?? "?"} after=${after?.eaten ?? "?"}`);
    console.log(ate ? "FORAGE GATE PASS: peck connected and consumed the spot" : "FORAGE GATE FAIL: nothing was eaten");
    if (!ate) process.exitCode = 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
