/**
 * Boot progress and fail-loud diagnostics. There is no fallback path in this
 * project: when WebGPU is unavailable or broken we stop and print everything
 * we know, in the page and on the console.
 */

export function bootMsg(msg: string, fraction: number): void {
  const el = document.getElementById("boot-msg");
  if (el) el.textContent = msg;
  const bar = document.getElementById("boot-bar");
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
}

export function bootDone(): void {
  const boot = document.getElementById("boot");
  if (boot) {
    boot.style.opacity = "0";
    window.setTimeout(() => boot.remove(), 600);
  }
}

/**
 * Replace the page with a diagnostic report and throw. Never returns.
 */
export function failLoud(title: string, details: readonly string[]): never {
  const report = [`PKD BOOT FAILURE — ${title}`, ...details].join("\n");

  if (window.__PKD) window.__PKD.failed = report;

  const boot = document.getElementById("boot");
  if (boot) boot.remove();

  const overlay = document.createElement("div");
  overlay.id = "pkd-failure";
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:100",
    "background:#160b0b",
    "color:#e8b4a8",
    "font:13px/1.7 ui-monospace, 'SF Mono', Menlo, monospace",
    "padding:48px",
    "overflow:auto",
    "white-space:pre-wrap",
  ].join(";");

  const heading = document.createElement("div");
  heading.textContent = `✕ ${title}`;
  heading.style.cssText = "font-size:18px;color:#ff8a70;margin-bottom:20px;letter-spacing:0.06em";
  overlay.appendChild(heading);

  const body = document.createElement("div");
  body.textContent = details.join("\n");
  overlay.appendChild(body);

  const foot = document.createElement("div");
  foot.textContent =
    "\nThis build targets WebGPU only. There is no WebGL fallback by design.";
  foot.style.cssText = "margin-top:24px;color:#9a7a72";
  overlay.appendChild(foot);

  document.body.appendChild(overlay);

  console.error(report);
  throw new Error(report);
}

/** Environment facts worth printing with any GPU failure. */
export function environmentDetails(): string[] {
  return [
    `userAgent: ${navigator.userAgent}`,
    `secureContext: ${String(window.isSecureContext)}`,
    `devicePixelRatio: ${window.devicePixelRatio}`,
    `viewport: ${window.innerWidth}x${window.innerHeight}`,
  ];
}
