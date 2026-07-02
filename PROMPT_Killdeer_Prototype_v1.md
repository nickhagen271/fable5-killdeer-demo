# PROJECT Killdeer — Prototype v1
### A hyper-stylized impasto web game. You are the bird. This build is a proof of concept.

---

## What this is

A web-based proof of concept. One open sunlit field. You are a killdeer, running and foraging. No stakes, no predators, no nest. The point of this build is to prove two things and nothing else:

1. **The paint holds.** An impressionist impasto render that reads as a moving oil painting and does not swim under motion.
2. **The bird lives.** A killdeer that reads unmistakably as a killdeer, running and pecking across the ground with real animation.

If those two land, the aesthetic and the character are proven and the story, the seasons, and the nest-defense loop get built later on top of a foundation that works. If they don't land, no amount of gameplay will save it. So this build spends everything on look and character.

**Explicitly out of scope for this prototype:** nesting, eggs, predators, the broken-wing display, chicks, seasons, narrative, menus, progression. Do not build them. Do not stub them. A `// TODO: predators` in this build is a failure, not a placeholder. Leave them out entirely.

---

## The bar

The visual target is **a moving Monet field study**. The references in `/reference` set it exactly: broken color, high-key sunlight, loose visible brushwork, impasto piled only where the light collects (flower heads, cloud edges, lit grass tips), poppy-red and wildflower accents scattered through sunlit green, a hazy warm sky. Every phase is judged against those images.

The failure mode is a flat or cel-shaded render with an oil-paint filter smeared on top. That is not painting. Painting is in the shading model and in the geometry of the strokes, never a post-process gimmick over a realistic frame. A result that reads as "Instagram oil-paint filter" is a **failed task**, no matter how clean the code.

You will not fully reach a real canvas. Close the gap as far as real-time allows and know precisely how far you got.

**Reference-delta loop (mandatory, every phase):** render the closest matching shot, place it beside the relevant reference, write `DELTA.md`: the ten most visually significant differences, ranked by impact. Fix the top three. Re-render. Only then does the phase close.

---

## Reference notes — the palette and brushwork target

All four references are Impressionist, and they agree on the important things. Build to their common denominator.

- **High-key value structure.** These paintings live in the top half of the value range. Lots of light. Shadows are colored and luminous, never black, never muddy. Desaturate any of them and you still get a clean read, but the whole thing sits bright.
- **Broken color.** Grass is not "green." It is green, yellow, blue-green, warm ochre, and touches of violet, laid side by side and mixed by the eye, not on the palette. Apply this to every surface. A single-hue field is banned.
- **Impasto where the light piles.** Thick paint body appears on lit flower heads, cloud edges, sunlit grass tips, and highlights. Thin, more transparent passages sit in the shadows and the sky. Do not apply uniform paint thickness everywhere. The relief follows the light.
- **Loose, directional strokes.** Strokes follow the form and the growth direction of what they describe: grass strokes rise, cloud strokes drift, ground strokes lie flat. Never one global stroke angle.
- **Poppy-red accents.** Scattered saturated red-orange notes through the green are the signature of the poppy-field references. The field should carry wildflower accents in that spirit.
- **Warm, hazy light.** Late-morning or early-afternoon sun. Warm. Soft edges toward the horizon.

The palette per scene is bounded and deliberate. Enforce it with a palette LUT. Free RGB is banned.

---

## The six pillars

Trimmed to what this prototype must nail. If a decision arises the document doesn't cover, resolve it in favor of the pillar.

**A. Strokes, not pixels.** Every surface is built from visible, directional brushwork with impasto relief where the light collects. No smooth photographic gradients. *Rule: freeze any frame, zoom to any surface. You must see individual strokes with paint-body, not filtered pixels.*

**B. Painterly light and palette.** A bounded, high-key palette. Warm-cool temperature logic instead of physical GI. Colored luminous shadows, never black. Value structure over local realism: the frame reduces to four or five value masses with the bird readable against the ground. *Rule: desaturate any hero frame. If it collapses into mid-value mush with no read, the light has failed.*

**C. Nothing un-painted.** Broken color on every surface. Canvas tooth under the thin passages, loaded strokes on the lights. Nothing reads as a flat-shaded polygon. A single-hue anything is a failure.

**D. The paint holds in motion.** World-anchored strokes. No swimming, no shower-door crawl, no strokes boiling in screen space as the camera or the bird moves. Stroke scale and density stay perceptually constant with distance. **This is the single hardest requirement and the make-or-break gate for the whole prototype.** If the strokes swim, the build fails regardless of how good a still frame looks.

**E. Painting that breathes.** The grass moves in the wind as brushwork. The clouds drift. A frozen frame is a finished painting. Unfrozen, it is one second from motion. This is pastoral and quiet: gentle wind, warm light, no drama.

---

## The killdeer

Identity is non-negotiable. This must read as a killdeer, not a generic bird. From the style brief already produced in this project:

- Warm taupe and umber back and wings, clean cream-white underparts.
- **Two black breast bands.** This is the diagnostic mark. Both bands, correct placement. Do not drop one.
- Orange-red eye ring, dark eye, short dark bill.
- Longish pale legs, upright plover posture, rounded head.
- Rust-orange rump, visible in flight and in the tail fan, though flight is not required this build.

**Behavior for this prototype (exploration and foraging only):**

- **Run-stop-peck.** The signature killdeer gait. Quick runs of a few steps, an abrupt stop, a forward tilt, a peck at the ground. This locomotion pattern is the character. Get it right and the bird is alive.
- **Idle.** Small weight shifts, a head turn, a preen now and then. Never a frozen statue.
- **Foraging payoff.** Some ground spots hold food (a worm, a small insect rendered in the same paint language). The peck at a food spot connects and the bird eats. Keep it low-key and satisfying. No score, no HUD counter required. The reward is the animation and the world.
- **Alert freeze.** An occasional head-up pause, the bird still and watchful, then back to foraging. Reads as a real prey bird without any actual threat present.

**Camera:** third person, following behind and slightly above the bird. The player sees the killdeer at all times as the subject of the painting. Smooth, gentle follow. The bird stays readable against the ground through value and edge contrast at all times.

**Control:** direct movement of the bird across the open field. Running triggers the run gait. Stopping settles into idle and invites a peck. Keep the control scheme minimal.

---

## Fixed constraints

| Constraint | Value |
|---|---|
| Language | TypeScript, `strict: true`, zero `any` |
| Build | Vite |
| Renderer | three.js **WebGPURenderer + TSL**; raw WGSL compute for the stroke and impasto passes where TSL limits you |
| Fallback | None. No WebGL path. Fail loudly with diagnostics. |
| Assets | **Zero external assets.** Every brush texture, stroke atlas, palette LUT, canvas-tooth map, noise volume, and the bird's paint textures: generated by code. The killdeer mesh may be authored, but its surface must be painted procedurally in the same language as the world. |
| Determinism | `?seed=N` reproduces the field layout, the wildflower scatter, and the food spots. |
| Architecture | Real modules (`src/render/`, `src/paint/`, `src/bird/`, `src/world/`, `src/debug/`). One giant file is a failure. |

---

## Floors — what "done" means for this prototype

Painterly floors are quality gates, not triangle counts.

| Dimension | Floor |
|---|---|
| **Stroke coherence** | A camera orbit and a full-speed bird sprint produce **no visible stroke swimming**. Strokes anchor to surfaces in world space. This is the pass/fail gate for the whole build. |
| **Impasto relief** | Strokes on the lit passages carry real height. Paint ridges self-shadow and catch a grazing highlight with anisotropic specular along the stroke direction. Not a flat normal map faking it. Thin paint in the shadows and sky. |
| **Palette discipline** | The scene draws from a bounded, high-key palette enforced by a LUT. Broken color everywhere. No single-hue surfaces. |
| **Value structure** | Any hero frame reduces cleanly to four or five value masses with the killdeer readable against the field. |
| **Killdeer identity** | Both breast bands, correct coloring, plover posture. Reads as a killdeer to anyone who knows the bird. |
| **Killdeer animation** | Run, run-stop-peck, idle with small motion, alert freeze, and the foraging peck-connects behavior. None stubbed. |
| **The field** | One open sunlit meadow, streamed or bounded, with grass rendered as strokes, wildflower and poppy-red accents scattered, a hazy warm sky, and a few trees or a treeline in the Monet manner at the edges. No photographic texture anywhere in frame. |
| **Wind** | Grass and flowers move in a gentle wind field as brushwork. Clouds drift. Pastoral, not stormy. |
| **Edge control** | Lost-and-found edges. Some silhouettes hard, some dissolving into neighbors. Uniformly crisp everything reads as 3D-with-a-filter and fails. |

---

## Rendering systems — enumerated passes

1. **Stroke field generation.** World-anchored stroke placement across surfaces, parent clumps plus scatter, following surface flow and form direction, written on GPU. Strokes carry position, direction, length, width, color-index, height.
2. **Impasto geometry / height pass.** Strokes on lit passages accumulate paint-body into a height and normal buffer so ridges self-shadow and catch grazing light. Thin in shadow and sky.
3. **Painterly shading.** Palette-quantized lighting on a warm-cool ramp, not PBR, driven by the palette LUT. Broken-color jitter within the palette. Anisotropic specular along stroke direction for the wet-paint sheen. Colored luminous shadows, never black.
4. **Edge pass.** Lost-and-found silhouette logic. An occasional dark accent where a painter would place one, suppressed elsewhere. Not a uniform outline shader.
5. **Canvas-tooth substrate.** A generated board or canvas normal-and-height layer showing through the thin passages, coherent with your temporal solution.
6. **Temporal anchoring / TAA.** The coherence solution. Strokes must reproject correctly under camera and animation motion. This pass is where the prototype is won or lost.
7. **Wind field.** Global gentle direction plus gust noise, sampled by grass, flowers, and cloud strokes so motion reads as brushwork in the wind.
8. **Color-script grade.** A final unifying filmic grade enforcing the high-key warm palette. The last glaze over the whole frame.

---

## Banned outcomes — instant fail

- **Filter-on-top.** A realistic or flat render with a post-process oil-paint filter. Paint must be in the shading model and the stroke geometry.
- **Swimming strokes.** Screen-space stroke boil or shower-door crawl under motion.
- **Cel-shading in disguise.** Hard toon bands with a paint texture pretending to be brushwork.
- **Single-hue surfaces.** Any grass, sky, or ground rendered without broken color.
- **Uniform stroke direction.** Strokes must follow form and flow, not sit at one global angle.
- **Black or muddy shadows.** Shadows are colored and luminous. High-key throughout.
- **PBR leakage.** Metalness-roughness realism, photographic textures, physically-correct shadows bleeding through the style.
- **A generic bird.** Missing a breast band, wrong posture, no run-stop-peck gait.
- **Out-of-scope work.** Any nest, predator, egg, chick, or story system built or stubbed in this prototype.
- `MeshBasicMaterial` in the world; CPU per-instance stroke updates; one-file architecture; asking the user to lower the bar.

---

## Phase plan — gated

The order is deliberate. Prove the paint holds in motion on one surface before building a field on a render that swims. Prove the bird before dressing the world around it.

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | Scaffold, WebGPU init, HUD, Playwright harness, references wired into a side-by-side tool | Harness produces comparisons |
| 1 | **Paint core.** One ground surface with world-anchored impasto strokes, high-key palette lighting, broken color, canvas tooth, and the temporal-anchoring solution | **Coherence gate: orbit and sprint with zero swimming. Nothing proceeds until this passes.** |
| 2 | **The killdeer.** Mesh, procedural paint surface, full animation set (run, run-stop-peck, idle, alert freeze, peck), third-person follow camera | Bird reads as a killdeer in motion vs. reference; run-stop-peck feels right |
| 3 | **The field.** Grass, wildflowers, poppy-red accents, trees or treeline at the edges, hazy warm sky, all as strokes; food spots and the foraging payoff | Field vs. the Monet references; no photographic texture in frame; foraging connects |
| 4 | **Breath and polish.** Wind through grass and flowers, drifting clouds, edge control, palette and value audits, the final grade, a few composed camera angles | A frozen frame is a painting; unfrozen, it breathes. Full verification battery + final delta loop |

A phase closes only after: build, run, verification battery, `DELTA.md`, fix top three, re-shoot.

---

## Verification battery — run at every phase close

1. **Reference-delta loop.** Side-by-sides, `DELTA.md` top ten, fix top three.
2. **Coherence test.** Camera orbit and a full-speed bird sprint. Any visible stroke swimming fails.
3. **Filter test.** Confirm the paint is in the shading model, not a screen-space post filter. Turning off the final grade should still leave a painted frame, not a realistic one.
4. **Value test.** Desaturate a hero frame. It must reduce to four or five clean value masses with the bird readable.
5. **Palette test.** Sample the frame against the palette LUT. No off-palette free RGB. Broken color present on every surface.
6. **Killdeer test.** Both breast bands, correct posture, run-stop-peck present and legible.
7. **Contact sheet.** Wide field vista, low ground-level foraging shot, bird close-up, sky-and-cloud shot.

---

## Self-score rubric — anchored to the references

Per row: 10 = passes a one-second glance against the reference painting; 7 = clearly synthetic but the same class of image; 4 = good hobby demo; 2 = filter-on-top fake. Score after every phase. For each row write "what raises this by 2 points" and implement the two cheapest before proceeding.

Rows: brushwork and impasto fidelity, palette and value structure, broken color, edge control, **stroke coherence in motion**, killdeer identity, killdeer animation and run-stop-peck feel, field and environment painting, wind and motion, composition and camera.

---

## Final acceptance — the one-frame test

Produce one frame: the killdeer mid-forage in the open field, sun high and warm, grass and poppies broken-colored around it, a hazy sky above, both breast bands legible. Place it beside the Monet references. If a viewer's eye doesn't snag within one second on a category error (flat ground, dead shadows, a filtered-not-painted look, a generic bird), the prototype has done its job.

Then hand it to the human to run and move the bird around the field. Their feel for the movement and the look is the last gate. Everything after that (the nest, the display, the season, the story) comes later, on this foundation.
