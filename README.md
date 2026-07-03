# PROJECT Killdeer — Prototype v1

A hyper-stylized impasto web game proof of concept. You are the bird. The full
brief lives in [PROJECT_Killdeer_Prototype_v1.md](PROJECT_Killdeer_Prototype_v1.md);
the running reference-delta log in [DELTA.md](DELTA.md).

**Status: phase 2 complete** — the killdeer. A fully procedural bird (mesh
sculpted in code, markings painted in part-local space through the shared
palette LUT: both black breast bands, white collar, face pattern, orange
eye ring, rust rump), a procedural animation state machine (run,
run-stop-peck, idle with weight shifts and preens, alert freeze), player
control with plover locomotion, and a damped third-person follow camera.
Phase 1 delivered the paint core: ~106k world-anchored impasto stroke
ribbons with the coherence gate passing (pixel-identical static frames,
ground-locked orbit/sprint). Phase 0 delivered the scaffold, strict WebGPU
init, HUD, shot harness, and comparison tooling.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — requires a WebGPU browser
```

- `?seed=N` — deterministic procedural seed
- `h` — toggle the debug HUD, `1`–`4` — camera shots, drag — orbit

## Harness

```sh
npm run shots   -- --phase 2 --seed 7   # headless WebGPU screenshots → shots/phase-2/
npm run compare -- --phase 2            # side-by-sides vs /reference → shots/phase-2/compare/
npm run motion  -- --seed 7 --phase 2   # coherence battery: static boil check (must be
                                        # pixel-identical), orbit + sprint flipbooks, plus
                                        # bird sequences: --paths gait,forage
npm run typecheck
npm run build
```

The harness runs headless Chromium with WebGPU on SwiftShader (CPU), so it
works on GPU-less machines; the flag recipe is in `tools/harness.ts`.

## Layout

```
src/paint/    the paint system: palette LUT, shared fields (light/flow/color
              script), stroke compute + impasto material, underpaint
src/bird/     the killdeer: procedural mesh + markings, paint material,
              animation state machine, player bird
src/render/   WebGPU init, diagnostics, compute self-test
src/world/    field assembly, sky dome, follow camera
src/debug/    HUD
src/core/     params, seeded RNG, harness hooks
tools/        shot / comparison / motion-coherence harness (Playwright)
reference/    the paintings every phase is judged against
shots/        phase-gated captures and comparisons (committed per phase)
```

Controls: `WASD`/arrows run the killdeer, `space` pecks, `f` alert-freezes,
`c` toggles a free inspection camera, `h` HUD.
