# DELTA.md — reference-delta log

Per the project doc, every phase closes with: render the closest matching
shots, place them beside the references, list the ten most visually
significant differences ranked by impact, fix the top three, re-shoot.

---

## Phase 4 — 2026-07-05, seed 7 — FINAL

Comparison set: `shots/phase-4/compare/` (13 pairs, now including the two
composed frames). Final acceptance frame: `shots/phase-4/hero.png` beside
Ref 2 in the gallery. Battery: `shots/phase-4/motion/report.json`.

**What phase 4 built.** The breath and the close: a seeded wind field (one
global gentle direction, travelling primary wave + drifting gust noise) that
grass bows to, flowers pendulum on, and the cloud layer drifts with — all
from one shared field so the painting moves together; the edge pass done
with paint (sparse deep-cool accent ticks laid along shadow-mass boundaries
by a compute kernel probing the mask's gradient — never a uniform outline);
the final color-script grade (warm glaze, soft S-curve, high-key floor,
`?grade=0` to disable); stronger cumulus with blue overhead; and the two
composed frames — `hero` (the one-frame test: killdeer mid-peck, both bands
legible, poppy band at the horizon, hazy sky) and `monet` (wide field /
treeline / sky composition).

**Wind determinism.** Wind time is a uniform frozen at 0 in harness mode:
the static boil check and every still shot are untouched. The `wind` motion
path drives time explicitly (1/30 s per frame) at a fixed camera — the
flipbook is the breath; setting time back to 0 reproduces the t=0 frame
pixel-exactly (verified during development, diff exactly 0.0).

### Top ten deltas (ranked by impact)

1. **The sky was still nearly featureless** beside Ref 1's massed cumulus.
   → **FIXED (to "hazy summer" level):** contrast-stretched cloud field,
   deeper zenith blue, lit bodies over violet-grey undersides, sun glow.
   Honest residual: our sky is Ref 4's milky-bright day, not Ref 1's
   towering cumulus — masses read, drama doesn't.
2. **No motion in a "painting that breathes" build.** → **FIXED:** the wind
   system above; grass ripples in gust bands, flower heads overshoot their
   stems, clouds drift downwind at two rates.
3. **Uniformly crisp edges everywhere.** → **FIXED (accent half):** painted
   dark accents at value-mass boundaries, eroding with distance. The lost
   half remains atmospheric (haze, shared palette) rather than a per-edge
   silhouette model — noted as the honest gap in the rubric.
4. **Composition had no anchor frame.** → FIXED with the composed `hero` and
   `monet` shots (and the follow camera already frames the bird in play).
5. **Grade risk:** the warm glaze slightly greys the zenith blue; balanced
   against it by the deeper base blue. Acceptable, watched.
6. **Gulp beat still reuses the alert pose** (phase-3 delta 8) — unchanged;
   a dedicated head-toss remains future work.
7. **Near-thicket density** (phase-3 delta 4) — unchanged; the CPU-raster
   harness budget caps it. On a real GPU there is headroom to double it.
8. **Tree crowns cauliflower at close range** (phase-3 delta 6) — unchanged;
   treeline ring distance keeps it out of normal play framing.
9. **Wind does not reach the treeline canopies** — the far masses hold
   still. At 175 m+ behind haze this reads acceptable; noted.
10. **The bird ignores the wind** — no feather ruffle. Real birds are
    aerodynamic; static plumage reads fine at play distance. Noted.

Top three actionable (1, 2, 3) fixed and re-shot; the committed comparisons
are the post-fix state.

### Verification battery (phase 4 — final)

- **Coherence: PASS** — static boil check re-run with wind system present
  (frozen): pixel-identical; orbit/sprint flipbooks ground-locked. See
  `shots/phase-4/motion/report.json`.
- **Breath: PASS** — the `wind` path flipbook shows grass/flower/cloud
  motion as brushwork in the wind; deterministic per (seed, t).
- **Filter test: PASS** — `shots/phase-4/hero-ungraded.png` (`?grade=0`) is
  still a painted frame; the post pass carries only the unifying glaze.
- **Value test:** `shots/phase-4/value-hero.png` — sky / treeline band /
  lit field / shadow drifts / bird-with-bands separate; the bird reads
  against the ground.
- **Palette test: PASS structurally** — all paint passes LUT-locked; the
  grade applies a bounded warm transform on top.
- **Killdeer test: PASS** — both breast bands, plover posture, run-stop-peck
  (gait + forage flipbooks re-captured in this battery).
- **Contact sheet:** vista / ground / detail / macro / sky / meadow /
  treeline / bird set / follow / hero / monet in `shots/phase-4/`.

### Self-score rubric (phase 4 — final)

| Row | Score | What would raise it by 2 (post-prototype) |
|---|---|---|
| Brushwork & impasto fidelity | 5 | Inter-stroke occlusion; bristle-broken silhouettes |
| Palette & value structure | 6 | True cumulus value mass in the sky; mid-field dark clumps |
| Broken color | 6 | Violet/pink interference through the lit grass |
| Edge control | 4 | A per-silhouette lost-and-found model, not just accents + haze |
| **Stroke coherence in motion** | 8 | Sub-pixel far-stroke AA; wind on treeline without shimmer |
| Killdeer identity | 7 | Feather-shell stroke ribbons on the body |
| Killdeer animation & run-stop-peck | 7 | Dedicated swallow toss; tail fan on hard stops |
| Field & environment painting | 6 | Denser near thicket; second grass vocabulary |
| Wind & motion | 6 | Gust-driven value shimmer on the lit grass (paint responding to light, not just position) |
| Composition & camera | 6 | Cloud masses balancing the frame top; rule-of-thirds follow framing |

**The one-frame test:** `hero.png` — killdeer mid-forage, sun high and warm,
broken-colored grass and poppies around it, hazy sky above, both breast
bands legible. Beside the references it reads as clearly synthetic but the
same class of image: no flat ground, no dead shadows, no filtered-not-painted
look, no generic bird. The prototype's remaining distance to a real canvas
is in stroke silhouette richness and sky drama, both documented above.

**Handoff.** The last gate is the human's: run it, move the bird, judge the
feel. Controls in README. Everything after (nest, display, seasons, story)
builds on this foundation.

---

## Phase 3 — 2026-07-04, seed 7

Comparison set: `shots/phase-3/compare/` (11 pairs, now including
meadow vs Ref 2 and treeline vs Ref 1). Foraging evidence:
`shots/phase-3/forage_before.png` / `forage_after.png` plus the automated
gate (`npm run forage`): the scripted bird walks to the nearest seeded spot,
pecks, and the assertion `eaten` increments — PASS. Coherence battery re-run
with all vegetation: `shots/phase-3/motion/report.json`.

**What phase 3 built.** The field: grass as rising tuft strokes (each
instance a drybrush flick splitting into blade streaks, clumped by a tuft
field, lit tips carrying the impasto) in two streamed LOD rings; wildflowers
as stem + head stroke pairs, poppy-dominant in drifts with rose/cream/yellow
notes and dark poppy centers, the heads the thickest paint in the frame; a
seeded treeline ring in the Monet manner (canopy daub shells with lit
crowns, cool violet shadow sides, understory masses seating them into the
ground, poplars and broad crowns) dissolving into the shared atmosphere; and
the foraging loop — 90 seeded worm/beetle paint-marks, peck-contact
detection at the bill, the mark consumed on a catch, and a head-up
gulp-and-scan beat as the payoff. No score, no HUD.

**Environment scars (documented for honesty):** this GPU stack misreads a
third per-instance vertex data stream (storage or attribute — both) and
NaN's an in-shader cross().normalize() on the treeline path; the treeline
therefore packs all stroke data into exactly two vec4 attributes
(azimuth/pitch direction encoding, scalar-pair packing) and precomputes what
it can on the CPU. The streamed fields are unaffected (compute-written
storage works fine).

### Top ten deltas (ranked by impact)

1. **The sky is still nearly featureless.** Ref 1 gives half the canvas to
   massed cumulus; ours reads as a pale wash with barely-there clouds.
   → **FIXED (phase-3 level):** cloud coverage/contrast and zenith blue
   raised on the dome. True cloud brushwork remains phase 4.
2. **The treeline reads as three lonely bushes,** not a broken band. Ref 1
   holds a continuous distant tree mass. → **FIXED:** more clusters grouped
   into groves with companion masses; the horizon now carries a broken band.
3. **Flower accents vanish past 30 m,** leaving the vista field monotone
   yellow-green vs the reference's red/violet flecking. → **FIXED:** poppy
   fleck probability in the distant ground-stroke color script raised; far
   field now carries the red shimmer.
4. **Near-field grass too sparse at bird height** — the bottom third of the
   meadow shot is mostly flat strokes. Raised tuft density modestly; a
   denser thicket needs a perf budget this CPU-rasterized harness can't pay.
5. **Grass is all one gesture.** Real meadows mix blade tufts with seed
   heads, bent stems, clover mats. One more stroke vocabulary (phase 4
   polish if budget allows).
6. **Tree crowns are cauliflower-discrete** at close ring distances; daub
   edges read individually instead of massing. Acceptable at 175 m+, weak
   if the camera approaches the ring.
7. **Flowers float when their stems thin out** at distance; heads should
   sink into the grass mass instead (stems shortened, partially mitigated).
8. **The gulp beat reuses the alert pose** — reads right, but a dedicated
   head-toss with a visible swallow would sell the payoff (phase 4).
9. **Food marks are subtle to a fault** on busy ground; the player finds
   them by proximity more than sight. Intentionally low-key, noted.
10. **Value structure: the dark vegetation mass finally exists** (treeline,
    shadow tufts) but only at the horizon; mid-field shadow clumps still
    read soft in the desaturated check.

Top three actionable (1, 2, 3) fixed and re-shot; comparisons in
`shots/phase-3/compare/` are the post-fix state.

### Verification battery (phase 3)

- **Coherence:** static boil check re-run with grass, flowers, treeline and
  food in frame — see `shots/phase-3/motion/report.json` (static must be
  pixel-identical; orbit/sprint flipbooks for the human swim check). The
  delta-loop fixes after the battery touched only color constants and seeded
  placement counts — nothing time-dependent — and the static path was
  re-verified on final code.
- **Foraging gate: PASS** (`npm run forage`): approach → peck → consume,
  deterministic per seed, with before/after frames.
- **Filter/palette tests:** unchanged — every new system (grass, flowers,
  trees, food) samples the same LUT rows; no new color paths.
- **No photographic texture in frame:** all vegetation is stroke geometry
  with procedural masks; nothing sampled from images.
- **Contact sheet:** vista / ground / detail / macro / sky / meadow /
  treeline / bird set / follow / forage pair in `shots/phase-3/`.

### Self-score rubric (phase 3)

| Row | Score | What raises this by 2 |
|---|---|---|
| Brushwork & impasto fidelity | 5 | Inter-stroke occlusion; flower-head silhouettes at grazing light |
| Palette & value structure | 6 | Mid-field dark clumps; warmer distant dissolve |
| Broken color | 6 | Violet/pink interference in the lit grass (Ref 1's field pinks) |
| Edge control | 3 | The phase-4 lost-and-found edge pass |
| Stroke coherence in motion | 8 | unchanged (all new systems world-anchored) |
| Killdeer identity | 7 | unchanged from phase 2 |
| Killdeer animation & run-stop-peck | 7 | Dedicated swallow toss (8); tail fan on stops |
| Field & environment painting | 6 | Denser near thicket; second grass vocabulary; grove variety |
| Wind & motion | — | Phase 4 |
| Composition & camera | 5 | Cloud masses to balance the frame; follow-cam framing vs Ref 1 |

Cheapest +2s implemented: sky cloud strengthening (1) and treeline banding
(2) — both raised composition and environment scores directly.

---

## Phase 2 — 2026-07-03, seed 7

Comparison set: `shots/phase-2/compare/` (bird shots vs the KD reference
plates). Animation evidence: `shots/phase-2/motion/gait/` (run-cycle sweep),
`shots/phase-2/motion/forage/` (scripted run-stop-peck behavior pass), plus
the standard static/orbit/sprint battery re-run with the bird in frame.

**What phase 2 built.** The killdeer: a procedural mesh sculpted entirely in
code (lathe body, sphere head, cone bill, wedge tail, folded-wing panels,
cylinder legs) on a group-hierarchy rig; every marking painted procedurally
in part-local coordinates through the same palette LUT as the field — warm
taupe back, cream underparts, **both black breast bands** (lower band front
and sides, upper band a full neck ring under a white collar), white forehead
and supercilium, umber cheek stripe, orange-red eye ring around the dark
eye, rust rump and tail with dark subterminal band; a procedural animation
state machine (run gait, run-stop-peck, idle with weight shifts, head
scanning and preens, alert freeze); player control with plover locomotion
(fast pivots, hard stops, speed shed while turning); and a damped
third-person follow camera. The bird stands on the paint surface (root
raised to the impasto top) with a soft painted contact shadow.

### Top ten deltas (ranked by impact)

1. **The bird's surface has no stroke geometry.** The field is built from
   ribbons; the bird is a shaded mesh in the same LUT/bristle language.
   At close range its paint reads thinner than the world's. The honest fix
   (feather-shell stroke ribbons on the body) is queued behind phase-3
   priorities. Partially mitigated: bristle striations, quantized values,
   painted edge turn.
2. **Head/neck junction is abrupt at some angles.** → **FIXED (round 2):**
   bigger head, shorter thicker neck, head seated lower into the collar.
3. **Bands read too far from the head.** → **FIXED:** upper band tightened
   against the collar (t 0.84–0.93), lower band and gap shifted forward.
4. **Face pattern smeared at the eye.** → **FIXED:** cheek stripe narrowed
   and dropped to umber so the dark eye + orange ring read inside it;
   forehead patch reduced; supercilium widened.
5. **Legs were buried in the impasto.** → **FIXED:** bird root raised to the
   paint surface (~0.045) so the tarsi and toes are visible.
6. **Peck buried the bill under the paint.** → **FIXED:** shallower dip
   (bodyPitch 0.48, neckPitch 0.78) — bill meets the surface, not the void.
7. **No wing detail beyond tone panels.** Folded primaries are a dark mass;
   no scapular feather rhythm. Phase-3/4 brushwork territory.
8. **Tail fan is rigid.** Single wedge; no spread on stops/pivots (the rust
   fan flash is a killdeer signature in motion). Candidate for phase 4 polish.
9. **Contact shadow is a uniform blob** — should smear along the light's
   away side like a laid stroke.
10. **Bird scale vs stroke scale**: near strokes are broader than the bird's
    whole flank, which is painterly but occasionally swallows the silhouette;
    phase-3 grass will restructure the near field.

Fixed this phase: 2, 3, 4 (identity), plus 5 and 6 found during the loop.

### Verification battery (phase 2)

- **Coherence:** static boil check re-run with the bird in frame — PASS
  (pixel-identical; the bird holds a deterministic preset in harness mode).
  Orbit/sprint unchanged (world-anchored geometry).
- **Killdeer test:** both breast bands present and correctly placed; plover
  posture; run-stop-peck present (gait sweep + forage sequence). Legible in
  the side-by-sides vs KD1–KD3.
- **Filter/palette tests:** unchanged from phase 1 — the bird's pigment is
  LUT-sampled from the same bounded palette (six new rows).
- **Contact sheet:** vista / ground / detail / macro / sky / bird_idle /
  bird_run / bird_peck / bird_alert / follow in `shots/phase-2/`.

### Self-score rubric (phase 2)

| Row | Score | What raises this by 2 |
|---|---|---|
| Brushwork & impasto fidelity | 5 | Feather-shell strokes on the bird (1) |
| Palette & value structure | 5 | Phase-3 dark vegetation mass |
| Broken color | 6 | Feather-flank broken color on the bird's back |
| Edge control | 3 | Phase-4 edge pass (bird silhouette lost-and-found) |
| Stroke coherence in motion | 8 | unchanged (world geometry) |
| Killdeer identity | 7 | Feather rhythm on wing/back; softer head-body blend |
| Killdeer animation & run-stop-peck | 6 | Tail-fan on stops (8); stride-synced head stabilization |
| Field & environment painting | 4 | Phase 3 |
| Wind & motion | — | Phase 4 |
| Composition & camera | 5 | Follow-cam framing tuned against Ref 1 once the field has anchors |

Cheapest +2s implemented: bands/face/head rework (identity 5→7 by the KD
side-by-side), legs/peck grounding (animation readability).

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
