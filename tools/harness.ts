import { existsSync } from "node:fs";
import { createServer, type ViteDevServer } from "vite";
import { chromium, type Browser, type Page } from "playwright-core";

/**
 * Shared plumbing for the shot and comparison tools: a Vite dev server on an
 * ephemeral port and a headless Chromium with WebGPU forced onto SwiftShader
 * (this container has no GPU device, so WebGPU runs on CPU Vulkan).
 */

const CHROMIUM_CANDIDATES = [
  process.env.PKD_CHROMIUM,
  "/opt/pw-browsers/chromium",
].filter((p): p is string => typeof p === "string");

export function chromiumExecutable(): string | undefined {
  return CHROMIUM_CANDIDATES.find((p) => existsSync(p));
}

/**
 * WebGPU on a machine with no GPU device: Dawn on SwiftShader for the adapter,
 * and — critically — the compositor on SwiftShader Vulkan/ANGLE as well.
 * Without the Vulkan compositor flags Chromium cannot create the WebGPU
 * swapchain shared image and the device dies at the first present with
 * "A valid external Instance reference no longer exists".
 */
export const WEBGPU_ARGS: readonly string[] = [
  "--enable-unsafe-webgpu",
  "--use-webgpu-adapter=swiftshader",
  "--enable-features=Vulkan",
  "--use-vulkan=swiftshader",
  "--use-gl=angle",
  "--use-angle=swiftshader",
];

export async function startServer(): Promise<{ server: ViteDevServer; baseUrl: string }> {
  const server = await createServer({
    root: process.cwd(),
    logLevel: "warn",
    server: { port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") {
    throw new Error("vite dev server did not report a usable address");
  }
  return { server, baseUrl: `http://localhost:${address.port}` };
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: chromiumExecutable(),
    headless: true,
    args: [...WEBGPU_ARGS],
  });
}

/**
 * Compat shim for the pinned headless Chromium in this container: its WebGPU
 * IDL predates the string form of GPUTextureViewDescriptor.swizzle and throws
 * on the identity swizzle ('rgba') that three r185 always passes. Stripping
 * the identity swizzle is semantically a no-op; three never sets any other
 * value. Current end-user browsers accept it, so the app itself stays clean.
 */
const SWIZZLE_SHIM = `
  if (typeof GPUTexture !== "undefined") {
    const original = GPUTexture.prototype.createView;
    GPUTexture.prototype.createView = function (descriptor) {
      if (descriptor && descriptor.swizzle === "rgba") {
        const { swizzle, ...rest } = descriptor;
        return original.call(this, rest);
      }
      return original.call(this, descriptor);
    };
  }
`;

export async function preparePage(page: Page): Promise<void> {
  await page.addInitScript(SWIZZLE_SHIM);
}

export interface PkdPageState {
  readonly ready: boolean;
  readonly failed: string | null;
  readonly frame: number;
  readonly backend: string;
  readonly adapter: { vendor: string; architecture: string; device: string; description: string } | null;
  readonly computeTest: string;
  readonly shots: readonly string[];
}

/** Wait until the app reports ready, or throw with its failure diagnostics. */
export async function waitForApp(page: Page, timeoutMs = 60_000): Promise<PkdPageState> {
  await page.waitForFunction(
    () => window.__PKD !== undefined && (window.__PKD.ready || window.__PKD.failed !== null),
    undefined,
    { timeout: timeoutMs },
  );
  const state = await page.evaluate((): PkdPageState => {
    const h = window.__PKD;
    if (!h) throw new Error("__PKD hooks vanished");
    return {
      ready: h.ready,
      failed: h.failed,
      frame: h.frame,
      backend: h.backend,
      adapter: h.adapter,
      computeTest: h.computeTest,
      shots: [...h.shots],
    };
  });
  if (state.failed !== null) {
    throw new Error(`app boot failed:\n${state.failed}`);
  }
  return state;
}

/**
 * Let a few frames land so the swapchain has settled before a screenshot.
 * Passed as a string: tsx's esbuild transform injects a `__name` helper into
 * function-valued evaluate callbacks that does not exist in the page realm.
 */
export async function settleFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(`new Promise((resolve) => {
    const start = (window.__PKD && window.__PKD.frame) || 0;
    const poll = () => {
      const now = (window.__PKD && window.__PKD.frame) || 0;
      if (now >= start + ${Math.floor(frames)}) resolve();
      else requestAnimationFrame(poll);
    };
    poll();
  })`);
}
