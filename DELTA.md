# DELTA.md — reference-delta log

Per the project doc, every phase closes with: render the closest matching
shots, place them beside the references, list the ten most visually
significant differences ranked by impact, fix the top three, re-shoot.

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
