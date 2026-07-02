import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, preparePage, settleFrames, startServer, waitForApp } from "./harness";

/**
 * Shot harness: boots the app headless with WebGPU-on-SwiftShader, walks the
 * registered camera shots, and writes deterministic PNGs plus a manifest to
 * shots/phase-<N>/.
 *
 *   npm run shots -- --phase 0 --seed 7
 */

interface Args {
  readonly phase: number;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly only: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  return {
    phase: Number(get("--phase") ?? 0),
    seed: Number(get("--seed") ?? 7),
    width: Number(get("--width") ?? 1280),
    height: Number(get("--height") ?? 720),
    only: get("--only"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = join(process.cwd(), "shots", `phase-${args.phase}`);
  mkdirSync(outDir, { recursive: true });

  const { server, baseUrl } = await startServer();
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: 1,
    });
    await preparePage(page);
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[page] ${msg.text()}`);
    });
    page.on("pageerror", (err) => console.error(`[page] ${err.message}`));

    await page.goto(`${baseUrl}/?seed=${args.seed}&harness=1`);
    const state = await waitForApp(page);

    const a = state.adapter;
    console.log(`backend: ${state.backend}`);
    console.log(`adapter: ${a?.vendor ?? "?"} / ${a?.architecture ?? "?"} ${a?.description ?? ""}`.trimEnd());
    console.log(`compute self-test: ${state.computeTest}`);

    const shotNames = state.shots.filter((s) => args.only === null || s === args.only);
    if (shotNames.length === 0) {
      throw new Error(`no shots matched (available: ${state.shots.join(", ")})`);
    }

    const canvas = page.locator("#app canvas");
    for (const name of shotNames) {
      const ok = await page.evaluate((n) => window.__PKD?.setShot(n) ?? false, name);
      if (!ok) throw new Error(`setShot(${name}) failed`);
      await settleFrames(page, 8);
      const file = join(outDir, `${name}.png`);
      await canvas.screenshot({ path: file });
      console.log(`shot: ${file}`);
    }

    const manifest = {
      phase: args.phase,
      seed: args.seed,
      size: `${args.width}x${args.height}`,
      capturedAt: new Date().toISOString(),
      backend: state.backend,
      adapter: state.adapter,
      computeTest: state.computeTest,
      shots: shotNames,
    };
    writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`manifest: ${join(outDir, "manifest.json")}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
