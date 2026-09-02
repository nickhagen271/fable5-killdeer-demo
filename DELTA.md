# DELTA — v2 reference-delta loop

One section per phase. Each closes a phase gate: render → side-by-side →
ten ranked differences → fix the top three → re-render. v1's delta history
is in git history (`git log --follow DELTA.md`, commits before the
"v2 Phase 0" commit).

Because the `/reference/v2/` images were not provided (see DEVIATIONS.md),
comparisons are made against the spec's written descriptions of the four
references — treated as ground truth — plus the nearest v1 Monet references
(`reference/Ref 1.jpg`, `Ref 2.jpg`) where they overlap.

---

## Phase 0 — painterly post stack on the v1 scene

Judged: `shots/phase-0/sky.png`, `ground.png`, `hero.png`, `vista.png`
against the ref_d description (every pixel a stroke; canvas weave in thin
passages, impasto in thick; depth by softening; no smooth gradients, no
clean edges) and `Ref 1.jpg` / `Ref 2.jpg` for the softening behavior.

Ten most significant deltas, ranked:

1. **Sky's upper half still read as a smooth gradient.** The flow grain was
   too faint; a 100×100 patch of zenith failed the painty test.
2. **Near field kept 3D-render smoothness.** The Kuwahara blend was nearly
   off close to the camera, so the bird and nearest strokes read as clean
   CG surfaces.
3. **Impasto relief invisible at 1080p.** The screen-space ridge lighting
   was under-amplified; thick passages didn't catch the sun.
4. Ref_d's warm low sun and lavender-to-peach sky are absent — v1's
   noon-hazy light and blue sky persist. (Phase 1: palettes + sky rebuild.)
5. No dark hedgerow band separating sky from meadow; the horizon is a
   washed white haze band instead of ref_a/ref_d's dark treeline.
   (Phase 1: horizon band.)
6. Flowers are stemmed heads, not palette-knife dabs; no big foreground
   dabs at the feet. (Phase 1: dab system.)
7. Horizon sits near mid-frame in several stock shots; ref composition
   wants it in the upper third with sky owning 30–45%. (Phase 1 shots +
   camera default.)
8. Mid-distance (20–80 m) grass flattens into a uniform green plane with
   sparse ribbon strokes — reads as decals on a lawn, not massed paint.
   (Phase 1 grass rework; density/LOD.)
9. The bird is smooth-shaded with soft body gradients — not yet painted in
   crisper strokes than the field. (Phase 3.)
10. Tree masses at the horizon float above the haze; their skirts wash out.
    (Phase 1/2 horizon + streamed masses.)

**Top three fixed in this phase (post-stack scope):**

1. Sky grain: third, coarser octave added and amplitude raised
   (0.028→0.042 near, 0.045→0.075 far) — flat passages now carry visible
   dragged-brush texture; far streaking lengthened (2.2→2.8 px steps).
2. Near-field Kuwahara floor raised 0.35→0.55: the nearest paint (and the
   bird) is folded into the same stroke fabric as the field, killing the
   clean CG edges without mushing the foreground impasto.
3. Impasto relief amplitude 0.85→1.7 with a gentler distance falloff:
   ridge lighting is now legible at 1080p in lit passages.

Items 4–10 are the Phase 1–3 work plan, in order.

---

## Phase 1 — stroke sky, flower dabs, horizon band, two palettes

Judged: `shots/phase-1/` — sunset set (`vista`, `sun`, `meadow`, `ground`,
`sky`, `hero`) against the ref_d description (lavender→peach sky, sun as a
soft glow disc, hill silhouettes, hedgerow band, yellow-lit grass, big
knife dabs) and the overcast set (`*_overcast`) against ref_a/ref_b
(cool blue-green grass, poppy/cornflower/daisy/buttercup dabs, luminous
gray sky, crisp near dabs dissolving treeline).

Ten most significant deltas found during the loop, ranked:

1. **Hill silhouettes missing entirely.** NodeMaterial.positionNode
   assigns into positionLocal and silently collapsed on a plain Mesh — the
   ring rendered as its raw 1 m cylinder.
2. **Ground strokes wearing bloom/soil rows.** The v2 row remap let
   meter-long far-LOD strokes paint themselves buttercup yellow and shadow
   poppy red — flat spills and maroon slugs across the meadow (plus two
   stale row numbers in the grass shader mapping dry blades onto cool
   rows and shadow grass onto hedgerow dark).
3. **Close dabs failed the painty test.** The knife touch was shaded as a
   smooth spherical CG lens by its continuous relief gradient.
4. Hills, once visible, were washed nearly into the sky (too much
   sky-shift, too pale, too low).
5. Sun glow disc too weak; peach pool around it too narrow; lavender
   zenith arriving too high in the dome.
6. Overcast lacked cloud mass at first tuning (cover threshold).
7. Dabs hovered too high — blooms floated visibly above the grass.
8. Hedgerow band is still the v1 tree ring — no continuous dark band
   between the trees. (Deferred: Phase 2 streams the whole band.)
9. Mid-distance grass blades read as rigid spikes in the raw render
   (mostly melted by the post at distance). (Phase 2 wind/grass pass.)
10. Treeline understory skirts read as floating dark slugs beside the
    trunks. (Phase 2 replaces the treeline.)

**Top fixes applied (1–7), re-shot after each:** hills rebuilt as a
CPU-baked ring (seeded sine harmonics, analytic slope → baked sun-facing
flank light) with darker values and less sky-shift; ground strokes and
grass constrained to the three grass rows; dab shading flattened to one
pigment plane with three hard drag-streak bands and boundary glints;
sun glow strengthened with a wider sunward pool and lower lavender onset;
overcast cloud cover raised; dab hover lowered. Items 8–10 carry into
Phase 2's streamed horizon band and grass pass.

**Gate:** both palettes read as different paintings of the same meadow —
sunset holds the lavender→peach→cream ramp with mauve hills and a warm
pool at the sun azimuth; overcast holds the gray-blue sky, massed clouds,
cool greens and red poppy specks. The painty test passes on sky, ground,
and dab patches in both.

---

## Phase 2 — endless streamed meadow

Judged: `shots/phase-2/trek-0000m.png … trek-2000m.png` — a scripted 2 km
straight run (bird driven east by `tools/trek.ts`, camera posed low
behind it every 200 m) against the ref_c/ref_d ground behavior (rolling
swells, stacked planes, regional variation) and the spec's Pillar C
(no repeats, no edge, no stall over 8 ms unlogged).

What the run shows: rolling 2–6 m swells at every checkpoint; flower
drifts that change species and density (sparse yellows → an orange
drift → poppy scatter); groves and lone trees that drift into the
mid-distance and pass; hedgerow lines wandering through; a worn bare-soil
field crossed around 1.9 km; hill band and treeline present in every
frame; no visible edge, wrap, or clone pairs across the eleven frames.

Streaming stalls: **one** logged frame (181 ms) across the whole run —
the boot/teleport warm-up, when a 200 m camera jump forces every system
to re-place its full grid in one frame while SwiftShader compiles the
compute pipelines. Continuous play crosses one tile boundary of one
system at a time (the six systems use six different tile sizes, so
crossings interleave); the stall counter and worst-update-ms stay live on
the debug HUD and console for real-GPU verification.

Ten deltas, ranked (from the first trek pass):

1. **Broad tree crowns were hollow shells of oversized right-angle
   daubs** — blocky arches from the side. Fixed: daubs fill the canopy
   volume, run 3.4–5.8 m with varied azimuth/pitch.
2. **All-tree spacing looked metronomic** (one 48 m tile each). Fixed:
   grove-field clustering — treeless regions, grove-y regions, loners.
3. **Trees spawned too close and too contrasty.** Fixed: mid-distance
   erosion starts at 48–90 m; crown values calmed.
4. Soil patches merged into 60 m fields. Fixed: threshold tightened.
5. Trees read totem-like at first — poplar rate cut to 20%.
6. Ground strokes bridge sharp swell crests slightly (drape samples per
   vertex, 5 segments) — invisible in practice; left.
7. Mid grass blades still spike in the raw render (post melts them at
   distance; near tufts read). Carried to the Phase 4 polish pass.
8. The dab hover reads slightly floaty on steep slopes. Carried.
9. Skirt daubs under sparse poplars occasionally read as separate dark
   lumps. Carried (minor, mid-distance only).
10. The soil field at 1.9 km could carry a few soil-toned dry strokes of
    its own rather than only repainted grass strokes. Carried.

Top three fixed and re-shot; the committed trek strip is the re-run.

**Painty test after fixes:** sky patch (zenith), sky patch (near horizon),
foreground grass patch, mid-distance patch — all carry stroke texture,
weave, or both; none could be mistaken for a smooth 3D render. The bird
still fails inside its silhouette (item 9, Phase 3 scope) but its edges no
longer read clean.
