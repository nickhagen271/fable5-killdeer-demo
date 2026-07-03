# PROJECT Killdeer — Prototype v1

A hyper-stylized impasto web game proof of concept. You are the bird. The full
brief lives in [PROJECT_Killdeer_Prototype_v1.md](PROJECT_Killdeer_Prototype_v1.md);
the running reference-delta log in [DELTA.md](DELTA.md).

**Status: phase 1 complete** — the paint core. One ground surface painted
with ~106k world-anchored impasto stroke ribbons (GPU-compute placed, tile
streamed, deterministic per seed), palette-LUT shading with broken color,
canvas-tooth underpaint, and the temporal-anchoring solution. The coherence
gate passes: a fixed camera renders pixel-identical frames (zero boil), and
orbit/sprint sequences show strokes locked to the ground. Phase 0 delivered
the scaffold, strict WebGPU init, HUD, shot harness, and comparison tooling.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — requires a WebGPU browser
```

- `?seed=N` — deterministic procedural seed
- `h` — toggle the debug HUD, `1`–`4` — camera shots, drag — orbit

## Harness

```sh
npm run shots   -- --phase 1 --seed 7   # headless WebGPU screenshots → shots/phase-1/
npm run compare -- --phase 1            # side-by-sides vs /reference → shots/phase-1/compare/
npm run motion  -- --seed 7             # coherence battery: static boil check (must be
                                        # pixel-identical), orbit + sprint flipbooks
npm run typecheck
npm run build
```

The harness runs headless Chromium with WebGPU on SwiftShader (CPU), so it
works on GPU-less machines; the flag recipe is in `tools/harness.ts`.

## Layout

```
src/paint/    the paint system: palette LUT, shared fields (light/flow/color
              script), stroke compute + impasto material, underpaint
src/render/   WebGPU init, diagnostics, compute self-test
src/world/    field assembly, sky dome
src/debug/    HUD
src/core/     params, seeded RNG, harness hooks
tools/        shot / comparison / motion-coherence harness (Playwright)
reference/    the paintings every phase is judged against
shots/        phase-gated captures and comparisons (committed per phase)
```

Controls: `WASD` glide (`shift` sprints), drag orbits, `1`–`5` camera shots,
`h` HUD.
