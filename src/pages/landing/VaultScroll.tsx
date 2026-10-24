import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

gsap.registerPlugin(ScrollTrigger);
import { PrimaryButton } from "../../components/VaultButtons";
import { StateToken } from "../../components/StateToken";
import { ArrowRight } from "../../components/icons";
import type { MoneyState } from "../../lib/store";

/*
  The staged landing: the vault scroll sequence carries the pitch.
  One pinned canvas scrubs the 20 sealed-vault frames across scroll.

  Copy stages are not discrete sections: each holds a window of the scrub
  and crossfades continuously with its neighbours (duration = scroll share,
  never timers). Stage labels use the app's lifecycle tokens (the verdict
  words the product already shows everywhere) instead of numbered eyebrows.
  Loading state = a bare progress line; a missing frame draws its nearest
  loaded neighbour; the static first frame is the no-JS fallback.
*/

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

const FRAME_COUNT = 20;
const frameUrl = (i: number) =>
  `/vault3/ezgif-frame-${String(i + 1).padStart(3, "0")}.jpg`;

/* Crossfade choreography: share of the scrub each stage holds.
   The hero ramps in before scroll (from < 0); the payoff never fades out. */
const FADE = 0.04;
const WINDOWS: {
  state: MoneyState;
  head: string;
  sub?: string;
  cta?: boolean;
  from: number;
  to: number;
}[] = [
  {
    state: "SEALED",
    head: "Open before the money can move.",
    sub: "An AI escrow agent for digital deliverables. The work seals, the client audits, and a captured payment opens the vault.",
    from: -FADE, to: 0.196,
  },
  {
    state: "HELD",
    head: "The money freezes. It does not move.",
    sub: "A full authorization sits on the client's card while the work stays sealed. Capture is a separate step, and nobody can take it before a verdict.",
    from: 0.18, to: 0.442,
  },
  {
    state: "AUDITING",
    head: "The work is interrogated while it's sealed.",
    sub: "Playwright suites re-run against staging. Manifest hashes recompute. Pixels get checked against the brief. The verdict is neutral, and it lands on the record.",
    from: 0.46, to: 0.622,
  },
  {
    state: "CAPTURED",
    head: "Approve and the vault opens.",
    sub: "The instant the payment captures, every file unlocks for download. Reject instead and the hold voids; nothing is captured.",
    from: 0.68, to: 0.842,
  },
  {
    state: "PAID",
    head: "See the whole handshake for yourself.",
    cta: true,
    from: 0.88, to: 1.04,
  },
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function VaultScrollNarrative({ onCta }: { onCta: () => void }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const [progress, setProgress] = useState(0); // scrubbed continuously by ScrollTrigger
  const glideOff = useRef(false);              // prefers-reduced-motion: no glide, no offset

  const loadedFrames = useRef<HTMLImageElement[]>(new Array(FRAME_COUNT).fill(null));
  const lastIndexRef = useRef(0);

  /* one scrub chain + resize, torn down on strict-mode remount */
  useEffect(() => {
    const canvas = canvasRef.current;
    const pin = pinRef.current;
    const section = sectionRef.current;
    if (!canvas || !pin || !section) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const anim = { frame: 0 };

    const drawImageCover = (img: HTMLImageElement) => {
      const W = pin.clientWidth, H = pin.clientHeight;
      ctx.clearRect(0, 0, W, H);
      const s = Math.max(W / img.width, H / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    };

    const render = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!canvas.width || !canvas.height) return;
        const idx = Math.min(Math.max(Math.round(anim.frame), 0), lastIndexRef.current);
        let img: HTMLImageElement | null = loadedFrames.current[idx];
        if (!img) { // walk outward to the nearest loaded neighbour
          for (let d = 1; d < FRAME_COUNT; d++) {
            img = loadedFrames.current[idx - d] || loadedFrames.current[idx + d] || null;
            if (img) break;
          }
        }
        if (img) drawImageCover(img);
      });
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(pin.clientWidth * dpr);
      canvas.height = Math.round(pin.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    };
    resize();

    // first frame on screen immediately (also under reduced motion / no pin yet)
    const first = loadedFrames.current[0] || loadedFrames.current.find(Boolean);
    if (first) drawImageCover(first);

    const onResize = () => { resize(); ScrollTrigger.refresh(); };
    window.addEventListener("resize", onResize, { passive: true });

    const st = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      pin: pin,
      pinSpacing: true,
      anticipatePin: 1,
      scrub: true,
      invalidateOnRefresh: true,
    });

    gsap.to(anim, {
      frame: FRAME_COUNT - 1,
      ease: "none",
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: (self: any) => {
          render();
          setProgress(self.progress);
        },
      },
    });

    return () => {
      st.kill();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /* preload all frames before arming the scrub */
  useEffect(() => {
    const loader = loaderRef.current;
    const canvas = canvasRef.current;
    let alive = true;
    let done = 0;

    void Promise.allSettled(
      Array.from({ length: FRAME_COUNT }, (_, i) =>
        loadImage(frameUrl(i)).then((img) => {
          if (!alive || !img) return;
          loadedFrames.current[i] = img;
          if (i + 1 > lastIndexRef.current) lastIndexRef.current = i + 1;
          done += 1;
          loader?.style.setProperty("--p", `${Math.round((done / FRAME_COUNT) * 100)}%`);
        })
      )
    ).then(() => {
      if (!alive || !canvas) return;
      const okCount = loadedFrames.current.filter(Boolean).length;
      if (okCount) {
        canvas.classList.add("is-ready");
        ScrollTrigger.refresh();
      } else {
        console.warn("[vault-scroll] No frames loaded — serving static fallback image.");
      }
      loader?.classList.add("is-done");
    });

    return () => { alive = false; };
  }, []);

  /* respect reduced motion for the glide, live */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { glideOff.current = mq.matches; };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* crossfade state per stage — a pure function of scrub progress */
  const visible = WINDOWS.map((w) => {
    const inRamp = clamp01((progress - w.from) / FADE);
    const outRamp = clamp01((progress - (w.to - FADE)) / FADE);
    const opacity = Math.min(inRamp, 1 - outRamp);
    const glide = glideOff.current ? 0 : (1 - inRamp) * 14 - outRamp * 10; // rises with the scroll
    return { opacity, glide, on: opacity >= 0.5 };
  });

  return (
    <section className="vs" ref={sectionRef} aria-label="VaultPay escrow, staged over the vault" data-testid="vault-scroll">
      <div className="vs-pin" ref={pinRef}>
        <img className="vs-fallback" src={frameUrl(0)} alt="" decoding="async" aria-hidden="true" />
        <canvas ref={canvasRef} aria-hidden="true" />
        <div className="vs-scrim" aria-hidden="true" />
        <div className="vs-loader" ref={loaderRef} style={{ "--p": "0%" } as React.CSSProperties} aria-hidden="true" />

        <div className="vs-copy">
          {WINDOWS.map((w, i) => {
            const st = visible[i];
            return (
              <div className={`vs-stage${w.cta ? " vs-final" : ""}`} key={w.head}
                   data-on={st.on ? "1" : "0"}
                   style={{ opacity: st.opacity, visibility: st.opacity > 0.025 ? "visible" : "hidden",
                            transform: `translateY(${st.glide.toFixed(2)}px)` }}>
                <div className="vs-inner">
                  <StateToken state={w.state} />
                  {i === 0
                    ? <h1 className="vs-head">{w.head}</h1>
                    : <h2 className="vs-head">{w.head}</h2>}
                  {w.sub && <p className="small vs-sub">{w.sub}</p>}
                  {w.cta && (
                    <div className="vs-cta">
                      <PrimaryButton testid="cta-payoff" onClick={onCta}>
                        Put it to Test <ArrowRight />
                      </PrimaryButton>
                      <p className="ticker-note">60 seconds. No signup. Sandbox means no money moves.</p>
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
