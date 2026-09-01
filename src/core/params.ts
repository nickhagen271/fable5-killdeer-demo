/**
 * URL parameters that configure a run.
 *
 * `?seed=N`    — deterministic seed for everything procedural.
 * `?shot=name` — start on a named camera shot (used by the Playwright harness).
 * `?harness=1` — harness mode: fixed timestep, no controls damping, HUD hidden,
 *                so a shot is reproducible pixel-for-pixel.
 * `?hud=0|1`   — force the HUD on or off (defaults: on interactively, off in harness).
 * `?grade=0`   — disable the final color-script grade (the filter test).
 * `?post=0`    — bypass the painterly post stack entirely (debugging only:
 *                the raw stroke render, before the frame becomes paint).
 */
export interface BootParams {
  readonly seed: number;
  readonly shot: string | null;
  readonly harness: boolean;
  readonly hud: boolean;
  readonly grade: boolean;
  readonly post: boolean;
}

export const DEFAULT_SEED = 1;

export function readParams(search: string): BootParams {
  const q = new URLSearchParams(search);

  const seedRaw = q.get("seed");
  const seedNum = seedRaw === null ? DEFAULT_SEED : Number(seedRaw);
  const seed = Number.isFinite(seedNum) ? Math.floor(seedNum) : DEFAULT_SEED;

  const harness = q.get("harness") === "1";

  const hudRaw = q.get("hud");
  const hud = hudRaw === null ? !harness : hudRaw === "1";

  const grade = q.get("grade") !== "0";
  const post = q.get("post") !== "0";

  return { seed, shot: q.get("shot"), harness, hud, grade, post };
}
