import { preview } from "vite";
import { launchBrowser, preparePage, settleFrames, waitForApp } from "./harness";

/**
 * The deploy gate: serve the PRODUCTION build exactly as GitHub Pages will
 * (same `base`), boot it in a fresh browser, and require a real first
 * frame. Catches base-path and bundling breakage that `npm run dev` hides.
 *
 *   npm run build && npm run distcheck
 */
async function main(): Promise<void> {
  const server = await preview({ preview: { port: 0, strictPort: false }, logLevel: "warn" });
  const local = server.resolvedUrls?.local[0];
  if (local === undefined) throw new Error("preview server reported no URL");
  // Serve under the configured base — the exact path Pages will use.
  const url = new URL(server.config.base, local).href;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await preparePage(page);
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    console.log(`serving production build at ${url}`);
    await page.goto(`${url}?seed=7&harness=1`);
    const state = await waitForApp(page);
    await settleFrames(page, 5);
    const frames = await page.evaluate("window.__PKD.frame");

    console.log(`backend: ${state.backend}  compute: ${state.computeTest}  frames: ${String(frames)}`);
    if (errors.length > 0) {
      console.log(`page errors:\n  ${errors.join("\n  ")}`);
    }
    if (typeof frames === "number" && frames > 3 && errors.length === 0) {
      console.log("DEPLOY GATE PASS: the production bundle boots and renders");
    } else {
      console.log("DEPLOY GATE FAIL");
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
