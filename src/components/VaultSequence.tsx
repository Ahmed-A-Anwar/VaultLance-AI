// VaultSequence.tsx — scroll-scrubbed vault frame sequence.
// Canvas sequences a 120-frame WebP strip (closed vault -> exploded view)
// pinned under a GSAP ScrollTrigger. Lenis smooths the scroll; a progress
// ring holds scroll until all frames decode. Text overlays are six scrubbed
// caption scenes. Reduced motion falls back to two static frames + stacked
// captions.
import { useRef, useEffect, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { StateToken } from "./StateToken";
import { ArrowRight } from "./icons";
import { PrimaryButton } from "./VaultButtons";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

const FRAME_COUNT = 120;

/** Frame source — first frame is public/vault-frames/f_001.webp, last is f_120.webp.
 *  First frame measured at 1920×1080 WebP (aspect 1.7778) via sharp.
 *  The small 960px set lives at /public/vault-frames-sm/ and exists (120 files).
 */
const FRAME_SRC = (i: number, sm: boolean) =>
  `${
    sm ? "/vault-frames-sm" : "/vault-frames"
  }/f_${String(i + 1).padStart(3, "0")}.webp`;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const SCENES: Array<{
  from: number;
  to: number;
  head: string;
  sub: string;
  cta?: boolean;
}> = [
  { from: 0,  to: 20,  head: "The vault is sealed.", sub: "Twenty sealed frames load before the scroll ever moves. No motion until the assets are ready." },
  { from: 20, to: 45,  head: "Pressure builds inside.", sub: "The mechanism turns while the vault stays shut. Every frame is a frame of the same locked state." },
  { from: 45, to: 70,  head: "The lock interrogates.", sub: "The work is checked while it is still sealed. No output before a verdict." },
  { from: 70, to: 90,  head: "The mechanism opens.", sub: "On a clear verdict, the vault breaks apart. The files emerge in the open." },
  { from: 90, to: 105, head: "Capture releases the payment.", sub: "Only a captured payment unlocks the work. A rejected verdict voids the hold — nothing moves." },
  { from: 105, to: 119, head: "Walk the whole handshake.", sub: "See the full escrow life in one continuous scroll, then put it to the test in the sandbox.", cta: true },
];

type SceneDef = (typeof SCENES)[number];

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function fitContain(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number
): { dx: number; dy: number; dw: number; dh: number } {
  const s = Math.max(boxW / imgW, boxH / imgH);
  const dw = imgW * s;
  const dh = imgH * s;
  return { dx: (boxW - dw) / 2, dy: (boxH - dh) / 2, dw, dh };
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  dpr: number
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { dx, dy, dw, dh } = fitContain(img.width, img.height, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, dw, dh);
}

export function VaultSequence() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>(Array(FRAME_COUNT).fill(null));
  const lenisRef = useRef<Lenis | null>(null);
  const frameRef = useRef({ frame: 0 });
  const lastDrawnRef = useRef(-1);
  const rafRef = useRef<number>(0);
  const readyRef = useRef(false);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const loadedCountRef = useRef(0);

  const isMobile = useRef(
    typeof window !== "undefined" && window.innerWidth < 768
  );
  // small-set presence: resolved once on mount from the dev server
  const smallSetRef = useRef(false);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const pinEnd = useRef("+=350%");

  // resolve responsive config once, on mount, client-side only
  useEffect(() => {
    if (typeof window === "undefined") return;
    isMobile.current = window.innerWidth < 768;
    pinEnd.current = isMobile.current ? "+=250%" : "+=350%";
    // probe the small set directory via fetch; ignore failures (treat as absent)
    fetch("/vault-frames-sm/f_001.webp", { method: "HEAD", cache: "no-store" })
      .then((r) => { smallSetRef.current = r.ok; })
      .catch(() => { smallSetRef.current = false; });
  }, []);

  // preload: first frame immediate, then batches of 10 with Image.decode()
  useEffect(() => {
    const ring = ringRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let alive = true;
    const src = (i: number) => FRAME_SRC(i, smallSetRef.current);
    const onProgress = (done: number) => {
      if (!alive || !ring) return;
      ring.style.setProperty("--p", `${Math.round((done / FRAME_COUNT) * 100)}%`);
    };

    let cancelled = false;

    // first frame first — draw immediately once the canvas has a size
    let started = false;
    const start = () => {
      if (cancelled || started) return;
      started = true;
      (async () => {
        // frame 0
        const firstImg = await loadImage(src(0));
        if (!firstImg || !alive) return;
        imagesRef.current[0] = firstImg;
        loadedCountRef.current = 1;
        onProgress(1);
        if (canvas.width && canvas.height) {
          const { w, h, dpr } = sizeRef.current;
          const ctx = canvas.getContext("2d");
          if (ctx) drawFrame(ctx, firstImg, w, h, dpr);
          lastDrawnRef.current = 0;
        }

        // remaining frames in batches of 10, each decoded upfront via
        // Image.decode() so nothing is decoded during scroll.
        for (let startIdx = 1; startIdx < FRAME_COUNT; startIdx += 10) {
          const end = Math.min(startIdx + 10, FRAME_COUNT);
          const batchResults = await Promise.allSettled(
            Array.from({ length: end - startIdx }).map(async (_, i) => {
              const idx = startIdx + i;
              const img = await loadImage(src(idx));
              if (!img) return null;
              await img.decode();
              return img;
            })
          );
          for (let i = 0; i < batchResults.length; i++) {
            const r = batchResults[i];
            if (r.status === "fulfilled" && r.value) {
              imagesRef.current[startIdx + i] = r.value;
              loadedCountRef.current += 1;
              onProgress(loadedCountRef.current);
            }
          }
        }

        if (!alive) return;
        if (ring) ring.classList.add("is-done");
        if (canvas) canvas.classList.add("is-ready");
        readyRef.current = true;
      })();
    };

    // kick off preload after first paint so the canvas size is known
    const onReady = () => {
      start();
    };
    if (document.readyState === "complete") {
      onReady();
    } else {
      window.addEventListener("load", onReady, { once: true });
    }

    return () => {
      cancelled = true;
      alive = false;
      window.removeEventListener("load", onReady);
    };
  }, []);

  // ScrollTrigger + Lenis + draw loop
  useEffect(() => {
    if (reducedMotion.current) return;
    const canvas = canvasRef.current;
    const pin = pinRef.current;
    const section = sectionRef.current;
    if (!canvas || !pin || !section) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    let cancelled = false;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, pin.clientWidth);
      const h = Math.max(1, pin.clientHeight);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      sizeRef.current = { w, h, dpr };
      // redraw current frame at new size
      const idx = Math.min(Math.max(Math.round(frameRef.current.frame), 0), FRAME_COUNT - 1);
      const img = imagesRef.current[idx] ?? imagesRef.current[lastDrawnRef.current];
      if (img) {
        drawFrame(ctx, img, w, h, dpr);
        lastDrawnRef.current = idx;
      }
      ScrollTrigger.refresh();
    };

    // ResizeObserver with 150ms debounce
    let roTimer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(roTimer);
      roTimer = window.setTimeout(resize, 150);
    });
    ro.observe(pin);

    // Single rAF draw path — redraw only when Math.round(frame) changes.
    let pending = false;
    const render = () => {
      pending = false;
      const idx = Math.round(frameRef.current.frame);
      if (idx !== lastDrawnRef.current && idx >= 0 && idx < FRAME_COUNT) {
        const img = imagesRef.current[idx];
        if (img) {
          const { w, h, dpr } = sizeRef.current;
          if (canvas.width && canvas.height) {
            drawFrame(ctx, img, w, h, dpr);
            lastDrawnRef.current = idx;
          }
        }
      }
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      rafRef.current = requestAnimationFrame(render);
    };

    // Lenis drives its own RAF loop (autoRaf on by default). ScrollTrigger
    // refreshes on Lenis scroll, and the GSAP tween's onUpdate schedules the
    // canvas draw. gsap.ticker.lagSmoothing(0) keeps the tween synced to the
    // real scroll delta rather than an interpolated ticker.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lenis.on("scroll", ScrollTrigger.update as any);

    const tween = gsap.to(frameRef.current, {
      frame: FRAME_COUNT - 1,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: pinEnd.current,
        pin: pin,
        pinSpacing: true,
        anticipatePin: 1,
        scrub: 0.5,
        invalidateOnRefresh: true,
        onUpdate: () => schedule(),
      },
    });

    // draw as soon as the first frame + canvas size are ready
    let waited = false;
    const waitReady = () => {
      if (cancelled) return;
      if (readyRef.current && canvas.width && canvas.height) {
        schedule();
        ScrollTrigger.refresh();
      } else if (!waited) {
        waited = true;
        requestAnimationFrame(waitReady);
      }
    };
    waitReady();

    resize();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      tween.scrollTrigger?.kill();
      tween.kill();
      lenis.destroy();
      lenisRef.current = null;
      ro.disconnect();
      clearTimeout(roTimer);
      ScrollTrigger.getAll().forEach((st) => st.kill());
    };
  }, []);    // caption scene visibility — a second scrub proxy driven by the same end point
  const progress = useRef(0);
  useEffect(() => {
    if (reducedMotion.current || !sectionRef.current) return;
    const proxy = { v: 0 };
    const animation = gsap.to(proxy, {
      v: 1,
      ease: "none",
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top top",
        end: pinEnd.current,
        scrub: 0.5,
        onUpdate: () => {
          progress.current = proxy.v;
        },
      },
    });
    return () => {
      animation.scrollTrigger?.kill();
      animation.kill();
    };
  }, []);

  const sceneOpacity = useCallback(
    (scene: SceneDef) => {
      const p = reducedMotion.current ? 0 : progress.current;
      const inRamp = clamp01((p - scene.from / (FRAME_COUNT - 1)) / 0.05);
      const outRamp = clamp01((p - scene.to / (FRAME_COUNT - 1)) / 0.05);
      return Math.min(inRamp, 1 - outRamp);
    },
    []
  );

  const captionY = useCallback(
    (scene: SceneDef) => {
      const p = reducedMotion.current ? 0 : progress.current;
      const inRamp = clamp01((p - scene.from / (FRAME_COUNT - 1)) / 0.05);
      const outRamp = clamp01((p - scene.to / (FRAME_COUNT - 1)) / 0.05);
      return (1 - inRamp) * 16 - outRamp * 12;
    },
    []
  );

  // reduced-motion fallback — no pin, two static frames with the captions
  // stacked below them.
  if (reducedMotion.current) {
    const sm = smallSetRef.current;
    return (
      <section
        className="vs"
        ref={sectionRef}
        aria-label="VaultPay escrow sequence — reduced-motion fallback"
        data-testid="vault-sequence"
      >
        <div className="vs-fallback-stack">
          <div className="vs-fallback-frames">
            <img
              src={FRAME_SRC(0, sm)}
              alt="Vault closed — frame 1 of the escrow sequence"
              className="vs-frame is-ready"
              decoding="async"
              loading="eager"
            />
            <img
              src={FRAME_SRC(FRAME_COUNT - 1, sm)}
              alt="Vault exploded view — frame 120 of the escrow sequence"
              className="vs-frame is-ready"
              decoding="async"
              loading="eager"
            />
          </div>
          <div className="vs-copy vs-copy-static">
            {SCENES.map((s) => (
              <div key={s.head} className="vs-scene vs-scene-static">
                <div className="vs-scene-inner">
                  <StateToken
                    state={stateTokenForHead(s.head)}
                  />
                  <h2 className="vs-head">{s.head}</h2>
                  <p className="small vs-sub">{s.sub}</p>
                  {s.cta && (
                    <PrimaryButton onClick={() => {}}>
                      Put it to Test <ArrowRight />
                    </PrimaryButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // normal motion — pinned canvas + scrubbed captions
  return (
    <section
      className="vs"
      ref={sectionRef}
      aria-label="VaultPay escrow sequence"
      data-testid="vault-sequence"
    >
      <div className="vs-ring" ref={ringRef} style={{ "--p": "0%" } as React.CSSProperties} aria-hidden="true" />
      <div className="vs-pin" ref={pinRef} style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          className="vs-canvas"
          style={{ willChange: "transform" }}
          role="img"
          aria-label="Scrolling vault frame sequence from the sealed vault to the exploded view, scrubbed by the page scroll"
        />                <div className="vs-copy" aria-live="polite">
          {SCENES.map((s) => {
            const op = sceneOpacity(s);
            const y = captionY(s);
            const visible = op > 0.025;
            return (
              <div
                key={s.head}
                className="vs-scene"
                style={{
                  opacity: op,
                  visibility: visible ? "visible" : "hidden",
                  transform: `translateY(${y.toFixed(2)}px)`,
                }}
              >
                <div className="vs-scene-inner">
                  <StateToken
                    state={stateTokenForHead(s.head)}
                  />
                  <h2 className="vs-head">{s.head}</h2>
                  <p className="small vs-sub">{s.sub}</p>
                  {s.cta && (
                    <div className="vs-cta">
                      <PrimaryButton onClick={() => {}}>
                        Put it to Test <ArrowRight />
                      </PrimaryButton>
                      <p className="ticker-note">
                        60 seconds. No signup. Sandbox means no money moves.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Map caption heads to the app's lifecycle state tokens, matching the existing
// VaultScroll narrative so the sequence reads as the same escrow story.
function stateTokenForHead(head: string): "SEALED" | "HELD" | "AUDITING" | "CAPTURED" | "PAID" {
  if (head.includes("sealed")) return "SEALED";
  if (head.includes("pressure")) return "HELD";
  if (head.includes("interrogates")) return "AUDITING";
  if (head.includes("opens") || head.includes("payment")) return "CAPTURED";
  return "PAID";
}

