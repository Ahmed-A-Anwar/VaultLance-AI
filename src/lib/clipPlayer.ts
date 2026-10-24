/* clipPlayer.ts — image-sequence player drawn onto its own canvas layered over
   the hero canvas. Frames come from a folder of ezgif-frame-NNN.webp exports;
   the count is discovered from the folder, never hardcoded. */

import gsap from "gsap";

export interface ClipRect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export interface ClipPlayerOptions {
  canvas: HTMLCanvasElement;
  fps: number;
  getRect: () => ClipRect | null;
  onArrive?: (frame: number) => void;
  onHidden?: () => void;
}

export interface ClipPlayer {
  load: (urls: string[]) => Promise<boolean>;
  playTo: (frame: number) => void;
  reverseTo: (frame: number) => void;
  stop: () => void;
  dispose: () => void;
  ready: () => boolean;
  index: () => number;
  last: () => number;
}

const frameName = (i: number) => `ezgif-frame-${String(i).padStart(3, "0")}.webp`;
const LOAD_BUDGET = 4000;
const BATCH = 10;
const FADE = 0.236;

const probe = async (url: string) => {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
};

/* exponential then binary probe: a handful of requests, exact count. */
export async function discoverFrames(dir: string): Promise<string[]> {
  const url = (i: number) => `${dir}/${frameName(i)}`;
  if (!(await probe(url(1)))) return [];
  let lo = 1;
  let hi = 2;
  while (hi <= 512 && (await probe(url(hi)))) {
    lo = hi;
    hi *= 2;
  }
  let missing: number | null = hi <= 512 ? hi : null;
  while (missing !== null && missing - lo > 1) {
    const mid = Math.floor((lo + missing) / 2);
    if (await probe(url(mid))) lo = mid;
    else missing = mid;
  }
  const out: string[] = [];
  for (let i = 1; i <= lo; i++) out.push(url(i));
  return out;
}

export function createClipPlayer({ canvas, fps, getRect, onArrive, onHidden }: ClipPlayerOptions): ClipPlayer {
  const ctx = canvas.getContext("2d");
  const frameDur = 1000 / fps;

  let images: HTMLImageElement[] = [];
  let loading: Promise<boolean> | null = null;
  let loaded = false;
  let warned = false;
  let disposed = false;

  let current = 0;
  let target = 0;
  let dir = 0;
  let acc = 0;
  let lastT = 0;
  let raf = 0;
  let drawn = -1;
  let visible = false;

  canvas.style.opacity = "0";
  canvas.style.pointerEvents = "none";

  const warnOnce = () => {
    if (warned) return;
    warned = true;
    console.warn("[fx] wheel clip unavailable — falling back to v1 wheel");
  };

  const draw = () => {
    const rect = getRect();
    if (!ctx || !rect) return;
    const idx = Math.round(current);
    const img = images[idx];
    if (!img || !img.complete) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, rect.dx, rect.dy, rect.dw, rect.dh);
    drawn = idx;
  };

  const clear = () => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawn = -1;
  };

  const fade = (to: number, done?: () => void) => {
    gsap.to(canvas, { opacity: to, duration: FADE, ease: "none", overwrite: true, onComplete: done });
  };

  const stopLoop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
    acc = 0;
  };

  const hide = () => {
    if (!visible) return;
    visible = false;
    fade(0, () => {
      if (visible) return;
      clear();
      onHidden?.();
    });
  };

  const arrive = () => {
    const wasReversing = dir < 0;
    dir = 0;
    stopLoop();
    draw();
    onArrive?.(current);
    if (wasReversing && target <= 0) hide();
  };

  const tick = (t: number) => {
    raf = 0;
    if (disposed || dir === 0) return;
    if (!lastT) lastT = t;
    acc += Math.min(100, t - lastT);
    lastT = t;
    while (dir !== 0 && acc >= frameDur) {
      acc -= frameDur;
      const next = current + dir;
      if ((dir > 0 && next >= target) || (dir < 0 && next <= target)) {
        current = target;
        arrive();
        return;
      }
      current = next;
    }
    if (Math.round(current) !== drawn) draw();
    raf = requestAnimationFrame(tick);
  };

  const run = () => {
    if (disposed || raf || dir === 0 || document.hidden) return;
    lastT = 0;
    acc = 0;
    raf = requestAnimationFrame(tick);
  };

  const onVisibility = () => {
    if (document.hidden) stopLoop();
    else if (visible && dir !== 0) run();
  };

  const onResize = () => {
    if (!visible) return;
    drawn = -1;
    draw();
  };

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  ro?.observe(canvas);
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);

  const load = (urls: string[]): Promise<boolean> => {
    if (loaded) return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      const t0 = Date.now();
      const out: HTMLImageElement[] = new Array<HTMLImageElement>(urls.length);
      try {
        if (!urls.length) throw new Error("no frames");
        for (let i = 0; i < urls.length; i += BATCH) {
          if (Date.now() - t0 > LOAD_BUDGET) throw new Error("load budget exceeded");
          await Promise.all(
            urls.slice(i, i + BATCH).map(async (u, k) => {
              const img = new Image();
              img.decoding = "async";
              img.src = u;
              if (typeof img.decode === "function") await img.decode();
              else
                await new Promise<void>((res, rej) => {
                  img.onload = () => res();
                  img.onerror = () => rej(new Error("frame failed"));
                });
              out[i + k] = img;
            })
          );
        }
        if (Date.now() - t0 > LOAD_BUDGET) throw new Error("load budget exceeded");
        images = out.filter(Boolean);
        loaded = true;
        drawn = -1;
        return true;
      } catch {
        images = [];
        loaded = false;
        warnOnce();
        return false;
      }
    })();
    return loading;
  };

  const playTo = (frame: number) => {
    if (!loaded || disposed || !images.length) return;
    target = Math.max(0, Math.min(images.length - 1, Math.round(frame)));
    const at = Math.round(current);
    dir = target === at ? 0 : target > at ? 1 : -1;
    if (!visible) {
      visible = true;
      fade(1);
    }
    if (dir === 0) {
      if (drawn !== at) draw();
      return;
    }
    stopLoop();
    run();
  };

  const reverseTo = (frame: number) => {
    if (!loaded || disposed || !images.length) return;
    target = Math.max(0, Math.min(images.length - 1, Math.round(frame)));
    const at = Math.round(current);
    if (target >= at) {
      dir = 0;
      stopLoop();
      hide();
      return;
    }
    dir = -1;
    stopLoop();
    run();
  };

  const stop = () => stopLoop();

  const dispose = () => {
    disposed = true;
    stopLoop();
    ro?.disconnect();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    gsap.killTweensOf(canvas);
    images = [];
    loaded = false;
    visible = false;
    clear();
  };

  return {
    load,
    playTo,
    reverseTo,
    stop,
    dispose,
    ready: () => loaded,
    index: () => Math.round(current),
    last: () => Math.max(0, images.length - 1),
  };
}
