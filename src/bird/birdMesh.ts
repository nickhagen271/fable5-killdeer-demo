import {
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  NodeMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three/webgpu";
import { Fn, float, mx_noise_float, positionLocal, select, smoothstep, texture, uv, vec2, vec4 } from "three/tsl";
import type { FloatExpr } from "../paint/fields";
import { ROW, type PaletteLUT } from "../paint/palette";
import { buildBirdMaterial } from "./birdMaterial";

/**
 * The killdeer, sculpted in code. No external assets: a lathe body, sphere
 * head, cone bill, wedge tail, panel wings, cylinder legs — with every
 * marking (the two black breast bands, white collar, face pattern, rust
 * rump) painted procedurally in part-local coordinates.
 *
 * Bird local convention: +Z forward (bill), +Y up.
 */

export interface BirdRig {
  readonly root: Group;
  readonly bodyG: Group;
  readonly neckG: Group;
  readonly headG: Group;
  readonly tailG: Group;
  readonly hips: readonly [Group, Group];
  readonly feet: readonly [Group, Group];
}

const BODY_LEN = 0.14;
const BODY_Y = 0.088;

function bodyMarking(local: ReturnType<typeof positionLocal.toVar>): FloatExpr {
  const t = local.z.add(BODY_LEN / 2).div(BODY_LEN); // 0 tail → 1 breast/neck
  const rad = local.xy.length().max(0.0001);
  const belly = local.y.negate().div(rad); // 1 = underside, -1 = back
  const wob = mx_noise_float(local.mul(95.0)).mul(0.04);
  const tw = t.add(wob);

  let row: FloatExpr = float(ROW.birdTaupe);
  // Cream underparts sweeping up the breast.
  row = select(belly.greaterThan(float(0.3).sub(tw.mul(0.25))).and(tw.greaterThan(0.05)), float(ROW.birdCream), row);
  // Rust rump above the tail base; cream vent below it.
  row = select(tw.lessThan(0.16).and(belly.lessThan(-0.15)), float(ROW.birdRust), row);
  row = select(tw.lessThan(0.14).and(belly.greaterThan(0.35)), float(ROW.birdCream), row);
  // Lower breast band — the second black band, front and sides only.
  row = select(tw.greaterThan(0.66).and(tw.lessThan(0.76)).and(belly.greaterThan(-0.25)), float(ROW.birdBlack), row);
  // Cream gap between the bands.
  row = select(tw.greaterThan(0.76).and(tw.lessThan(0.84)).and(belly.greaterThan(-0.5)), float(ROW.birdCream), row);
  // Upper band — a full black ring around the lower neck, tight to the head.
  row = select(tw.greaterThan(0.84).and(tw.lessThan(0.93)), float(ROW.birdBlack), row);
  // White collar above it, meeting the head's throat.
  row = select(tw.greaterThan(0.93), float(ROW.birdCream), row);
  return row;
}

function headMarking(local: ReturnType<typeof positionLocal.toVar>): FloatExpr {
  const n = local.div(0.029).toVar();
  const wob = mx_noise_float(local.mul(140.0)).mul(0.09);
  const ny = n.y.add(wob);
  const nz = n.z.add(wob);

  let row: FloatExpr = float(ROW.birdTaupe); // crown, nape, upper cheek
  // White chin and throat, wrapping down to the collar.
  row = select(ny.lessThan(-0.3), float(ROW.birdCream), row);
  // White supercilium band above the eye line.
  row = select(ny.greaterThan(0.18).and(ny.lessThan(0.44)).and(nz.lessThan(0.65)), float(ROW.birdCream), row);
  // White forehead patch above the bill.
  row = select(nz.greaterThan(0.62).and(ny.greaterThan(-0.05)).and(ny.lessThan(0.42)), float(ROW.birdCream), row);
  // Black frontal bar separating forehead from crown.
  row = select(ny.greaterThan(0.42).and(ny.lessThan(0.58)).and(nz.greaterThan(0.45)), float(ROW.birdBlack), row);
  // Umber eye stripe across the cheeks — narrow, sides only, so the dark eye
  // and orange ring stay legible inside it.
  row = select(
    ny.greaterThan(-0.04).and(ny.lessThan(0.18)).and(n.x.abs().greaterThan(0.42)).and(nz.lessThan(0.7)),
    float(ROW.birdUmber),
    row,
  );
  return row;
}

function wingMarking(local: ReturnType<typeof positionLocal.toVar>): FloatExpr {
  const wob = mx_noise_float(local.mul(120.0)).mul(0.008);
  let row: FloatExpr = float(ROW.birdTaupe);
  // Dark folded primaries toward the tip; a cream edge along the low border.
  row = select(local.z.add(wob).lessThan(-0.028), float(ROW.birdUmber), row);
  row = select(local.y.add(wob).lessThan(-0.014), float(ROW.birdCream), row);
  return row;
}

function tailMarking(local: ReturnType<typeof positionLocal.toVar>): FloatExpr {
  const t = local.z.negate().div(0.075); // 0 base → 1 tip
  const wob = mx_noise_float(local.mul(110.0)).mul(0.05);
  const tt = t.add(wob);
  let row: FloatExpr = float(ROW.birdRust);
  row = select(tt.greaterThan(0.55).and(tt.lessThan(0.82)), float(ROW.birdBlack), row);
  row = select(tt.greaterThanEqual(0.82), float(ROW.birdCream), row);
  return row;
}

function constantMarking(row: number): (local: ReturnType<typeof positionLocal.toVar>) => FloatExpr {
  return () => float(row);
}

/** Soft painted contact shadow that keeps the bird seated on the ground. */
function contactShadow(lut: PaletteLUT): Mesh {
  const material = new NodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.fragmentNode = Fn(() => {
    const r = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const alpha = smoothstep(1.0, 0.25, r).mul(0.38);
    const shade = texture(lut.texture, vec2(0.16, (ROW.coolGreen + 0.5) / lut.rows)).rgb;
    return vec4(shade, alpha);
  })();
  const mesh = new Mesh(new CircleGeometry(0.15, 24), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.009; // just over the paint surface beneath the root
  return mesh;
}

export function buildBirdRig(lut: PaletteLUT): BirdRig {
  const taupeFlow: readonly [number, number, number] = [0, 0, 1];

  const matBody = buildBirdMaterial(lut, bodyMarking, { flow: taupeFlow });
  const matHead = buildBirdMaterial(lut, headMarking, { flow: [0, 0.3, 1] });
  const matWing = buildBirdMaterial(lut, wingMarking, { flow: [0, 0, 1] });
  const matTail = buildBirdMaterial(lut, tailMarking, { flow: [0, 0, 1] });
  const matBill = buildBirdMaterial(lut, constantMarking(ROW.birdUmber), { flow: [0, 0, 1], valueShift: -0.18 });
  const matEye = buildBirdMaterial(lut, constantMarking(ROW.birdBlack), { valueShift: -0.2 });
  const matRing = buildBirdMaterial(lut, constantMarking(ROW.poppy), { valueShift: 0.12 });
  const matLeg = buildBirdMaterial(lut, constantMarking(ROW.birdLeg), { flow: [0, 1, 0] });

  const root = new Group();

  // --- body ---------------------------------------------------------------
  const profile = [
    new Vector2(0.008, -0.07),
    new Vector2(0.025, -0.048),
    new Vector2(0.036, -0.02),
    new Vector2(0.0415, 0.01),
    new Vector2(0.038, 0.034),
    new Vector2(0.028, 0.056),
    new Vector2(0.015, 0.07),
  ];
  const bodyGeo = new LatheGeometry(profile, 26);
  bodyGeo.rotateX(Math.PI / 2); // axis → +Z
  const bodyG = new Group();
  bodyG.position.y = BODY_Y;
  const bodyMesh = new Mesh(bodyGeo, matBody);
  bodyMesh.scale.set(0.86, 1, 1); // slightly narrow
  bodyG.add(bodyMesh);
  root.add(bodyG);

  // --- wings (folded panels, tips crossing toward the tail) ----------------
  for (const s of [-1, 1] as const) {
    const wingGeo = new SphereGeometry(1, 18, 12);
    wingGeo.scale(0.011, 0.02, 0.07);
    const wing = new Mesh(wingGeo, matWing);
    wing.position.set(s * 0.0295, 0.02, -0.022);
    wing.rotation.x = -0.18;
    wing.rotation.y = s * -0.14;
    bodyG.add(wing);
  }

  // --- tail ----------------------------------------------------------------
  const tailG = new Group();
  tailG.position.set(0, 0.008, -0.06);
  const tailGeo = new ConeGeometry(0.021, 0.086, 10);
  tailGeo.rotateX(-Math.PI / 2); // point → -Z
  tailGeo.translate(0, 0, -0.043);
  const tail = new Mesh(tailGeo, matTail);
  tail.scale.set(1, 0.4, 1);
  tailG.add(tail);
  tailG.rotation.x = 0.05;
  bodyG.add(tailG);

  // --- neck and head --------------------------------------------------------
  const neckG = new Group();
  neckG.position.set(0, 0.034, 0.05);
  bodyG.add(neckG);

  const neckGeo = new CylinderGeometry(0.014, 0.02, 0.024, 12);
  const neck = new Mesh(neckGeo, matBody);
  neck.position.set(0, 0.008, 0.004);
  neck.rotation.x = 0.25;
  neckG.add(neck);

  const headG = new Group();
  headG.position.set(0, 0.024, 0.013);
  neckG.add(headG);

  const headGeo = new SphereGeometry(0.029, 22, 16);
  headGeo.scale(0.9, 1, 1.06);
  headG.add(new Mesh(headGeo, matHead));

  const billGeo = new ConeGeometry(0.0048, 0.03, 10);
  billGeo.rotateX(Math.PI / 2); // point → +Z
  const bill = new Mesh(billGeo, matBill);
  bill.position.set(0, -0.005, 0.038);
  bill.rotation.x = -0.06;
  headG.add(bill);

  for (const s of [-1, 1] as const) {
    const eye = new Mesh(new SphereGeometry(0.0055, 12, 10), matEye);
    eye.position.set(s * 0.0215, 0.004, 0.01);
    headG.add(eye);
    const ring = new Mesh(new TorusGeometry(0.0066, 0.0017, 8, 20), matRing);
    ring.position.copy(eye.position);
    ring.rotation.y = Math.PI / 2;
    headG.add(ring);
  }

  // --- legs (root-attached so the body can bob above planted feet) ---------
  const hips: Group[] = [];
  const feet: Group[] = [];
  for (const s of [-1, 1] as const) {
    const hip = new Group();
    hip.position.set(s * 0.0165, 0.085, -0.004);
    root.add(hip);

    const tarsus = new Mesh(new CylinderGeometry(0.0024, 0.0022, 0.08, 8), matLeg);
    tarsus.position.y = -0.04;
    hip.add(tarsus);

    const foot = new Group();
    foot.position.y = -0.08;
    hip.add(foot);
    for (const toe of [-0.45, 0, 0.45]) {
      const toeGeo = new ConeGeometry(0.0018, 0.017, 6);
      toeGeo.rotateX(Math.PI / 2);
      const toeMesh = new Mesh(toeGeo, matLeg);
      toeMesh.position.set(Math.sin(toe) * 0.008, 0.0015, Math.cos(toe) * 0.009);
      toeMesh.rotation.y = toe;
      foot.add(toeMesh);
    }
    hips.push(hip);
    feet.push(foot);
  }

  root.add(contactShadow(lut));

  return {
    root,
    bodyG,
    neckG,
    headG,
    tailG,
    hips: [hips[0], hips[1]],
    feet: [feet[0], feet[1]],
  };
}

export { BODY_Y };
