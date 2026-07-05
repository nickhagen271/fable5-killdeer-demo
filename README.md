# PROJECT Killdeer — Prototype v1

A hyper-stylized impasto web game proof of concept. You are the bird. The full
brief lives in [PROJECT_Killdeer_Prototype_v1.md](PROJECT_Killdeer_Prototype_v1.md);
the running reference-delta log in [DELTA.md](DELTA.md).

**Status: prototype complete (all four phases).** Phase 4 — breath and
polish — added the seeded wind field (grass bows, flower heads pendulum,
clouds drift, all off one field; frozen-time deterministic in the harness),
the painted edge pass (sparse dark accents along shadow-mass boundaries, no
outline shader), the final color-script grade (`?grade=0` for the raw
frame), a stronger sky, and the composed `hero` / `monet` frames — `hero`
is the final-acceptance one-frame test. Phase 3 delivered the field (grass,
poppy-dominant flowers, treeline, foraging loop with `npm run forage`
asserting the connect). Phase 2 delivered the procedural killdeer (both
breast bands, plover run-stop-peck state machine, follow camera). Phase 1
delivered the paint core with the coherence gate passing (pixel-identical
static frames, ground-locked orbit/sprint). Phase 0 delivered the scaffold,
strict WebGPU init, HUD, and the harness tooling. The last gate is yours:
run it and move the bird.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — requires a WebGPU browser
```

- `?seed=N` — deterministic procedural seed
- `h` — toggle the debug HUD, `1`–`4` — camera shots, drag — orbit

## Harness

```sh
npm run shots   -- --phase 4 --seed 7   # headless WebGPU screenshots → shots/phase-4/
npm run compare -- --phase 4            # side-by-sides vs /reference → shots/phase-4/compare/
npm run motion  -- --seed 7 --phase 4   # coherence battery: static boil check (must be
                                        # pixel-identical), orbit + sprint flipbooks, bird
                                        # sequences (gait, forage) and the wind path
npm run forage  -- --seed 7             # foraging gate: approach → peck → consume, asserted
npm run typecheck
npm run build
```

The harness runs headless Chromium with WebGPU on SwiftShader (CPU), so it
works on GPU-less machines; the flag recipe is in `tools/harness.ts`.

## Layout

```
src/paint/    the paint system: palette LUT, shared fields (light/flow/color
              script), stroke compute + impasto material, vegetation
              (grass tufts, flowers), underpaint
src/bird/     the killdeer: procedural mesh + markings, paint material,
              animation state machine, player bird
src/render/   WebGPU init, diagnostics, compute self-test
src/world/    field assembly, sky dome, treeline, food spots, follow camera
src/debug/    HUD
src/core/     params, seeded RNG, harness hooks
tools/        shot / comparison / motion-coherence harness (Playwright)
reference/    the paintings every phase is judged against
shots/        phase-gated captures and comparisons (committed per phase)
```

Controls: `WASD`/arrows run the killdeer, `space` pecks, `f` alert-freezes,
`c` toggles a free inspection camera, `h` HUD. `?grade=0` shows the raw
painted frame without the final glaze; `?seed=N` reseeds the whole field.
