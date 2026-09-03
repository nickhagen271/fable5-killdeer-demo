import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { launchBrowser } from "./harness";

/**
 * Reference-delta comparison tool. Composes each captured shot beside its
 * matching /reference painting into a single side-by-side PNG, and writes an
 * index.html gallery, under shots/phase-<N>/compare/.
 *
 *   npm run compare -- --phase 0
 *
 * These side-by-sides are the input to DELTA.md at every phase close.
 */

interface Pair {
  readonly shot: string;
  readonly ref: string;
  readonly note: string;
}

// Which reference painting each shot is judged against. The first three
// rows are the spec's FINAL ACCEPTANCE frames.
const PAIRS: readonly Pair[] = [
  { shot: "hero", ref: "Ref 4.jpg", note: "ACCEPTANCE 1 — bird at rest in a sunset meadow, horizon upper third, foreground dabs" },
  { shot: "meadow_overcast", ref: "Ref 2.jpg", note: "ACCEPTANCE 2 — overcast poppy drift, treeline dissolving behind" },
  { shot: "td_side", ref: "KD3.png", note: "ACCEPTANCE 3 — killdeer turnaround beside the reference" },
  { shot: "td_34", ref: "KD1.png", note: "turnaround three-quarter — bands, face, eye ring" },
  { shot: "td_fan", ref: "KD2.png", note: "tail fanned — the rufous flash" },
  { shot: "sun", ref: "Ref 4.jpg", note: "facing the low sun — glow disc, peach pool, lit hill flanks" },
  { shot: "vista", ref: "Ref 1.jpg", note: "open field vista — value masses, haze, sky share" },
  { shot: "vista_overcast", ref: "Ref 1.jpg", note: "overcast vista — massed cumulus, cool greens" },
  { shot: "ground", ref: "Ref 2.jpg", note: "low meadow read — broken color, flower accents" },
  { shot: "ground_overcast", ref: "Ref 2.jpg", note: "overcast low meadow — poppy and cornflower specks" },
  { shot: "sky", ref: "Ref 1.jpg", note: "sky and cloud handling" },
  { shot: "detail", ref: "Ref 4.jpg", note: "close ground passage — stroke and paint body" },
  { shot: "macro", ref: "Ref 4.jpg", note: "impasto relief at grazing view — paint body and sheen" },
  { shot: "meadow", ref: "Ref 2.jpg", note: "bird-height meadow — grass tufts, flower drifts" },
  { shot: "treeline", ref: "Ref 1.jpg", note: "streamed groves dissolving into the haze" },
  { shot: "bird_idle", ref: "KD3.png", note: "killdeer identity at rest — bands, face, posture" },
  { shot: "bird_run", ref: "KD1.png", note: "killdeer running — nose-down gait, steady head" },
  { shot: "bird_alert", ref: "KD2.png", note: "alert stance vs reference paint language" },
  { shot: "bird_peck", ref: "KD1.png", note: "peck — forward tilt, bill to ground" },
  { shot: "monet", ref: "Ref 1.jpg", note: "wide composition — field, horizon band, sky share" },
];

function parsePhase(argv: readonly string[]): number {
  const i = argv.indexOf("--phase");
  return i >= 0 && i + 1 < argv.length ? Number(argv[i + 1]) : 0;
}

function dataUri(path: string): string {
  const mime = extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

function pairHtml(shotUri: string, refUri: string, title: string, note: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; background: #17181a; color: #b9beb4; font: 13px/1.5 ui-monospace, Menlo, monospace; }
    .row { display: flex; gap: 6px; padding: 6px; align-items: flex-start; }
    .cell { display: flex; flex-direction: column; gap: 4px; }
    img { height: 560px; display: block; }
    .cap { padding: 0 2px 6px; }
    .head { padding: 10px 8px 4px; color: #dde2d6; }
  </style></head><body>
    <div class="head">${title} — ${note}</div>
    <div class="row">
      <div class="cell"><img src="${shotUri}"><div class="cap">ours</div></div>
      <div class="cell"><img src="${refUri}"><div class="cap">reference</div></div>
    </div>
  </body></html>`;
}

async function main(): Promise<void> {
  const phase = parsePhase(process.argv.slice(2));
  const shotsDir = join(process.cwd(), "shots", `phase-${phase}`);
  const refDir = join(process.cwd(), "reference");
  const outDir = join(shotsDir, "compare");
  mkdirSync(outDir, { recursive: true });

  const available = PAIRS.filter(
    (p) => existsSync(join(shotsDir, `${p.shot}.png`)) && existsSync(join(refDir, p.ref)),
  );
  if (available.length === 0) {
    throw new Error(`no shot/reference pairs found under ${shotsDir} — run \`npm run shots\` first`);
  }

  const browser = await launchBrowser();
  const written: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 2400, height: 700 }, deviceScaleFactor: 1 });
    for (const pair of available) {
      const html = pairHtml(
        dataUri(join(shotsDir, `${pair.shot}.png`)),
        dataUri(join(refDir, pair.ref)),
        `phase ${phase} · ${pair.shot} vs ${pair.ref}`,
        pair.note,
      );
      await page.setContent(html, { waitUntil: "load" });
      const file = join(outDir, `${pair.shot}__vs__${pair.ref.replace(/\s+/g, "-")}.png`);
      await page.screenshot({ path: file, fullPage: true });
      written.push(file);
      console.log(`compare: ${file}`);
    }
  } finally {
    await browser.close();
  }

  const items = readdirSync(outDir)
    .filter((f) => f.endsWith(".png"))
    .map((f) => `<div class="item"><div class="cap">${f}</div><img src="${f}"></div>`)
    .join("\n");
  const index = `<!doctype html><html><head><meta charset="utf-8"><title>phase ${phase} comparisons</title><style>
    body { margin: 0; padding: 16px; background: #17181a; color: #dde2d6; font: 14px/1.6 ui-monospace, Menlo, monospace; }
    img { max-width: 100%; display: block; margin-bottom: 24px; }
    .cap { margin: 8px 0; }
  </style></head><body><h2>phase ${phase} — reference comparisons</h2>\n${items}\n</body></html>`;
  writeFileSync(join(outDir, "index.html"), index);
  console.log(`gallery: ${join(outDir, "index.html")} (${written.length} pairs)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
