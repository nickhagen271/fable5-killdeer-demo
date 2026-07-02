import { REVISION } from "three/webgpu";
import type { AdapterReport, ComputeTestState } from "../core/hooks";

export interface HudStats {
  readonly fps: number;
  readonly frameMs: number;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly frame: number;
}

export interface HudInfo {
  readonly seed: number;
  readonly backend: string;
  readonly adapter: AdapterReport;
  readonly computeTest: ComputeTestState;
  readonly shot: string;
}

/**
 * Debug HUD overlay. Toggled with `h`. Hidden in harness mode so shots stay
 * clean unless explicitly requested with `?hud=1`.
 */
export class Hud {
  private readonly el: HTMLDivElement;
  private info: HudInfo;
  private lastUpdate = 0;

  constructor(parent: HTMLElement, info: HudInfo, visible: boolean) {
    this.info = info;
    this.el = document.createElement("div");
    this.el.id = "pkd-hud";
    this.el.style.cssText = [
      "position:fixed",
      "top:12px",
      "left:12px",
      "z-index:20",
      "padding:10px 14px",
      "background:rgba(10, 16, 13, 0.72)",
      "color:#cfe0d6",
      "font:11px/1.65 ui-monospace, 'SF Mono', Menlo, monospace",
      "letter-spacing:0.04em",
      "border:1px solid rgba(120, 160, 140, 0.25)",
      "border-radius:4px",
      "pointer-events:none",
      "white-space:pre",
    ].join(";");
    this.el.style.display = visible ? "block" : "none";
    parent.appendChild(this.el);

    window.addEventListener("keydown", (ev) => {
      if (ev.key === "h" || ev.key === "H") this.toggle();
    });
  }

  toggle(): void {
    this.el.style.display = this.el.style.display === "none" ? "block" : "none";
  }

  setInfo(info: Partial<HudInfo>): void {
    this.info = { ...this.info, ...info };
  }

  update(stats: HudStats, now: number): void {
    if (this.el.style.display === "none") return;
    if (now - this.lastUpdate < 250) return;
    this.lastUpdate = now;

    const a = this.info.adapter;
    this.el.textContent = [
      `PKD phase 0 · three r${REVISION}`,
      `backend  ${this.info.backend}`,
      `adapter  ${a.vendor || "?"} / ${a.architecture || "?"} ${a.device || ""}`.trimEnd(),
      `fps      ${stats.fps.toFixed(0)}  (${stats.frameMs.toFixed(2)} ms)  frame ${stats.frame}`,
      `size     ${stats.width}x${stats.height} @${stats.pixelRatio.toFixed(2)}x`,
      `seed     ${this.info.seed}`,
      `shot     ${this.info.shot}`,
      `compute  ${this.info.computeTest}`,
      `keys     h hud · 1-4 shots · drag orbit`,
    ].join("\n");
  }
}
