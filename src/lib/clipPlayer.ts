/* clipPlayer.ts — image-sequence player drawn onto its own canvas layered over
   the hero canvas. Frames come from a folder of ezgif-frame-NNN.webp exports;
   the count is discovered from the folder, never hardcoded.

   Frames are fetched and decoded in a worker (see clipWorker.ts) and decoded only
   around the playhead. A 1920x1080 frame is about 8MB of pixels once decoded, so
   holding a whole clip ready costs ~650MB and has to finish before the first
   hover can be drawn — which is what made the entry gate wait, and what starved
   the animation loop while it waited. Keeping the compressed bytes (a few MB for
   the set) and decoding a window of them gives the same exact frames with a
   fraction of the memory, and the gate waits on the download instead of on 130
   decodes. */

import gsap from "gsap";
import type { Reply } from "./clipWorker";

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
  /* console line used when the frames cannot be loaded */
  warning?: string;
  onArrive?: (frame: number) => void;
  onHidden?: () => void;
}

export interface ClipPlayer {
  load: (urls: string[]) => Promise<boolean>;
  playTo: (frame: number) => void;
  reverseTo: (frame: number) => void;
  stop: () => void;
  /* cut to hidden with no fade — used when the other clip takes over */
  hideNow: () => void;
  dispose: () => void;
  ready: () => boolean;
  /* highest frame with a contiguous run of *fetched* frames behind it: the set is
     usable from here, its frames decode as they are needed */
  loadedTo: () => number;
  index: () => number;
  last: () => number;
}

type Frame = ImageBitmap | HTMLImageElement;

const frameName = (i: number) => `ezgif-frame-${String(i).padStart(3, "0")}.webp`;
/* how far around the playhead to ask for frames it does not have yet, in frames */
const AHEAD = 8;
const BEHIND = 3;
const REVERSE_AHEAD = 3;
const REVERSE_BEHIND = 8;
const FADE = 0.236;

/* a dev server answers unknown paths with index.html, so ok alone is not enough */
const probe = async (url: string) => {
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) return false;
    return (res.headers.get("content-type") ?? "").startsWith("image/");
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

const WHEEL_WARNING = "[fx] wheel clip unavailable — Sign up keeps the static vault";

export function createClipPlayer({
  canvas,
  fps,
  getRect,
  warning = WHEEL_WARNING,
  onArrive,
  onHidden,
}: ClipPlayerOptions): ClipPlayer {
  const ctx = canvas.getContext("2d");
  const frameDur = 1000 / fps;

  let total = 0;
  /* which frames have arrived (worker path) and, without a worker, their bytes */
  let got: boolean[] = [];
  let blobs: (Blob | null)[] = [];
  let worker: Worker | null = null;
  let firstSettled: ((ok: boolean) => void) | null = null;
  /* decoded frames around the playhead, and the ones being decoded now */
  let frames = new Map<number, Frame>();
  let asked = new Set<number>();
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
  let drawnIdx = -1;
  let visible = false;

  canvas.style.opacity = "0";
  canvas.style.pointerEvents = "none";
  /* an absolutely positioned canvas keeps its intrinsic 300x150 unless sized */
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.left = "0";
  canvas.style.top = "0";

  const warnOnce = () => {
    if (warned) return;
    warned = true;
    console.warn(warning);
  };

  const closeFrame = (f: Frame) => {
    if (typeof ImageBitmap !== "undefined" && f instanceof ImageBitmap) f.close();
  };

  const accept = (i: number, frame: Frame) => {
    asked.delete(i);
    if (disposed) {
      closeFrame(frame);
      return;
    }
    frames.set(i, frame);
    /* the worker decodes the clip in order, so every arriving frame can be the
       one the playhead is on */
    if (i === Math.round(current) || i === Math.round(target)) draw();
  };

  const draw = () => {
    const rect = getRect();
    if (!ctx || !rect) return;
    const idx = Math.round(current);
    /* hold the last painted frame until this one has decoded */
    const frameIdx = frames.has(idx) ? idx : drawnIdx;
    const frame = frameIdx >= 0 ? frames.get(frameIdx) : undefined;
    if (!frame) {
      if (!frames.has(idx)) decodeAt(idx);
      return;
    }
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
    ctx.drawImage(frame, rect.dx, rect.dy, rect.dw, rect.dh);
    drawnIdx = frameIdx;
    /* which frame is actually painted: the only honest progress signal a test
       (or a person with devtools open) can read off a canvas */
    canvas.dataset.frame = String(frameIdx);
  };

  const decodeAt = (i: number) => {
    if (disposed || i < 0 || i >= total || frames.has(i) || asked.has(i)) return;
    asked.add(i);
    if (worker) {
      worker.postMessage({ type: "decode", index: i });
      return;
    }
    /* no worker: decode here, accepting that it costs the main thread */
    const blob = blobs[i];
    if (!blob) {
      asked.delete(i);
      return;
    }
    createImageBitmap(blob)
      .then((bitmap) => accept(i, bitmap))
      .catch(() => asked.delete(i));
  };

  /* keep just enough decoded in the direction the clip is travelling */
  const warm = (center: number, bias: number) => {
    const ahead = bias < 0 ? REVERSE_AHEAD : AHEAD;
    const behind = bias < 0 ? REVERSE_BEHIND : BEHIND;
    for (let i = center - behind; i <= center + ahead; i++) decodeAt(i);
  };

  const clear = () => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawnIdx = -1;
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
    warm(Math.round(current), 0);
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
    warm(Math.round(current), dir);
    if (frames.has(Math.round(current)) && Math.round(current) !== drawnIdx) draw();
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
    drawnIdx = -1;
    draw();
  };

  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
  ro?.observe(canvas);
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);

  const onWorkerMessage = (e: MessageEvent<Reply>) => {
    const msg = e.data;
    if (msg.type === "fetched") {
      got[msg.index] = true;
      if (msg.index === 0) {
        loaded = msg.ok;
        if (!msg.ok) warnOnce();
        firstSettled?.(msg.ok);
        firstSettled = null;
      }
      return;
    }
    if (msg.type === "frame") {
      accept(msg.index, msg.bitmap);
      return;
    }
    asked.delete(msg.index);
  };

  /* the no-worker path: fetch here, decode here */
  const loadInline = async (list: string[]) => {
    const fetchOne = async (i: number) => {
      try {
        const res = await fetch(list[i], { cache: "force-cache" });
        if (!res.ok) throw new Error(String(res.status));
        blobs[i] = await res.blob();
      } catch {
        blobs[i] = null;
      } finally {
        got[i] = true;
      }
    };
    await fetchOne(0);
    if (!blobs[0]) throw new Error("first frame failed");
    loaded = true;
    decodeAt(0);
    void (async () => {
      for (let i = 1; i < total; i += 8) {
        if (disposed) return;
        const batch: Promise<void>[] = [];
        for (let k = i; k < Math.min(i + 8, total); k++) batch.push(fetchOne(k));
        await Promise.all(batch);
      }
    })();
  };

  const load = (list: string[]): Promise<boolean> => {
    if (loaded) return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      try {
        if (!list.length) throw new Error("no frames");
        total = list.length;
        got = new Array<boolean>(total).fill(false);
        blobs = new Array<Blob | null>(total).fill(null);
        drawnIdx = -1;
        if (typeof Worker !== "undefined") {
          try {
            worker = new Worker(new URL("./clipWorker.ts", import.meta.url), { type: "module" });
            worker.onmessage = onWorkerMessage;
            const first = new Promise<boolean>((res) => {
              firstSettled = res;
              worker!.postMessage({ type: "init", urls: list });
            });
            const ok = await first;
            if (!ok) throw new Error("first frame failed");
            loaded = true;
            decodeAt(0);
            return true;
          } catch {
            worker?.terminate();
            worker = null;
            loaded = false;
          }
        }
        await loadInline(list);
        return true;
      } catch {
        got = [];
        blobs = [];
        total = 0;
        loaded = false;
        warnOnce();
        return false;
      }
    })();
    return loading;
  };

  const playTo = (frame: number) => {
    if (!loaded || disposed || !total) return;
    target = Math.max(0, Math.min(total - 1, Math.round(frame)));
    const at = Math.round(current);
    dir = target === at ? 0 : target > at ? 1 : -1;
    if (!visible) {
      visible = true;
      fade(1);
    }
    if (dir === 0) {
      if (drawnIdx !== at) draw();
      return;
    }
    warm(at, dir);
    stopLoop();
    run();
  };

  const reverseTo = (frame: number) => {
    if (!loaded || disposed || !total) return;
    target = Math.max(0, Math.min(total - 1, Math.round(frame)));
    const at = Math.round(current);
    if (target >= at) {
      dir = 0;
      stopLoop();
      hide();
      return;
    }
    dir = -1;
    warm(at, dir);
    stopLoop();
    run();
  };

  const stop = () => stopLoop();

  const hideNow = () => {
    stopLoop();
    if (!visible) return;
    visible = false;
    dir = 0;
    gsap.killTweensOf(canvas);
    canvas.style.opacity = "0";
    clear();
    onHidden?.();
  };

  const dispose = () => {
    disposed = true;
    stopLoop();
    ro?.disconnect();
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    gsap.killTweensOf(canvas);
    worker?.terminate();
    worker = null;
    for (const f of frames.values()) closeFrame(f);
    frames = new Map();
    asked = new Set();
    blobs = [];
    got = [];
    total = 0;
    loaded = false;
    visible = false;
    clear();
  };

  return {
    load,
    playTo,
    reverseTo,
    stop,
    hideNow,
    dispose,
    ready: () => loaded,
    /* contiguous decoded frames: playback runs on frames that are already
       bitmaps, so this is what the entry gate and the intro wait for */
    loadedTo: () => {
      for (let i = 0; i < total; i++) if (!frames.has(i)) return i - 1;
      return total - 1;
    },
    index: () => Math.round(current),
    last: () => Math.max(0, total - 1),
  };
}
