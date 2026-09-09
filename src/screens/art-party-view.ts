import type { AcquisitionController } from "../acquisition/acquisition-controller.js";
import type { Flags } from "../app/flags.js";
import type { Route } from "../app/router.js";
import { mountAcquisitionBar } from "../ui/acquisition-bar.js";
import { button, el } from "../ui/components/dom.js";
import { createFrameScheduler, type FrameScheduler } from "../ui/raf.js";
import { ArtEngine } from "../art/art-engine.js";
import { EFFECT_FACTORIES } from "../art/effects/index.js";
import type { ArtDimensions } from "../art/art-types.js";

export interface ArtPartyViewDeps {
  readonly controller: AcquisitionController;
  readonly navigate: (route: Route) => void;
  readonly flags: Flags;
  /** injected for tests to supply a scriptable engine. */
  readonly engineOverride?: ArtEngine;
  /** injected for tests — real RAF-driven by default. */
  readonly scheduler?: FrameScheduler;
  /** injected for tests, since jsdom's canvas has no working 2D context. `undefined` (the default) reads the real canvas. */
  readonly ctxOverride?: CanvasRenderingContext2D | null;
}

const FADE_DELAY_MS = 3000;
const EFFECT_LABEL_MS = 1500;
const MAX_DPR = 2;

function readReducedMotion(win: Pick<Window, "matchMedia"> = window): boolean {
  try {
    return typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function mountArtPartyView(host: HTMLElement, deps: ArtPartyViewDeps): () => void {
  const engine = deps.engineOverride ?? new ArtEngine({ effects: EFFECT_FACTORIES });
  const scheduler = deps.scheduler ?? createFrameScheduler();

  const canvas = el("canvas", { className: "art-party__canvas" });
  const acqBarHost = el("span", { className: "art-party__status-host" });
  const effectLabel = el("div", { className: "art-party__effect-label", hidden: true });

  const changeEffectBtn = button({ label: "Change Effect", onClick: onChangeEffect });
  const exitBtn = button({ label: "Exit", onClick: () => deps.navigate("home") });

  const overlay = el(
    "div",
    { className: "art-party__overlay" },
    el("div", { className: "art-party__top" }, acqBarHost),
    effectLabel,
    el("div", { className: "art-party__bottom" }, changeEffectBtn, exitBtn),
  );

  const root = el("div", { className: "art-party" }, canvas, overlay);
  host.replaceChildren(root);

  // ── acquisition status/actions — the same widget the classroom header uses ──
  const teardownAcqBar = mountAcquisitionBar(acqBarHost, { controller: deps.controller, flags: deps.flags });

  // ── canvas sizing ────────────────────────────────────────────────────────
  const ctx = deps.ctxOverride !== undefined ? deps.ctxOverride : canvas.getContext("2d");
  let dims: ArtDimensions = { width: 0, height: 0, dpr: 1 };

  function resize(): void {
    const rect = root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    dims = { width, height, dpr };
  }
  resize();

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(root);
  }
  const onWindowResize = (): void => resize();
  window.addEventListener("resize", onWindowResize);

  // ── reduced motion ───────────────────────────────────────────────────────
  let reducedMotion = readReducedMotion();
  const motionQuery =
    typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const onMotionChange = (): void => {
    reducedMotion = readReducedMotion();
  };
  motionQuery?.addEventListener?.("change", onMotionChange);

  // ── render loop ──────────────────────────────────────────────────────────
  let lastNowSeconds: number | null = null;
  const loop = (): void => {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const dt = lastNowSeconds === null ? 0 : now - lastNowSeconds;
    lastNowSeconds = now;
    engine.tick(dt);
    if (ctx) engine.render(ctx, dims, reducedMotion);
    scheduler.schedule(loop);
  };
  scheduler.schedule(loop);

  const unsubSample = deps.controller.subscribeSample((s) => engine.onSample(s));

  // ── change effect ────────────────────────────────────────────────────────
  let effectLabelTimer: ReturnType<typeof setTimeout> | null = null;
  function onChangeEffect(): void {
    engine.changeEffect();
    effectLabel.textContent = engine.activeEffectName.toUpperCase();
    effectLabel.hidden = false;
    if (effectLabelTimer !== null) clearTimeout(effectLabelTimer);
    effectLabelTimer = setTimeout(() => {
      effectLabel.hidden = true;
      effectLabelTimer = null;
    }, EFFECT_LABEL_MS);
  }

  // ── control auto-fade (opacity/pointer-events only — never removed from the DOM) ──
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  function setOverlayVisible(visible: boolean): void {
    overlay.classList.toggle("art-party__overlay--faded", !visible);
  }
  function scheduleFade(): void {
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      if (deps.controller.uiState.state === "MEASURING" && !overlay.contains(document.activeElement)) {
        setOverlayVisible(false);
      }
    }, FADE_DELAY_MS);
  }
  function wake(): void {
    setOverlayVisible(true);
    scheduleFade();
  }
  wake();

  const unsubUi = deps.controller.subscribeUiState(() => wake());
  const onPointerMove = (): void => wake();
  const onPointerDown = (): void => wake();
  const onTouchStart = (): void => wake();
  const onFocusIn = (): void => wake();
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") wake();
  };
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("touchstart", onTouchStart, { passive: true });
  overlay.addEventListener("focusin", onFocusIn);
  document.addEventListener("keydown", onKeyDown);

  return () => {
    scheduler.cancel();
    unsubSample();
    unsubUi();
    teardownAcqBar();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", onWindowResize);
    motionQuery?.removeEventListener?.("change", onMotionChange);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("touchstart", onTouchStart);
    overlay.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("keydown", onKeyDown);
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    if (effectLabelTimer !== null) clearTimeout(effectLabelTimer);
    engine.destroy();
    host.replaceChildren();
  };
}
