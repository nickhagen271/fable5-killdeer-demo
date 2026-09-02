import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { launchBrowser, preparePage, settleFrames, startServer, waitForApp } from "./harness";

/**
 * One-off debug captures: boot the app with an arbitrary query string and
 * screenshot it. `npm run probe -- --query "seed=7&shot=vista&post=0" --out hills`
 */

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const query = arg("--query", "seed=7&harness=1");
  const out = arg("--out", "probe");
  const outDir = join(process.cwd(), "shots", "probe");
  mkdirSync(outDir, { recursive: true });

  const { server, baseUrl } = await startServer();
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await preparePage(page);
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`[page] ${msg.text()}`);
    });
    page.on("pageerror", (err) => console.error(`[page] ${err.message}`));
    await page.goto(`${baseUrl}/?${query.includes("harness=") ? query : `${query}&harness=1`}`);
    await waitForApp(page);
    await settleFrames(page, 8);
    const file = join(outDir, `${out}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1280, height: 720 }, timeout: 120_000 });
    console.log(`probe: ${file}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
