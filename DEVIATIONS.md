# DEVIATIONS

Infeasible-as-specified items and the nearest feasible alternative actually
built, per the v2 operating instructions.

## 1. `/reference/v2/` images absent from the repository

**Spec:** every phase is judged against four reference paintings in
`/reference/v2/` (`ref_a_evening_meadow.jpg`, `ref_b_misty_poppies.jpg`,
`ref_c_valley_hills.jpg`, `ref_d_sunset_meadow.jpg`), with a mandatory
side-by-side delta loop.

**Reality:** the repository's `reference/` folder contains the v1 references
(`Ref 1..4.jpg` — two Monet meadows and two garden scenes) and three killdeer
photos (`KD1..3.png`). No `/reference/v2/` images were provided with the v2
prompt.

**Alternative built:** the delta loop is run against (a) the spec's own
detailed written descriptions of the four references — composition rules,
palette hex anchors, edge/depth behavior — which are treated as the ground
truth they encode, and (b) the closest available v1 references where they
overlap (`Ref 1.jpg` for the ref_a/ref_c meadow-under-sky composition,
`Ref 2.jpg` for the ref_b poppy-drift softening). `DELTA.md` states, for each
phase, which written criteria the render was compared against. If the actual
v2 images are added later, drop them into `reference/v2/` under the spec's
filenames and re-run the delta loop; nothing else needs to change.

## 2. Killdeer references

**Spec:** `/reference/killdeer/` photos. **Reality:** the photos exist but at
`reference/KD1.png .. KD3.png`. They are used as-is for the Phase 3
turnaround comparison (no copies made, to keep the repo lean).
