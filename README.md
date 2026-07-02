# PROJECT Killdeer — Prototype v1

A hyper-stylized impasto web game proof of concept. You are the bird. The full
brief lives in [PROJECT_Killdeer_Prototype_v1.md](PROJECT_Killdeer_Prototype_v1.md);
the running reference-delta log in [DELTA.md](DELTA.md).

**Status: phase 0 complete** — scaffold, strict WebGPU init (no WebGL
fallback, fail-loud diagnostics), GPU compute self-test, debug HUD, Playwright
shot harness, and the side-by-side reference comparison tool. The scene it
renders is a placeholder; the paint system arrives in phase 1.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 — requires a WebGPU browser
```

- `?seed=N` — deterministic procedural seed
- `h` — toggle the debug HUD, `1`–`4` — camera shots, drag — orbit

## Harness

```sh
npm run shots   -- --phase 0 --seed 7   # headless WebGPU screenshots → shots/phase-0/
npm run compare -- --phase 0            # side-by-sides vs /reference → shots/phase-0/compare/
npm run typecheck
npm run build
```

The harness runs headless Chromium with WebGPU on SwiftShader (CPU), so it
works on GPU-less machines; the flag recipe is in `tools/harness.ts`.

## Layout

```
src/render/   WebGPU init, diagnostics, compute self-test
src/world/    scene (phase 0: placeholder boot scene)
src/debug/    HUD
src/core/     params, seeded RNG, harness hooks
tools/        shot + comparison harness (Playwright)
reference/    the paintings every phase is judged against
shots/        phase-gated captures and comparisons (committed per phase)
```
