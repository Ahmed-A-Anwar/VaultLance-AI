/* Boot.tsx — the entry gate. The landing page is handed over only once the vault
   has painted and both CTA clips have every frame the intro will draw decoded, so
   the demo and the first hover run on banked frames instead of streaming in front
   of the visitor. Shown once per tab session, and never with reduced motion.

   The gate is a vault dial rather than a bar, because a wait you can play with is
   read as shorter than a wait you can only watch: the needle follows the pointer
   while it is held, and the ring reports the frames actually banked. The number
   in the hub is the only honest figure on screen; the ring is eased so it speeds
   up toward the end instead of crawling there.

   Release order: onEnter() first, which starts the hero entrance under a still
   opaque curtain, then two frames later the curtain lifts. Anything else flashes
   the finished hero for a frame before the entrance resets it. */

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { VaultClipsHandle } from "../lib/vaultScene";

export interface BootProps {
  /* the vault frame has painted */
  ready: boolean;
  /* the hero's clip players, registered from HeroButtons */
  clips: RefObject<VaultClipsHandle | null>;
  /* the gate is open: the hero may start its entrance */
  onEnter: () => void;
  /* the curtain has finished fading and may be removed */
  onGone: () => void;
}

/* a loader that blinks away reads as a flash, not as work being done */
const MIN_MS = 900;
/* a clip that never finishes must not strand the page on a curtain */
const MAX_MS = 25_000;
/* Nielsen: a wait over ten seconds needs a way out of it */
const SKIP_AFTER = 6000;
const FADE = 0.618;
const POLL = 90;

/* the ring: r = 54 in a 120 viewBox */
const RING = 339.292;
/* the needle sweeps a gauge, not a full circle: -120deg to +120deg */
const SWEEP = 240;
const START = -120;

/* the product's own claims, turned over while the frames bank: a wait that says
   something about the thing being loaded beats a generic spinner caption */
const LINES = ["FUNDS HELD, NOT SPENT", "REAL CHECKS, NOT CLAIMS", "FILES UNLOCK ON CAPTURE"];
const LINE_MS = 2618;

export function Boot({ ready, clips, onEnter, onGone }: BootProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const needleRef = useRef<HTMLDivElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);

  const [pct, setPct] = useState(0);
  const [counts, setCounts] = useState<{ banked: number; total: number } | null>(null);
  const [line, setLine] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [announce, setAnnounce] = useState("Loading the vault");

  /* read through a ref so a re-render never restarts the wait mid-flight */
  const live = useRef({ ready, clips, onEnter, onGone });
  live.current = { ready, clips, onEnter, onGone };
  /* the release path is reachable from the skip button as well as the poll */
  const releaseRef = useRef<(why: string) => void>(() => {});
  const releasedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let fonts = false;
    let quarter = -1;
    const t0 = performance.now();

    /* the curtain index.html put up before the bundle arrived; this one has the
       real numbers, so the static copy is only in the way now */
    document.getElementById("boot-static")?.remove();
    document.documentElement.removeAttribute("data-boot");

    /* the headline is set in the self-hosted display face: releasing before it
       lands swaps the font mid-entrance */
    document.fonts?.ready.then(() => {
      fonts = true;
    }).catch(() => {
      fonts = true;
    });

    const release = (why: string) => {
      if (releasedRef.current) return;
      releasedRef.current = true;
      console.info(`[boot] entering — ${why}`);
      setPct(1);
      setSealed(true);
      setAnnounce("The vault is open");
      live.current.onEnter();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!alive) return;
          /* a CSS transition plus a timer rather than a tween: the curtain has to
             come down while the thread is busy decoding the very frames it was
             waiting for, and a rAF-driven tween can be starved for long enough
             that the gate appears stuck after it has already opened */
          rootRef.current?.classList.add("is-lifting");
          window.setTimeout(() => {
            if (alive) live.current.onGone();
          }, FADE * 1000 + 80);
        })
      );
    };
    releaseRef.current = release;

    const id = window.setInterval(() => {
      const c = live.current.clips.current;
      const raw = c ? Math.max(0, Math.min(1, c.progress())) : 0;
      /* eased so the last third moves fastest; held short of 1 until release */
      const shown = Math.min(0.995, 0.04 + 0.96 * Math.pow(raw, 1.3));
      if (!releasedRef.current) setPct((prev) => (prev > shown ? prev : shown));
      if (c) {
        const n = c.counts();
        setCounts((prev) => (prev && prev.banked === n.banked && prev.total === n.total ? prev : n));
      }

      const q = Math.floor(shown * 4);
      if (q !== quarter) {
        quarter = q;
        setAnnounce(`Loading the vault, ${Math.round(shown * 100)} percent`);
      }

      const waited = performance.now() - t0;
      if (waited > SKIP_AFTER) setCanSkip(true);
      if (waited < MIN_MS) return;
      if (live.current.ready && fonts && c && c.ready()) release("frames banked");
      else if (waited > MAX_MS) release("timed out waiting for the clips");
    }, POLL);

    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  /* the dial turns over the claims while it waits */
  useEffect(() => {
    if (sealed) return;
    const id = window.setInterval(() => setLine((n) => (n + 1) % LINES.length), LINE_MS);
    return () => window.clearInterval(id);
  }, [sealed]);

  /* ---- the dial: hold it and the needle follows the pointer, let go and it
     springs back to the frame count. Nothing here gates the page. ---- */
  const drag = useRef({ active: false, base: 0, grab: 0, angle: START });
  /* the needle's free angle, in a ref so a pointer move never waits on a render */
  const freeAngle = useRef(START);

  const angleAt = (e: React.PointerEvent) => {
    const el = dialRef.current;
    if (!el) return START;
    const r = el.getBoundingClientRect();
    const deg = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
    return deg + 90;
  };

  /* both the class and the transform are written straight to the node: the class
     has to be on before the next move is painted, and the transform is a value a
     render would diff against a number the drag already overwrote */
  const onDown = (e: React.PointerEvent) => {
    const el = dialRef.current;
    if (sealed || !el) return;
    el.setPointerCapture(e.pointerId);
    drag.current = { active: true, base: drag.current.angle, grab: angleAt(e), angle: drag.current.angle };
    el.classList.add("is-dragging");
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const d = angleAt(e) - drag.current.grab;
    /* no limit: a dial you can spin past its marks is the point */
    drag.current.angle = drag.current.base + d;
    if (needleRef.current) needleRef.current.style.transform = `rotate(${drag.current.angle}deg)`;
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const el = dialRef.current;
    el?.classList.remove("is-dragging");
    el?.releasePointerCapture(e.pointerId);
    /* hand the needle back to the frame count; the CSS transition carries it */
    const deg = START + SWEEP * freeAngle.current;
    drag.current.angle = deg;
    if (needleRef.current) needleRef.current.style.transform = `rotate(${deg}deg)`;
  };

  /* while the dial is free, the needle is the frame count */
  useEffect(() => {
    freeAngle.current = pct;
    if (drag.current.active) return;
    const deg = START + SWEEP * pct;
    drag.current.angle = deg;
    if (needleRef.current) needleRef.current.style.transform = `rotate(${deg}deg)`;
  }, [pct]);

  const pctShown = Math.round(pct * 100);

  return (
    <div className="boot" ref={rootRef} data-testid="boot">
      <div className="boot-inner">
        <p className="boot-word" aria-hidden="true">VAULTLANCE AI</p>

        <div
          className="boot-dial"
          ref={dialRef}
          aria-hidden="true"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <svg className="boot-ring" viewBox="0 0 120 120">
            <circle className="boot-ring-track" cx="60" cy="60" r="54" />
            <circle
              className="boot-ring-arc"
              cx="60"
              cy="60"
              r="54"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - pct)}
            />
            <g className="boot-ticks">
              {Array.from({ length: 12 }, (_, i) => (
                <line
                  key={i}
                  x1="60"
                  y1="10"
                  x2="60"
                  y2={i % 3 === 0 ? 17 : 14}
                  transform={`rotate(${START + (SWEEP / 11) * i} 60 60)`}
                />
              ))}
            </g>
          </svg>
          <div className="boot-needle" ref={needleRef} />
          <div className="boot-hub">
            <span className="boot-hub-num">{sealed ? "OPEN" : pctShown}</span>
            {!sealed && <span className="boot-hub-unit">%</span>}
          </div>
        </div>

        <p className="boot-count" aria-hidden="true">
          <span>{sealed ? "SEALED" : "BANKING FRAMES"}</span>
          <span className="boot-count-num">
            {counts && counts.total > 0 ? `${counts.banked} / ${counts.total}` : "—"}
          </span>
        </p>

        <p className="boot-line" key={line} aria-hidden="true">
          {LINES[line]}
        </p>

        {canSkip && !sealed && (
          <button className="boot-skip" type="button" onClick={() => releaseRef.current("skipped by the visitor")}>
            Enter anyway
          </button>
        )}

        <span className="sr-only" role="status" aria-live="polite">{announce}</span>
      </div>
    </div>
  );
}

export default Boot;
