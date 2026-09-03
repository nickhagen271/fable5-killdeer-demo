# PROMPT Killdeer Prototype v2
### Painted meadow, real killdeer, endless field, worms

---

## BLUF

v1 proved the game runs and plays. v2 is about one thing: **the frame has to look like a painting.** Four changes, nothing else:

1. Rendering becomes stroke-based and painterly, judged against the four reference paintings in `/reference/v2/`.
2. The killdeer model becomes anatomically true to the bird.
3. The world becomes an endless, seamlessly streamed meadow with no visible edge.
4. Small static worms appear randomly on the ground. The bird finds them and eats them. That is the whole game.

Everything not in that list is out of scope. Do not add it.

---

## The references

`/reference/v2/` holds four images. Every phase is judged **against these images**, not against "looks painterly for a browser."

| File | What it teaches |
|---|---|
| `ref_a_evening_meadow.jpg` | Low-key ground under a luminous sky. Cool blue-green grass, yellow flower dabs, one dark tree mass, distant hedgerow. Sky is lavender-blue with warm cream cloud undersides. Loose, visibly directional brushwork everywhere. |
| `ref_b_misty_poppies.jpg` | Atmospheric depth by softening: foreground flowers are crisp dabs, treeline dissolves into haze. Poppy red, daisy white, cornflower blue, buttercup yellow on soft green. Overcast, no hard shadows. |
| `ref_c_valley_hills.jpg` | Composition and color only (this one is digital, its edges are too clean). Rolling ground planes stacked in receding bands, distant hills, cumulus sky. Use it for how the meadow rolls, not for how it is painted. |
| `ref_d_sunset_meadow.jpg` | The hero palette. Lavender-to-peach sky, sun as a soft glow disc, soft mountain silhouettes, dark hedgerow band, yellow-lit grass, large pink/purple/orange/white palette-knife flower dabs in the foreground. |

What the four share, and what the build must reproduce:

- **Horizon in the upper third.** Sky owns 30 to 45% of the frame. A dark treeline or hedgerow band separates sky from meadow.
- **Flowers are discrete dabs of pure color,** not modeled plants. Big dabs at the feet, specks at 30 m, gone by 80 m.
- **Depth comes from softening and color shift,** not from fog. Background loses edge definition and drifts toward the sky color. Foreground keeps hard, thick strokes.
- **Every pixel shows a stroke.** Sky, grass, sun disc, hills. Nothing is a smooth gradient. Canvas weave is visible in thin passages, impasto relief in thick ones.
- **Warm, hazy, high-key light.** No bright noon, no hard cast shadows, no black.

**Reference-delta loop (mandatory, every phase):** render the closest matching shot at 1080p, place it side-by-side with the nearest reference, write `DELTA.md`: the ten most visually significant differences, ranked. Fix the top three. Re-render. Only then does the phase close.

---

## Pillar A: the frame is paint

This is the pillar everything else serves. If a decision arises that this document does not cover, resolve it in favor of looking more like the references.

**Two layers, both required:**

**A1. Geometry as strokes.** Flowers, grass tufts, hedgerow foliage, and cloud masses are rendered as instanced stroke quads (camera-facing dabs with painted alpha, 3 to 5 shape variants per class, per-instance hue/value jitter, per-instance rotation). Grass is not blades. Grass is thousands of short directional strokes laid along a wind-and-slope flow field, thicker and longer near the camera. A flower is one to three overlapping dabs, not a mesh with petals.

**A2. Screen-space painterly post.** After the scene is rendered, the frame goes through a stroke-based post stack:
- Anisotropic Kuwahara or equivalent edge-preserving smoothing, strength scaled by distance (light near, heavy far) so the background dissolves the way `ref_b` does.
- Stroke direction field derived from the structure tensor, used to streak the smoothing along contours.
- Canvas weave normal map over the whole frame.
- Impasto relief: a stroke height map accumulated from A1 dabs (brightest and nearest strokes are thickest), lit by the sun direction so ridges catch light. Relief only where light collects, per the Monet reference in v1.
- Edge treatment: no anti-aliased clean edges anywhere. Every silhouette is broken by stroke texture.
- Final filmic grade with the per-palette color script (below).

**The painty test:** freeze any frame at 1080p and pick any 100×100 px patch. If the patch could be mistaken for a 3D render (smooth gradient, clean edge, uniform fill, visible polygon), it fails. Run this on sky, foreground grass, distant hills, and the bird.

**Palettes.** Two color scripts, one key to toggle (`P`), default is `sunset`:
- `sunset` (from `ref_d`): sky lavender `#B8A8D8` top through peach `#F2C4A0` to cream `#FBE9C8` at the sun; hills `#C9A7B8` far, `#E8A070` lit; hedgerow `#3E3A2A`; grass base `#B8B840` lit to `#7A8A30` shadow; flower dabs pink `#E890C0`, violet `#8060C0`, orange `#F08030`, white `#FBF4E8`, yellow `#F0D040`.
- `overcast` (from `ref_a` and `ref_b`): sky `#9FA8C8` to `#D8D2C8`; grass `#5A7A48` to `#7A9A58`; flower dabs poppy red `#D83820`, cornflower `#5878D0`, daisy white, buttercup yellow.
These are anchors. Match the references, not the hex codes, when they disagree.

**Sky.** Painted gradient plus stroke texture plus cloud masses as large soft dabs. A soft glow disc for the sun in `sunset`. Sky must pass the painty test on its own.

**Depth.** Three bands, always present in a horizontal shot: (1) foreground meadow with the largest strokes, (2) a dark hedgerow / treeline band 60 to 150 m out with occasional single tree masses like `ref_a`, (3) soft rolling hill silhouettes at the horizon shifted toward the sky color. No fog to hide anything. The hill band is procedural and always there, so the world never shows an edge.

**Light.** One directional sun, low angle, warm. Shadows are soft color shifts toward the sky tint, never darkening to gray or black. No cast shadow maps. Ambient is the sky gradient. The bird gets a soft contact darkening on the ground under it, painted, not a shadow map.

---

## Pillar B: the killdeer is a killdeer

v1's bird read as generic. v2 has to read as *Charadrius vociferus* from any angle at a one-second glance. Build the model procedurally (no external assets) but build it to this anatomy:

**Proportions.** Body about 25 cm long. Plover build: rounded head, very short neck, large dark eye set high and forward, body carried horizontal, slightly nose-down when running. Legs are long for the body (tarsus roughly the depth of the body), pale pinkish-gray, thin. Bill is short, straight, black, about the length of the head front-to-back. Wings long and pointed, folded tips reaching the tail base. Tail long for a plover, wedge-shaped.

**Markings, top to bottom, all mandatory:**
- Crown and back: warm brown, taupe-umber, slightly grayer on the crown.
- Forehead: white patch, bordered above by a thin black bar between the eyes.
- White stripe running back from above the eye.
- Eye: dark, ringed by a **red-orange orbital ring**. This is the single most identifying detail and must be visible.
- Black band across the face below the eye, wrapping under the chin.
- White collar around the neck.
- **Two black breast bands.** Upper band is a full collar. Lower band is a broader crescent across the chest. Cream-white between and below.
- Underparts cream to white.
- Rump and upper tail: **bright rufous orange**. Tail has a black subterminal band and white tip. When the tail fans or the wings lift, the orange has to flash.
- Wings folded: brown with a thin pale edge. Wing tips dark.

**Paint treatment.** The bird is painted in the same stroke language as the world but at higher stroke density and crisper edges than anything else in frame, so it reads as the subject. Bands are laid as confident single strokes, not blurred gradients. The eye ring is one small hot orange dab.

**Locomotion, unchanged from v1 but tightened:**
- Run: fast short-legged trot, body horizontal, head steady.
- Stop: abrupt, then a single head bob.
- Look: head tilts to one side toward the ground when a worm is within 2 m.
- Peck: quick forward-down strike, straight back up.
- Idle: occasional preen, occasional tail fan (show the orange).

**Fidelity check.** Render a three-view turnaround (side, front, three-quarter) on a plain canvas ground and put it next to the killdeer photos in `/reference/killdeer/`. Delta loop applies to the bird exactly as it does to the landscape.

---

## Pillar C: the world does not end

- Seeded, deterministic, chunk-streamed meadow. `?seed=N` reproduces it. Chunks generate on the GPU as the bird approaches and are released behind. No bounds, no wall, no wrap seam, no loading hitch (no main-thread stall over 8 ms, violations logged).
- **Terrain is gently rolling**, like `ref_c` and `ref_d`: long low swells, 2 to 8 m of relief over 100 m, never flat, never hilly enough to block the horizon band.
- **Flowing scenery.** A wind field (global direction plus gust noise) drives every grass stroke and flower dab. Nothing is static except the worms. Clouds drift. The sun glow breathes very slightly.
- **Variation as you travel.** Flower density and species mix change slowly by region (a poppy drift, a daisy field, a sparse yellow stretch). Occasional single tree masses and hedgerow lines drift into the mid-distance and pass. Every so often a bare soil patch or a worn track breaks the grass. No two square kilometers should feel the same, and nothing should ever visibly repeat.
- Horizon band is always painted and always present, so wherever the bird runs, the composition holds.

---

## Pillar D: worms

- Worms are the only objective. They are **static** and **small**: a curled pink-brown stroke 2 to 4 cm long lying on the ground, partly on bare soil patches and occasionally in grass.
- Spawn randomly per chunk, seeded, at a density of roughly one per 15 to 25 m² with clustering near soil patches. They persist until eaten. Eaten worms do not respawn in that spot for the session.
- **Finding them.** They are meant to be a little hard to see from a distance. The bird helps: within about 2 m the head tilts toward the nearest worm (Pillar B "Look"). That is the only hint. No markers, no glow, no arrows.
- **Eating.** Walk the bird up to a worm and press peck (`Space`). If a worm is within reach (about 30 cm ahead of the bill), the peck connects, the worm vanishes with a tiny stroke puff, the count goes up. Pecking at nothing is fine and does nothing.
- **Counter.** A single small number, painted, top-left, in the palette's cream. No other UI in play.

That is the loop. Run, look, peck, eat. Do not add hunger, timers, score screens, predators, nests, chicks, weather events, or narrative.

---

## Controls (final, document these in `README.md`)

| Input | Action |
|---|---|
| `W A S D` or arrows | Move (the bird runs in the camera-relative direction) |
| Mouse drag | Orbit camera |
| Scroll | Zoom camera |
| `Space` | Peck |
| `P` | Toggle palette (sunset / overcast) |
| `F3` | Debug HUD (fps, frame ms, strokes drawn, resident chunks, worms eaten, seed) |
| `?seed=N` in URL | Reproduce a specific world |

Camera is third person, low and slightly behind the bird, tilted so the horizon lands in the upper third of the frame by default. The camera should feel like the painter's eye, not a game camera: slow damping, no snapping.

---

## Fixed constraints

| Constraint | Value |
|---|---|
| Language | TypeScript, `strict: true`, zero `any` |
| Build | Vite |
| Renderer | three.js (current) WebGPURenderer + TSL; raw WGSL compute where TSL limits you |
| Fallback | None. No WebGL path. Fail loudly with a plain-language message: "This needs Chrome or Edge with WebGPU." |
| Assets | Zero external assets. Every stroke shape, canvas map, palette, noise: generated by code. |
| Determinism | `?seed=N` reproduces the world and the worm placements. |
| Architecture | Real modules: `src/render/`, `src/paint/` (post stack), `src/strokes/` (instanced dab systems), `src/world/` (streaming, terrain, scatter), `src/bird/`, `src/worms/`, `src/debug/`. One giant file fails. |
| Performance | 60 fps at 1440p on RTX-3060-class. 30 fps at 1080p on a recent iGPU with a reduced preset (fewer strokes, lighter post, not fewer systems). |
| Deployable | `npm run build` produces a static `dist/` that runs from GitHub Pages. Include a `.github/workflows/deploy.yml` that builds and publishes `dist/` to Pages on push to `main`, and set Vite `base` accordingly. Document the live URL pattern in `README.md`. |

---

## Operating instructions

- Build, don't describe. No plan-approval round-trips. Long autonomous stretches.
- Between two approaches, build the one that looks more like the references.
- No stubs. A `// TODO` in a closed phase fails the phase.
- Never ask the user to reduce scope. An infeasible item goes to the nearest feasible alternative plus an entry in `DEVIATIONS.md`.
- Under-painting is a failure mode. If any region of the frame passes as a 3D render, add strokes until it does not.
- Keep v1's working input, camera, and streaming code where it still fits. Replace the renderer and the bird outright.

---

## Passes

1. Terrain heightfield synthesis (low-frequency swells, seeded, per chunk, GPU)
2. Region field (flower mix, density, soil patches, hedgerow lines, tree mass placement)
3. Stroke scatter: grass strokes, flower dabs, soil dabs, worms; instance buffers written on GPU, culled on GPU
4. Wind field sampled by all strokes
5. Sky paint (gradient + stroke texture + cloud dabs + sun glow)
6. Horizon band (hedgerow strokes, tree masses, hill silhouettes with sky-shift)
7. Bird render (higher stroke density, crisper edge budget)
8. Painterly post: distance-scaled anisotropic smoothing, direction-field streaking, canvas normal, impasto relief lighting, filmic grade
9. Debug HUD and Playwright screenshot harness

---

## Phase plan, gated

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | Painterly post stack on the existing v1 scene. Canvas weave, distance-scaled smoothing, impasto relief, palette grade. | Painty test passes on sky and ground in a static shot. `DELTA.md` vs `ref_d`. |
| 1 | Stroke-based sky, grass strokes, flower dab system, horizon band, both palettes. | Side-by-side vs `ref_d` (sunset) and `ref_b` (overcast). Top-three fixes applied. |
| 2 | Endless streamed meadow with rolling terrain, regional variation, wind through everything, no seams or hitches. | 2 km run in a straight line, screenshots every 200 m: no repeats, no edge, no stall logged. |
| 3 | Killdeer rebuilt to Pillar B anatomy and paint treatment, all locomotion states. | Turnaround vs `/reference/killdeer/` photos. Every mandatory marking visible. |
| 4 | Worms, peck detection, head-tilt cue, counter. Controls documented. Deploy workflow live. | Playtest: find and eat ten worms in under three minutes without a marker. GitHub Pages build loads in a fresh Chrome. |

A phase closes only after: build → run → screenshots → `DELTA.md` → fix top three → re-shoot.

---

## Banned outcomes, instant fail

- Any patch of frame that reads as a 3D render. Clean anti-aliased edges. Smooth gradients in the sky.
- Photoreal grass blades or modeled flower petals.
- Cast shadow maps. Gray or black shadows.
- Fog used to hide distance. A visible world edge, wall, or wrap seam.
- A killdeer missing the double breast band, the red eye ring, or the orange rump.
- Worm markers, glows, minimap, or any UI beyond the counter.
- Bright noon lighting. Saturated cartoon green.
- Uniform flower scatter with no clustering; visible tiling; cloned tree masses.
- `MeshBasicMaterial` in the world; CPU per-instance updates; one-file architecture; asking the user to lower the bar.
- Any feature not in the BLUF list.

---

## Self-score rubric

10 = passes a one-second glance next to the reference at 1080p; 7 = clearly synthetic but the same class of image; 4 = good hobby demo; 2 = obviously a shader filter over a game. Score after every phase. For each row write "what raises this by 2 points" and implement the two cheapest before moving on.

Rows: sky paint · grass and ground strokes · flower dabs · depth and horizon band · impasto and canvas · color script · killdeer anatomy · killdeer paint · locomotion feel · endless world seamlessness · worm find-and-eat loop · performance.

---

## Final acceptance

Three frames, each beside its reference:

1. Bird at rest in a sunset meadow, horizon in the upper third, foreground flower dabs the size of the bird's head, next to `ref_d`.
2. Bird mid-run through an overcast poppy drift, treeline dissolving behind, next to `ref_b`.
3. Killdeer turnaround next to a photo.

If a viewer's eye does not snag within one second on a category error (a clean edge, a gradient sky, a generic bird, a repeated tree), the prototype has done its job. Then hand it to the human to run around in. Their feedback is the last gate.
