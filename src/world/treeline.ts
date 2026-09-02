import { InstancedBufferAttribute, InstancedMesh, NodeMaterial, PlaneGeometry, Vector3 } from "three/webgpu";
import {
  Discard,
  Fn,
  abs,
  clamp,
  cos,
  hash,
  mix,
  sin,
  mx_noise_float,
  instancedBufferAttribute,
  smoothstep,
  texture,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  cameraPosition,
  positionWorld,
} from "three/tsl";
import { Rng } from "../core/rng";
import { SUN_DIR } from "../paint/fields";
import type { AtmosphereUniforms, PaletteLUT } from "../paint/palette";

/**
 * The treeline — distant tree masses in the Monet manner: stacked foliage
 * daubs, cool and dark against the sky, dissolving into the atmosphere.
 * World-static (seeded once, never streamed): a ring of poplars and broad
 * crowns around the walkable meadow. Placement is CPU-seeded (a fixed set,
 * not a streamed field) and rendered as the same world-anchored instanced
 * ribbons as everything else.
 */

interface TreeStroke {
  cx: number;
  cy: number;
  cz: number;
  len: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  wid: number;
  row: number;
  value: number;
  rand: number;
}

function planTrees(seed: number): TreeStroke[] {
  const rng = new Rng(seed).fork("treeline");
  const strokes: TreeStroke[] = [];

  // Anchor clusters around the ring, most growing companion masses so the
  // horizon reads as a broken band of groves, not isolated lollipops.
  interface Site {
    az: number;
    radius: number;
  }
  const sites: Site[] = [];
  const anchorCount = 15;
  for (let c = 0; c < anchorCount; c++) {
    const az = (c / anchorCount) * Math.PI * 2 + rng.range(-0.12, 0.12);
    const radius = rng.range(175, 235);
    sites.push({ az, radius });
    const companions = rng.next() < 0.6 ? (rng.next() < 0.35 ? 2 : 1) : 0;
    for (let k = 0; k < companions; k++) {
      sites.push({ az: az + rng.range(0.035, 0.09) * (rng.next() < 0.5 ? -1 : 1), radius: radius + rng.range(-14, 14) });
    }
  }

  for (const site of sites) {
    const cx = Math.sin(site.az) * site.radius;
    const cz = Math.cos(site.az) * site.radius;
    const poplar = rng.next() < 0.35;

    const height = poplar ? rng.range(14, 22) : rng.range(9, 14);
    const crownR = poplar ? rng.range(2.2, 3.4) : rng.range(5, 9);
    const crownBase = poplar ? height * 0.18 : height * 0.35;
    const sunSide = Math.sign(SUN_DIR.x) || 1;
    const daubs = poplar ? 48 : 92;

    for (let i = 0; i < daubs; i++) {
      // Bias daubs upward and outward — canopy shells, not filled volumes.
      const t = Math.pow(rng.next(), 0.65); // 0 base → 1 top
      const y = crownBase + t * (height - crownBase);
      const shellR = crownR * Math.sqrt(Math.max(0.15, 1 - t * t * 0.85)) * rng.range(0.4, 0.85);
      const theta = rng.range(0, Math.PI * 2);
      const px = cx + Math.cos(theta) * shellR;
      const pz = cz + Math.sin(theta) * shellR * 0.8;

      // Foliage daubs arc with the canopy: mostly horizontal, drooping tips.
      const dir = new Vector3(Math.cos(theta + Math.PI / 2), rng.range(-0.15, 0.2), Math.sin(theta + Math.PI / 2)).normalize();

      // Lit crown on the sun side and top; the body is the hedgerow dark.
      const litSide = (Math.cos(theta) * sunSide + 1) / 2;
      const litAmt = Math.min(1, t * 0.75 + litSide * 0.45);
      const row = litAmt > 0.72 ? 1 : litAmt > 0.4 ? 2 : 4;
      const value = 0.1 + litAmt * 0.42 + rng.range(-0.05, 0.05);

      strokes.push({
        cx: px,
        cy: y,
        cz: pz,
        len: (poplar ? rng.range(2.4, 4.0) : rng.range(4.0, 7.0)) * (0.7 + t * 0.4),
        dirX: dir.x,
        dirY: dir.y,
        dirZ: dir.z,
        wid: rng.range(1.6, 2.9),
        row,
        value: Math.max(0.05, Math.min(0.9, value)),
        rand: rng.next(),
      });
    }

    // Understory: broad dark daubs seating the tree into the ground — the
    // Monet treeline's low dark band, so crowns never float on the haze.
    const skirts = poplar ? 5 : 9;
    for (let i = 0; i < skirts; i++) {
      const theta = rng.range(0, Math.PI * 2);
      const r = crownR * rng.range(0.4, 1.15);
      strokes.push({
        cx: cx + Math.cos(theta) * r,
        cy: rng.range(0.4, 2.2),
        cz: cz + Math.sin(theta) * r * 0.8,
        len: rng.range(4.5, 8.0),
        dirX: Math.cos(theta + Math.PI / 2),
        dirY: rng.range(-0.04, 0.08),
        dirZ: Math.sin(theta + Math.PI / 2),
        wid: rng.range(1.8, 3.2),
        row: 4,
        value: 0.08 + rng.range(0, 0.1),
        rand: rng.next(),
      });
    }

    // Trunk hints: one or two dark verticals under the crown.
    const trunks = poplar ? 1 : 2;
    for (let i = 0; i < trunks; i++) {
      strokes.push({
        cx: cx + rng.range(-1.2, 1.2),
        cy: crownBase * 0.55,
        cz: cz + rng.range(-1.2, 1.2),
        len: crownBase * 1.15,
        dirX: 0,
        dirY: 1,
        dirZ: 0,
        wid: rng.range(0.35, 0.6),
        row: 14,
        value: 0.1 + rng.range(0, 0.06),
        rand: rng.next(),
      });
    }
  }
  return strokes;
}

export function buildTreeline(seed: number, lut: PaletteLUT, atm: AtmosphereUniforms): InstancedMesh {
  const strokes = planTrees(seed);
  const count = strokes.length;

  // Exactly TWO per-instance attributes — a third data stream (storage or
  // attribute) reads back garbage in vertex shaders on this stack, so all
  // per-stroke data is packed into two vec4s:
  //   A: center.xyz, len·100+rand           B: azimuth, pitch, wid, row·10+value·9
  // Direction is azimuth/pitch, which also yields a never-degenerate side
  // frame in-shader (cross().normalize() NaN'd out here).
  const dataA = new Float32Array(count * 4);
  const dataB = new Float32Array(count * 4);
  strokes.forEach((s, i) => {
    const az = Math.atan2(s.dirZ, s.dirX);
    const pitch = Math.asin(Math.max(-1, Math.min(1, s.dirY)));
    const lenRand = Math.floor(s.len * 100) + Math.min(0.99, s.rand);
    const rowValue = s.row * 10 + Math.max(0, Math.min(0.99, s.value)) * 9;
    dataA.set([s.cx, s.cy, s.cz, lenRand], i * 4);
    dataB.set([az, pitch, s.wid, rowValue], i * 4);
  });

  const material = new NodeMaterial();
  const recA = instancedBufferAttribute<"vec4">(new InstancedBufferAttribute(dataA, 4));
  const recB = instancedBufferAttribute<"vec4">(new InstancedBufferAttribute(dataB, 4));
  const vB = varying(recB);
  const vRand = varying(recA.w.fract());

  material.positionNode = Fn(() => {
    const u = uv().x.sub(0.5);
    const v = uv().y.sub(0.5);
    const center = recA.xyz;
    const len = recA.w.floor().mul(0.01);
    const rand = recA.w.fract();
    const az = recB.x;
    const pitch = recB.y;
    const wid = recB.z;

    const cp = cos(pitch);
    const dir = vec3(cp.mul(cos(az)), sin(pitch), cp.mul(sin(az)));
    // Side frame without a cross product: horizontal perpendicular blended
    // toward up by how vertical the stroke is — orthogonal parts, never zero.
    const sideH = vec3(sin(az).negate(), 0.0, cos(az));
    const upness = abs(sin(pitch)).mul(0.85).add(0.15);
    const side = mix(vec3(0.0, 1.0, 0.0), sideH, upness).normalize();

    const arc = u.mul(u).mul(4.0).sub(1.0).mul(rand.sub(0.5)).mul(wid).mul(0.4);
    return center.add(dir.mul(u.mul(len))).add(side.mul(v.mul(wid).add(arc)));
  })();

  material.fragmentNode = Fn(() => {
    const u = uv().x.sub(0.5);
    const v = uv().y.sub(0.5);
    const row = vB.w.mul(0.1).floor();
    const value = vB.w.sub(row.mul(10.0)).div(9.0);
    const rand = vRand;

    const edgeNoise = mx_noise_float(vec3(u.mul(4.0), v.mul(3.0), rand.mul(311.7)));
    const endMask = smoothstep(0.5, 0.3, abs(u).add(edgeNoise.mul(0.16)));
    const sideMask = smoothstep(0.5, 0.26, abs(v).add(edgeNoise.mul(0.2)));
    Discard(endMask.mul(sideMask).lessThan(0.4));

    const bristle = mx_noise_float(vec3(v.mul(6.0), u.mul(3.0), rand.mul(157.3))).mul(0.5).add(0.5);
    const dither = hash(positionWorld.x.mul(31.7).add(positionWorld.y.mul(57.3))).sub(0.5).mul(0.05);
    const vFinal = clamp(value.add(bristle.sub(0.5).mul(0.12)).add(dither), 0.03, 0.95);
    const paint = texture(lut.texture, vec2(vFinal, row.add(0.5).div(lut.rows))).rgb;

    // The treeline sits inside the atmosphere: cool far-band shift, then the
    // same warm haze the ground dissolves into. Lost edges by construction.
    const d = positionWorld.xz.sub(cameraPosition.xz).length();
    const farBand = smoothstep(120.0, 320.0, d);
    const cooled = mix(paint, atm.farField, farBand.mul(0.42));
    const hazeAmt = smoothstep(220.0, 460.0, d).mul(0.75);
    const finalColor = mix(cooled, atm.haze, hazeAmt);

    return vec4(finalColor, 1.0);
  })();

  const mesh = new InstancedMesh(new PlaneGeometry(1, 1, 2, 1), material, count);
  mesh.frustumCulled = false;
  return mesh;
}
