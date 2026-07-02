import { WebGPURenderer } from "three/webgpu";
import type { AdapterReport } from "../core/hooks";
import { environmentDetails, failLoud } from "./diagnostics";

export interface GpuInit {
  readonly renderer: WebGPURenderer;
  readonly adapter: AdapterReport;
}

interface WebGPUBackendLike {
  readonly isWebGPUBackend: true;
}

function isWebGPUBackend(backend: object): backend is WebGPUBackendLike {
  return "isWebGPUBackend" in backend;
}

/**
 * Strict WebGPU bring-up. Pre-flights the adapter for diagnostics, creates a
 * WebGPURenderer with the fallback disabled, and verifies after init that the
 * live backend really is WebGPU — three would otherwise quietly hand us WebGL2.
 */
export async function initWebGPU(container: HTMLElement): Promise<GpuInit> {
  if (!("gpu" in navigator) || navigator.gpu === undefined) {
    failLoud("navigator.gpu is not available", [
      "The browser does not expose the WebGPU API in this context.",
      "",
      ...environmentDetails(),
      "",
      "Likely causes:",
      "  - Browser without WebGPU support (need recent Chromium/Firefox/Safari).",
      "  - Insecure context (WebGPU requires https:// or localhost).",
      "  - Headless Chromium without flags. Try:",
      "      --enable-unsafe-webgpu --enable-features=Vulkan --use-webgpu-adapter=swiftshader",
    ]);
  }

  let adapter: GPUAdapter | null = null;
  let adapterError: unknown = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch (err) {
    adapterError = err;
  }

  if (adapter === null) {
    failLoud("no WebGPU adapter", [
      "navigator.gpu.requestAdapter() returned null — no usable GPU adapter.",
      adapterError !== null ? `requestAdapter threw: ${String(adapterError)}` : "",
      "",
      ...environmentDetails(),
      "",
      "On a machine without a GPU, Chromium can run WebGPU on CPU via SwiftShader:",
      "  --enable-unsafe-webgpu --use-webgpu-adapter=swiftshader",
    ]);
  }

  const info = adapter.info;
  const report: AdapterReport = {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
  };

  const renderer = new WebGPURenderer({ antialias: true, forceWebGL: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);

  try {
    await renderer.init();
  } catch (err) {
    failLoud("WebGPURenderer.init() failed", [
      String(err),
      "",
      `adapter: vendor=${report.vendor} architecture=${report.architecture}`,
      `         device=${report.device} description=${report.description}`,
      "",
      ...environmentDetails(),
    ]);
  }

  if (!isWebGPUBackend(renderer.backend)) {
    failLoud("renderer fell back to a non-WebGPU backend", [
      `Live backend: ${renderer.backend.constructor.name}`,
      "This build allows no WebGL path. Refusing to continue.",
      "",
      `adapter preflight succeeded (vendor=${report.vendor}), so the failure`,
      "happened inside device/context creation. Check the console for Dawn errors.",
    ]);
  }

  container.appendChild(renderer.domElement);
  return { renderer, adapter: report };
}
