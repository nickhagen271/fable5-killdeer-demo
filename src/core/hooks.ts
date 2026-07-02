/**
 * Test hooks exposed on `window.__PKD` for the Playwright shot harness.
 * The harness waits on `ready`/`failed`, switches shots, and reads reports.
 */
export interface AdapterReport {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
}

export type ComputeTestState = "pending" | "pass" | "fail";

export interface PkdHooks {
  ready: boolean;
  /** Human-readable failure report if boot failed; null otherwise. */
  failed: string | null;
  frame: number;
  seed: number;
  backend: string;
  adapter: AdapterReport | null;
  computeTest: ComputeTestState;
  shots: readonly string[];
  /** Switch to a named shot. Returns false if the name is unknown. */
  setShot: (name: string) => boolean;
}

declare global {
  interface Window {
    __PKD?: PkdHooks;
  }
}

export function installHooks(seed: number): PkdHooks {
  const hooks: PkdHooks = {
    ready: false,
    failed: null,
    frame: 0,
    seed,
    backend: "none",
    adapter: null,
    computeTest: "pending",
    shots: [],
    setShot: () => false,
  };
  window.__PKD = hooks;
  return hooks;
}
