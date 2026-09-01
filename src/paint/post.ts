import {
  DepthTexture,
  HalfFloatType,
  NodeMaterial,
  QuadMesh,
  RenderTarget,
  Vector2,
  Vector3,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import {
  Fn,
  atan,
  clamp,
  cos,
  dot,
  float,
  mix,
  mx_noise_float,
  normalize,
  perspectiveDepthToViewZ,
  pow,
  sin,
  smoothstep,
  sqrt,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type Node from "three/src/nodes/core/Node.js";
import type UniformNode from "three/src/nodes/core/UniformNode.js";
import { SUN_DIR } from "./fields";

/**
 * The screen-space painterly post stack (Pillar A2). The scene — already
 * built from world-anchored strokes — passes through four stages that turn
 * the *frame* into paint:
 *
 *   1. flow      — structure tensor of the frame's luminance → a per-pixel
 *                  stroke direction (tangent along contours), anisotropy, and
 *                  linear view distance. In flat passages the tensor is
 *                  degenerate, so the tangent relaxes onto a slowly-turning
 *                  default field: even the sky carries a brush direction.
 *   2. kuwahara  — sectored edge-preserving smoothing oriented on the flow,
 *                  radius scaled by DISTANCE (light near, heavy far): the
 *                  background dissolves the way ref_b's treeline does while
 *                  foreground strokes keep their edges.
 *   3. streak    — a short line-integral blur along the flow that drags the
 *                  paint into directional marks, plus a cross-flow wobble
 *                  that breaks every silhouette (no clean anti-aliased edge
 *                  survives).
 *   4. surface   — the material of the picture itself: elongated stroke
 *                  grain along the flow, a canvas weave over the whole frame
 *                  (loudest in thin passages), impasto relief lit from the
 *                  sun's screen direction where light collects, then the
 *                  final color-script grade (`?grade=0` skips only the grade).
 *
 * Everything is a deterministic function of the frame — nothing temporal, so
 * shot determinism and the static boil check are untouched.
 */

const LUM = vec3(0.2126, 0.7152, 0.0722);

/** Sectored sample offsets for the kuwahara stage, fixed at build time. */
interface KuwaharaTap {
  readonly x: number;
  readonly y: number;
  readonly sector: number;
}

function buildTaps(): readonly KuwaharaTap[] {
  const sectors = 6;
  const taps: KuwaharaTap[] = [];
  const ring: readonly (readonly [number, number])[] = [
    [-0.28, 0.55],
    [0.28, 0.55],
    [-0.17, 1.0],
    [0.17, 1.0],
  ];
  for (let s = 0; s < sectors; s++) {
    const base = (s / sectors) * Math.PI * 2;
    for (const [da, r] of ring) {
      taps.push({ x: Math.cos(base + da) * r, y: Math.sin(base + da) * r, sector: s });
    }
  }
  return taps;
}

export interface PaintPostOptions {
  /** Apply the final color-script grade (the `?grade` param). */
  readonly grade: boolean;
}

export class PaintPost {
  private readonly renderer: WebGPURenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;

  private readonly sceneRT: RenderTarget;
  private readonly flowRT: RenderTarget;
  private readonly kuwRT: RenderTarget;
  private readonly streakRT: RenderTarget;

  private readonly flowQuad: QuadMesh;
  private readonly kuwQuad: QuadMesh;
  private readonly streakQuad: QuadMesh;
  private readonly surfaceQuad: QuadMesh;

  private readonly invSize: UniformNode<"vec2", Vector2>;
  private readonly sunScreen: UniformNode<"vec2", Vector2>;
  private readonly sizeScratch = new Vector2();
  private readonly sunScratch = new Vector3();

  constructor(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, options: PaintPostOptions) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const rtOpts = { type: HalfFloatType, depthBuffer: false } as const;
    this.sceneRT = new RenderTarget(4, 4, { type: HalfFloatType });
    this.sceneRT.depthTexture = new DepthTexture(4, 4);
    this.flowRT = new RenderTarget(4, 4, rtOpts);
    this.kuwRT = new RenderTarget(4, 4, rtOpts);
    this.streakRT = new RenderTarget(4, 4, rtOpts);

    this.invSize = uniform(new Vector2(1 / 4, 1 / 4));
    this.sunScreen = uniform(new Vector2(0.5, 0.5));

    this.flowQuad = new QuadMesh(this.buildFlowMaterial());
    this.kuwQuad = new QuadMesh(this.buildKuwaharaMaterial());
    this.streakQuad = new QuadMesh(this.buildStreakMaterial());
    this.surfaceQuad = new QuadMesh(this.buildSurfaceMaterial(options.grade));
  }

  // -------------------------------------------------------------------------

  private quadMaterial(fragment: Node): NodeMaterial {
    const material = new NodeMaterial();
    material.fragmentNode = fragment;
    material.depthTest = false;
    material.depthWrite = false;
    return material;
  }

  private sampleLum(tex: Texture, at: Node): Node<"float"> {
    return dot(texture(tex, at).rgb, LUM);
  }

  /**
   * Stage 1 — flow field. Output: (tangent.x, tangent.y, anisotropy, dist).
   */
  private buildFlowMaterial(): NodeMaterial {
    const colorTex = this.sceneRT.texture;
    const depthTex = this.sceneRT.depthTexture as DepthTexture;
    const invSize = this.invSize;
    const near = this.camera.near;
    const far = this.camera.far;

    const fragment = Fn(() => {
      const p = uv().toVar();

      // Structure tensor from Sobel gradients, averaged over a small cross of
      // evaluation points so the orientation field is already smooth.
      const e = float(0).toVar();
      const f = float(0).toVar();
      const g = float(0).toVar();
      const centers: readonly (readonly [number, number])[] = [
        [0, 0],
        [1.4, 1.4],
        [-1.4, 1.4],
        [1.4, -1.4],
        [-1.4, -1.4],
      ];
      for (const [cx, cy] of centers) {
        const c = p.add(vec2(cx, cy).mul(invSize));
        const t = invSize;
        const l00 = this.sampleLum(colorTex, c.add(vec2(-1, -1).mul(t)));
        const l01 = this.sampleLum(colorTex, c.add(vec2(-1, 0).mul(t)));
        const l02 = this.sampleLum(colorTex, c.add(vec2(-1, 1).mul(t)));
        const l20 = this.sampleLum(colorTex, c.add(vec2(1, -1).mul(t)));
        const l21 = this.sampleLum(colorTex, c.add(vec2(1, 0).mul(t)));
        const l22 = this.sampleLum(colorTex, c.add(vec2(1, 1).mul(t)));
        const l10 = this.sampleLum(colorTex, c.add(vec2(0, -1).mul(t)));
        const l12 = this.sampleLum(colorTex, c.add(vec2(0, 1).mul(t)));
        const gx = l00.add(l01.mul(2)).add(l02).sub(l20).sub(l21.mul(2)).sub(l22);
        const gy = l00.add(l10.mul(2)).add(l20).sub(l02).sub(l12.mul(2)).sub(l22);
        e.addAssign(gx.mul(gx));
        f.addAssign(gx.mul(gy));
        g.addAssign(gy.mul(gy));
      }

      // Eigen-structure: orientation of dominant gradient, then rotate 90°
      // for the stroke tangent (paint runs ALONG contours, not across them).
      const diff = e.sub(g);
      const root = sqrt(diff.mul(diff).add(f.mul(f).mul(4.0)));
      const aniso = root.div(e.add(g).add(1e-5)).clamp(0.0, 1.0);
      const phi = atan(f.mul(2.0), diff).mul(0.5);
      const tRaw = vec2(sin(phi).negate(), cos(phi));

      // Degenerate (flat) regions relax onto a slow default field so the sky
      // still carries a coherent brush direction: long, lazy, near-horizontal
      // drags (the way a sky is actually laid in), never tight swirls.
      const drift = mx_noise_float(vec3(p.mul(1.15), 31.7)).mul(0.42).sub(0.12);
      const baseDir = vec2(cos(drift), sin(drift));
      const stable = smoothstep(0.008, 0.09, root);
      const tangent = normalize(mix(baseDir, tRaw, stable));

      // Linear view distance from the depth buffer.
      const d = texture(depthTex, p).x;
      const dist = perspectiveDepthToViewZ(d, float(near), float(far)).negate().min(650.0);

      return vec4(tangent, aniso, dist);
    })();

    return this.quadMaterial(fragment);
  }

  /**
   * Stage 2 — sectored, flow-oriented, distance-scaled smoothing.
   */
  private buildKuwaharaMaterial(): NodeMaterial {
    const colorTex = this.sceneRT.texture;
    const flowTex = this.flowRT.texture;
    const invSize = this.invSize;
    const taps = buildTaps();

    const fragment = Fn(() => {
      const p = uv().toVar();
      const flow = texture(flowTex, p).toVar();
      const tangent = flow.xy;
      const aniso = flow.z;
      const dist = flow.w;

      // The knob that makes distance dissolve: radius grows from a whisper at
      // the feet to a heavy melt at the horizon band.
      const farFactor = smoothstep(2.5, 110.0, dist).toVar();
      const radius = mix(float(1.25), float(5.6), farFactor);
      const stretch = aniso.mul(0.75).add(1.0);
      const along = tangent.mul(radius.mul(stretch));
      const across = vec2(tangent.y.negate(), tangent.x).mul(radius.div(stretch));

      const sectors = 6;
      const means: Node<"vec3">[] = [];
      const vars: Node<"float">[] = [];
      const sums: { c: ReturnType<typeof vec3.prototype.toVar>[] } = { c: [] };
      for (let s = 0; s < sectors; s++) {
        sums.c.push(vec3(0).toVar());
      }
      const sumL: ReturnType<typeof float.prototype.toVar>[] = [];
      const sumL2: ReturnType<typeof float.prototype.toVar>[] = [];
      for (let s = 0; s < sectors; s++) {
        sumL.push(float(0).toVar());
        sumL2.push(float(0).toVar());
      }

      for (const tap of taps) {
        const off = along.mul(tap.x).add(across.mul(tap.y)).mul(invSize);
        const c = texture(colorTex, p.add(off)).rgb;
        const l = dot(c, LUM);
        sums.c[tap.sector].addAssign(c);
        sumL[tap.sector].addAssign(l);
        sumL2[tap.sector].addAssign(l.mul(l));
      }

      const perSector = taps.length / sectors;
      for (let s = 0; s < sectors; s++) {
        const mean = sums.c[s].div(perSector);
        const ml = sumL[s].div(perSector);
        const variance = sumL2[s].div(perSector).sub(ml.mul(ml)).max(0.0);
        means.push(mean);
        vars.push(variance);
      }

      // Soft sector choice: low-variance (flat) sectors dominate — paint laid
      // in the direction where color agrees.
      let weightSum: Node<"float"> = float(1e-5);
      let colorSum: Node<"vec3"> = vec3(0);
      for (let s = 0; s < 6; s++) {
        const w = pow(vars[s].mul(280.0).add(1.0), float(-2.2));
        weightSum = weightSum.add(w);
        colorSum = colorSum.add(means[s].mul(w));
      }

      // Near the camera the original strokes are already the painting: keep
      // them almost untouched so the foreground stays crisp impasto.
      const smoothed = colorSum.div(weightSum);
      const original = texture(colorTex, p).rgb;
      const amount = mix(float(0.35), float(1.0), farFactor);
      return vec4(mix(original, smoothed, amount), 1.0);
    })();

    return this.quadMaterial(fragment);
  }

  /**
   * Stage 3 — directional streaking + silhouette wobble.
   */
  private buildStreakMaterial(): NodeMaterial {
    const kuwTex = this.kuwRT.texture;
    const flowTex = this.flowRT.texture;
    const invSize = this.invSize;

    const fragment = Fn(() => {
      const p0 = uv().toVar();
      const flow = texture(flowTex, p0).toVar();
      const tangent = flow.xy;
      const dist = flow.w;
      const farFactor = smoothstep(2.5, 110.0, dist);

      // Hand tremor across the flow: silhouettes wobble by a pixel or two so
      // no edge in the frame stays machine-straight.
      const perp = vec2(tangent.y.negate(), tangent.x);
      const px = p0.div(invSize);
      const tremor = mx_noise_float(vec3(px.mul(0.055), 7.7)).mul(mix(float(1.1), float(2.1), farFactor));
      const p = p0.add(perp.mul(tremor).mul(invSize)).toVar();

      const stepLen = mix(float(0.9), float(2.2), farFactor);
      const stepUv = tangent.mul(stepLen).mul(invSize);

      const weights = [0.24, 0.19, 0.115, 0.05, 0.016];
      let acc: Node<"vec3"> = texture(kuwTex, p).rgb.mul(weights[0]);
      let wSum: Node<"float"> = float(weights[0]);
      for (let i = 1; i < weights.length; i++) {
        const w = weights[i];
        acc = acc.add(texture(kuwTex, p.add(stepUv.mul(i))).rgb.mul(w));
        acc = acc.add(texture(kuwTex, p.sub(stepUv.mul(i))).rgb.mul(w));
        wSum = wSum.add(w * 2);
      }
      return vec4(acc.div(wSum), 1.0);
    })();

    return this.quadMaterial(fragment);
  }

  /**
   * Stage 4 — the picture surface: stroke grain, canvas weave, impasto
   * relief, final grade.
   */
  private buildSurfaceMaterial(grade: boolean): NodeMaterial {
    const streakTex = this.streakRT.texture;
    const flowTex = this.flowRT.texture;
    const invSize = this.invSize;
    const sunScreen = this.sunScreen;

    const fragment = Fn(() => {
      const p = uv().toVar();
      const flow = texture(flowTex, p).toVar();
      const tangent = flow.xy;
      const dist = flow.w;
      const farFactor = smoothstep(2.5, 110.0, dist);
      const px = p.div(invSize).toVar();

      let c = texture(streakTex, p).rgb.toVar();
      const lum = dot(c, LUM).toVar();

      // --- elongated stroke grain along the flow: the bristle texture that
      // keeps even a quiet gradient (the sky) reading as dragged paint.
      const along = dot(px, tangent);
      const acrossPx = dot(px, vec2(tangent.y.negate(), tangent.x));
      const grain = mx_noise_float(vec3(along.mul(0.045), acrossPx.mul(0.34), 3.1));
      const grain2 = mx_noise_float(vec3(along.mul(0.11), acrossPx.mul(0.5), 17.9));
      const grainAmp = mix(float(0.028), float(0.045), farFactor);
      c.assign(c.mul(grain.mul(grainAmp).add(grain2.mul(grainAmp).mul(0.6)).add(1.0)));

      // --- impasto relief: height ≈ local luminance excess; lit by the sun's
      // screen-space direction, and only where light already collects — thick
      // paint is a phenomenon of the lights, not the shadows.
      const t = invSize;
      const hx1 = this.sampleLum(streakTex, p.add(vec2(1.6, 0).mul(t)));
      const hx0 = this.sampleLum(streakTex, p.sub(vec2(1.6, 0).mul(t)));
      const hy1 = this.sampleLum(streakTex, p.add(vec2(0, 1.6).mul(t)));
      const hy0 = this.sampleLum(streakTex, p.sub(vec2(0, 1.6).mul(t)));
      const dhx = hx1.sub(hx0);
      const dhy = hy1.sub(hy0);
      const thickness = smoothstep(0.35, 0.8, lum).mul(mix(float(1.0), float(0.12), farFactor));
      const reliefLight = dhx.mul(sunScreen.x).add(dhy.mul(sunScreen.y));
      c.assign(c.mul(reliefLight.mul(thickness).mul(0.85).add(1.0)));

      // --- canvas weave over the whole frame, breaking through where the
      // paint lies thin (dark passages and the melted distance).
      const wob = mx_noise_float(vec3(px.mul(0.02), 51.3)).mul(2.8);
      const warp = sin(px.x.mul(1.35).add(wob)).mul(sin(px.y.mul(1.35).sub(wob)));
      const threadNoise = mx_noise_float(vec3(px.x.mul(0.7), px.y.mul(0.7), 91.1)).mul(0.4).add(0.8);
      const thin = float(1.0).sub(thickness.mul(0.75));
      const weaveAmp = mix(float(0.024), float(0.038), farFactor).mul(thin);
      c.assign(c.mul(warp.mul(threadNoise).mul(weaveAmp).add(1.0)));

      // --- the color-script grade (the last glaze; `?grade=0` skips it).
      if (grade) {
        c.assign(c.mul(vec3(1.045, 1.006, 0.952)).add(vec3(0.012, 0.008, 0.0)));
        const curved = c.mul(c).mul(vec3(3.0).sub(c.mul(2.0)));
        c.assign(mix(c, curved, 0.22));
        const gl = c.dot(LUM);
        c.assign(mix(vec3(gl), c, 1.06));
        c.assign(c.mul(0.985).add(vec3(0.012, 0.011, 0.013)));
      }

      return vec4(clamp(c, 0.0, 1.0), 1.0);
    })();

    return this.quadMaterial(fragment);
  }

  // -------------------------------------------------------------------------

  private resize(): void {
    const size = this.renderer.getDrawingBufferSize(this.sizeScratch);
    const w = Math.max(4, Math.floor(size.x));
    const h = Math.max(4, Math.floor(size.y));
    if (this.sceneRT.width === w && this.sceneRT.height === h) return;
    this.sceneRT.setSize(w, h);
    this.flowRT.setSize(w, h);
    this.kuwRT.setSize(w, h);
    this.streakRT.setSize(w, h);
    this.invSize.value.set(1 / w, 1 / h);
  }

  render(): void {
    this.resize();

    // Sun direction projected into view space → screen-space light for the
    // impasto relief. Recomputed per frame so orbiting keeps ridges honest.
    const s = this.sunScratch.copy(SUN_DIR).transformDirection(this.camera.matrixWorldInverse);
    const len = Math.hypot(s.x, s.y) || 1;
    this.sunScreen.value.set(s.x / len, s.y / len);

    const renderer = this.renderer;
    renderer.setRenderTarget(this.sceneRT);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(this.flowRT);
    this.flowQuad.render(renderer);
    renderer.setRenderTarget(this.kuwRT);
    this.kuwQuad.render(renderer);
    renderer.setRenderTarget(this.streakRT);
    this.streakQuad.render(renderer);
    renderer.setRenderTarget(null);
    this.surfaceQuad.render(renderer);
  }
}
