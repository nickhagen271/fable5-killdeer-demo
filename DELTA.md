# DELTA.md — reference-delta log

Per the project doc, every phase closes with: render the closest matching
shots, place them beside the references, list the ten most visually
significant differences ranked by impact, fix the top three, re-shoot.

---

## Phase 1 — 2026-07-02, seed 7

Comparison set: `shots/phase-1/compare/`. Coherence evidence:
`shots/phase-1/motion/report.json` (sequences regenerable via `npm run motion`).

**What phase 1 built.** The paint core: ~106k world-anchored stroke ribbons in
three LOD rings, placed by a GPU compute kernel deterministically from
(world tile, slot, seed) and streamed as the camera moves; real ridge
geometry along each stroke; analytic cross-section shading with ridge
self-shadow and anisotropic wet-paint sheen; a bounded palette enforced by a
generated value-quantized LUT; broken color from a shared color-script field;
a canvas-tooth underpaint; stochastic distance erosion for LOD transitions.

**The temporal-anchoring solution.** No screen-space stroke term exists
anywhere in the pipeline — strokes are geometry fixed in world space, so
camera motion reprojects them exactly like any surface. LOD transitions
erode stroke-by-stroke, driven only by camera distance. Verification:

- **Static boil check: PASS.** 12 frames at a fixed camera are
  pixel-identical (mean and max consecutive diff exactly 0). Nothing boils.
- **Orbit and sprint flipbooks:** strokes track the ground rigidly through a
  full 360° orbit and an 8 m/s ground-level sprint; no screen-space crawl.
  (`shots/phase-1/motion/*/index.html`.)

### Top ten deltas (ranked by impact)

1. **Stroke size too uniform within a ring.** References mix broad loaded
   passages with small ticks in one passage. → **FIXED:** skewed
   length/width distribution (many small, occasional 1.75× broad).
2. **Far lit band read as hot glitter.** Sub-pixel sheen at distance was
   sparkle, a shimmer risk. → **FIXED:** sheen fades out beyond ~85 m; it is
   a near-field effect.
3. **Value masses too gentle at vista scale.** → **FIXED (partially):**
   broad-noise weight and contrast stretch raised; stroke value span widened
   (0.14–0.71 → LUT). Desaturated vista (`shots/phase-1/value-vista.png`)
   reads ~4 masses, still softer than the references — the true dark accent
   mass arrives with phase-3 vegetation clumps rather than forcing mud now.
4. **Sky is still the phase-0 placeholder.** No cloud brushwork; reads
   airbrushed beside Ref 1. Phase 3–4 scope.
5. **Edge control is uniform.** Every stroke edge equally crisp; no lost
   edges, no dark accents. The phase-4 edge pass.
6. **Poppy notes read as scattered confetti,** not clustered flower heads
   with stems and mass. Real flowers are phase-3 geometry.
7. **Flow field striping.** Some passages read as mechanical parallel
   combing; needs a second cross-direction stroke population (phase 3
   grass will largely supersede).
8. **No inter-stroke shadowing.** Ridges self-shadow, but strokes don't
   shade neighbors; thick passages lack pile-up occlusion.
9. **Canvas tooth barely reads** in the committed shots (visible only inside
   ~9 m and mostly covered by near strokes). Acceptable but thin passages
   deserve more tooth once wind/thin areas exist.
10. **Distant strokes lose directional read** into fine noise; references
    dissolve warmer and chunkier. Tune L0 length/palette later.

Top three actionable (1, 2, 3) fixed and re-shot; comparisons in
`shots/phase-1/compare/` are the post-fix state.

### Verification battery (phase 1)

- **Coherence test: PASS** (static diff exactly 0; orbit/sprint rigid).
- **Filter test: PASS by construction** — there is no post filter; paint
  color comes from LUT samples and stroke geometry in the shading model.
  There is no final grade yet to toggle (arrives phase 4).
- **Value test: PASS with reservations** (see delta 3).
- **Palette test: PASS structurally** — pigment color is LUT-sampled
  (bounded rows × 6 value steps); relief lighting and sheen modulate value
  multiplicatively but hue stays palette-locked. Broken color present on
  ground (strokes + underpaint drift); sky family is a separate bounded set.
- **Killdeer test: n/a** (phase 2).
- **Contact sheet:** vista / ground / detail / macro / sky in
  `shots/phase-1/`.

### Self-score rubric (phase 1)

| Row | Score | What raises this by 2 |
|---|---|---|
| Brushwork & impasto fidelity | 5 | Bristle-broken silhouettes + inter-stroke occlusion (8) |
| Palette & value structure | 5 | A true dark vegetation mass (phase 3); warmer distant dissolve (10) |
| Broken color | 6 | Cluster flower notes into heads (6); cross-direction accents (7) |
| Edge control | 3 | The phase-4 lost-and-found edge pass |
| **Stroke coherence in motion** | 8 | Anti-aliased stroke edges under MSAA at sub-pixel scale (residual aliasing shimmer on fine far strokes) |
| Killdeer identity | — | Phase 2 |
| Killdeer animation | — | Phase 2 |
| Field & environment painting | 4 | Real grass/flower stroke populations and treeline (phase 3) |
| Wind & motion | — | Phase 4 |
| Composition & camera | 3 | A subject (the bird), framing tuned against Ref 1 |

Cheapest +2s implemented this phase: sheen distance fade (2) and stroke size
distribution (1). The remaining rows' raisers belong to phases 2–4.

---

## Phase 0 — 2026-07-02, seed 7

Comparison set: `shots/phase-0/compare/` (vista vs Ref 1, ground vs Ref 2,
sky vs Ref 1, detail vs Ref 4). Regenerate with `npm run shots && npm run compare`.

**Context.** Phase 0 renders come from a placeholder smoke-test scene — a
noise-shaded ground plane and sky dome, shaded by hand in TSL. The stroke
system does not exist yet. The point of this pass is to seed the delta loop
and pull the placeholder's palette and value structure toward the references
so phase 1 starts from an honest baseline, not to fake paint without strokes.

### Top ten deltas (ranked by impact)

1. **No strokes, no brushwork.** Every surface is a smooth noise wash. The
   references are built entirely from visible directional strokes. This is
   the whole of phase 1; not addressable in phase 0.
2. **Sky reads as airbrushed haze, not painted cloud.** Ref 1's sky is massed
   cumulus with shaped edges and blue between. → **FIXED (phase-0 level):**
   plane-projected, thresholded cloud masses with lit tops, cool undersides,
   and blue sky between. Cloud-as-brushwork remains for phases 3–4.
3. **Field was near single-hue green mush.** The references break every green
   into green/yellow/ochre/blue-green/violet with red accents. → **FIXED:**
   broken-color amplitude raised, violet share up, and sparse rose/poppy
   flecks scattered in drifts.
4. **No distant value mass.** Ref 1 holds a darker cool band (treeline) at the
   horizon that anchors the value structure. → **FIXED (as value only):** the
   field cools into a grey-violet far band before the haze. Real treeline
   strokes are phase 3.
5. **Razor-edged horizon.** → **FIXED:** widened ground-haze ramp and a wide
   dome blend band; the seam now dissolves. Proper lost-and-found edge logic
   is the phase-4 edge pass.
6. **No impasto relief.** Nothing catches grazing light; no paint body where
   the light piles. Phase 1.
7. **No subject.** The references hang their composition on figures/trees; our
   frame has no killdeer yet. Phase 2.
8. **Field value range too narrow.** The references carry dark green accent
   masses (bushes, shadow clumps) giving 4–5 clean value masses; we have ~3.
9. **Cloud undersides are neutral grey.** Ref 1's are violet-grey and warm;
   temperature logic in the sky needs the warm-cool ramp treatment too.
10. **One texture scale everywhere.** The references change stroke scale with
    distance (blades and flower heads near, masses far). Needs the stroke
    system's distance-constant scaling (phase 1).

Top three actionable (2, 3, 4+5) fixed and re-shot; the comparison PNGs in
`shots/phase-0/compare/` are the post-fix state.

### Self-score rubric (phase 0)

Scored only where phase 0 has anything to score. 10 = passes a one-second
glance vs the reference; 7 = clearly synthetic, same class; 4 = good hobby
demo; 2 = filter-on-top fake.

| Row | Score | What raises this by 2 |
|---|---|---|
| Brushwork & impasto fidelity | 1 | Any strokes at all (phase 1 stroke field + height pass) |
| Palette & value structure | 5 | A real palette LUT + darker fourth value mass in the field |
| Broken color | 4 | Per-stroke color jitter instead of smooth noise washes |
| Edge control | 3 | Lost-and-found silhouette pass; currently only the hazed horizon |
| Stroke coherence in motion | — | No strokes yet; this is the phase-1 gate |
| Killdeer identity | — | Phase 2 |
| Killdeer animation | — | Phase 2 |
| Field & environment painting | 3 | Grass/flowers as geometry-backed strokes, treeline masses (phase 3) |
| Wind & motion | — | Phase 4 |
| Composition & camera | 3 | A subject (the bird) and shot framing tuned against Ref 1 |

The two cheapest +2s available inside phase 0 scope (sky masses, field broken
color + flecks) were implemented as the top-three delta fixes above.
