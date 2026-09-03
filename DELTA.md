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

---

## Phase 3 — the killdeer is a killdeer

Judged: `shots/phase-3/td_side.png`, `td_front.png`, `td_34.png`,
`td_fan.png` (the `?bare=1` turnaround on plain canvas) beside
`reference/KD1..3.png`, plus `bird_idle/run/peck/alert`, `hero`, `follow`
in the meadow.

Ten deltas found through the loop, ranked:

1. **Front views saw the rufous tail interior through the breast** — the
   body lathe's end-holes were open. Fixed: the profile pinches closed.
2. **The chin-wrap black swallowed the white throat** and merged with the
   upper collar. Fixed: a narrow strap, white throat restored.
3. **Wing scallops read as curly noise swirls**, not painted feather
   ranks. Fixed: even ranks with a whisper of wobble.
4. Head sat low enough to merge the silhouette into one hump. Fixed:
   raised above the shoulder line.
5. The black frontal bar capped the whole crown. Fixed: a thin stroke
   between the eyes.
6. Band edges were smudged by marking wobble. Fixed: wobble halved —
   confident single strokes.
7. Eye and orbital ring undersized for the plover look. Fixed: both
   enlarged, ring thickened; it now reads at a glance in every view.
8. Body read short; wings didn't reach the tail base. Fixed: body carried
   longer, wings elongated and pointed.
9. Run gait was too level and the head bobbed with the body. Fixed:
   nose-down dash with counter-pitched steady head; stop lands with one
   sharp bob.
10. No rufous flash existed. Fixed: the tail-fan grooming beat spreads
    and lifts the tail — `td_fan` shows the orange field with its black
    subterminal band and white rim.

**Gate:** every mandatory marking is visible in the turnaround — the two
black breast bands, the red-orange orbital ring, white forehead with the
black inter-eye bar, white supercilium and collar, black face band
wrapping under the chin as a narrow strap, cream underparts, brown back
with pale-fringed feather ranks, dark wingtips, pale thin legs, and the
rufous rump/tail with black subterminal band and white tip when fanned.
The bird reads as *Charadrius vociferus* at a one-second glance in side,
front, and three-quarter.

---

## Phase 4 — worms, the loop, and the deploy

Judged: `shots/phase-4/` — the full acceptance set in both palettes plus
the bare turnaround, and `forage_hunt.png` from the playtest gate.

**Gates, measured:**

- **Playtest** (`npm run forage`): ten worms found and eaten in **31.0 s**
  of simulated play against the three-minute budget, with no marker — the
  controller only runs, stops and pecks. 432 worms resident in the ring
  around the bird at start.
- **Deploy** (`npm run build && npm run distcheck`): the production bundle
  boots on a fresh browser at the exact Pages path and renders real
  frames (WebGPU, compute self-test pass, 7 frames, zero page errors).
- **Streaming** (`npm run trek`): unchanged from Phase 2 — one warm-up
  stall over the 2 km run; the counter is live on the F3 HUD.

Deltas found and fixed in this phase:

1. **`base` was build-only**, so the built HTML requested
   `/fable5-killdeer-demo/assets/*` while `npm run preview` served from
   root — the bundle 404'd and the app never booted. The deploy gate
   caught it on its first run; preview now shares the built base. This is
   exactly the failure that would have shipped a blank Pages site.
2. Worm density needed two passes to land in the spec's one-per-15-25 m²
   band while still clustering on soil.
3. The v1 food system's beetles and its fixed 90-spot disc were removed
   outright — worms only, streamed with the world, per the BLUF.
4. Peck reach widened to the spec's ~30 cm ahead of the bill (v1's 15 cm
   made connecting feel arbitrary).
5. The HUD moved from `h` to `F3` and gained strokes / worms / stalls.
6. OrbitControls and the `c` freecam and `f` alert key are gone; the
   follow camera itself now orbits on drag and zooms on scroll, damped.

Carried, deliberately, as the honest remaining list:

- Mid-distance grass blades still read a touch spiky in the *raw*
  (`?post=0`) render; the post stack melts them at the distances they
  appear, so the shipped frame is clean.
- Dab hover reads slightly floaty on the steepest swells.
- The soil fields could carry dry soil-toned strokes of their own rather
  than only repainted grass strokes.

---

## Self-score

10 = passes a one-second glance next to the reference at 1080p; 7 =
clearly synthetic but the same class of image; 4 = good hobby demo; 2 =
obviously a shader filter over a game.

| Row | Score | What would raise it 2 points |
|---|---|---|
| Sky paint | 8 | Cloud *masses* with knife-edge tops rather than soft threshold shapes; a second scumbled layer at the horizon. |
| Grass and ground strokes | 8 | Per-region stroke length/angle scripts so mown, tussocky and drift-blown areas differ in touch, not just color. |
| Flower dabs | 8 | Petal-cluster silhouettes (three-lobe knife shapes) instead of one rounded footprint; occasional double-loaded two-color dabs. |
| Depth and horizon band | 8 | A true third band — a mid-distance hedgerow line that reads continuous rather than as spaced masses. |
| Impasto and canvas | 7 | A real accumulated height buffer from A1 dabs feeding the relief, instead of luminance as a height proxy. |
| Color script | 9 | A dawn third script, and per-region palette drift within a script. |
| Killdeer anatomy | 8 | Sculpted scapular/tertial feather groups and a true folded-primary silhouette rather than a smooth panel. |
| Killdeer paint | 8 | Feather-group stroke direction fields (each tract painted along its own flow) instead of one body-wide flow. |
| Locomotion feel | 8 | Foot-planting IK so strides don't slide on slopes; a broken-wing display. |
| Endless world seamlessness | 9 | Terrain-aware region blending so soil fields and drifts follow the swells rather than crossing them. |
| Worm find-and-eat loop | 8 | Worms that half-hide in grass tufts (partial occlusion) so searching rewards the head-tilt more. |
| Performance | 7 | Real-GPU profiling and an adaptive stroke budget; the reduced preset is untested outside SwiftShader. |

Two cheapest raises implemented this phase: the color-script row (both
palettes fully drive sky, atmosphere, grade and every LUT row) and the
seamlessness row (camera-anchored ground/sky/hills with terrain-draped
scatter — no edge exists to find).

**Painty test after fixes:** sky patch (zenith), sky patch (near horizon),
foreground grass patch, mid-distance patch — all carry stroke texture,
weave, or both; none could be mistaken for a smooth 3D render. The bird
still fails inside its silhouette (item 9, Phase 3 scope) but its edges no
longer read clean.
