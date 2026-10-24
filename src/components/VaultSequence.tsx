// VaultSequence.tsx — pinned escrow narrative scrubbed by the scroll.
// The section pins for ~3.6 viewports while six caption scenes cross-fade on
// scroll progress. Reduced motion falls back to two static frames + stacked
// captions. (The frame-sequence canvas was removed; captions are the only
// scrubbed content left.)
import { useRef, useEffect } from "react";
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
 *  Only the reduced-motion fallback still reads frames (two stills).
 *  The small 960px set lives at /public/vault-frames-sm/ and exists (120 files).
 */
const FRAME_SRC = (i: number, sm: boolean) =>
  `${
    sm ? "/vault-frames-sm" : "/vault-frames"
  }/f_${String(i + 1).padStart(3, "0")}.webp`;

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

export function VaultSequence() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const pinRef = useRef<HTMLDivElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const reducedMotion = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const pinEnd = useRef("+=350%");

  // resolve responsive config once, on mount, client-side only
  useEffect(() => {
    if (typeof window === "undefined") return;
    pinEnd.current = window.innerWidth < 768 ? "+=250%" : "+=350%";
  }, []);

  // Lenis + the pin that holds the section while the captions scrub
  useEffect(() => {
    if (reducedMotion.current) return;
    const pin = pinRef.current;
    const section = sectionRef.current;
    if (!pin || !section) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    // Lenis drives its own RAF loop (autoRaf on by default). ScrollTrigger
    // refreshes on Lenis scroll, and gsap.ticker.lagSmoothing(0) keeps the
    // scrub synced to the real scroll delta rather than an interpolated ticker.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lenis.on("scroll", ScrollTrigger.update as any);

    const trigger = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: pinEnd.current,
      pin,
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    });

    return () => {
      trigger.kill();
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Caption scenes stay as they were in v1: the markup is present but never
  // receives a progress value (progress is a ref and nothing re-renders), and
  // the active stylesheet has no .vs-scene rules. The canvas was the only
  // visible layer of this section.

  // reduced-motion fallback — no pin, two static frames with the captions
  // stacked below them.
  if (reducedMotion.current) {
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
              src={FRAME_SRC(0, true)}
              alt="Vault closed — frame 1 of the escrow sequence"
              className="vs-frame is-ready"
              decoding="async"
              loading="eager"
            />
            <img
              src={FRAME_SRC(FRAME_COUNT - 1, true)}
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

  // normal motion — pinned captions, no frame canvas
  return (
    <section
      className="vs"
      ref={sectionRef}
      aria-label="VaultPay escrow sequence"
      data-testid="vault-sequence"
    >
      <div className="vs-pin" ref={pinRef} style={{ position: "relative" }}>
        <div className="vs-copy" aria-live="polite">
          {SCENES.map((s) => {
            return (
              <div
                key={s.head}
                className="vs-scene"
                style={{ opacity: 0, visibility: "hidden" }}
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
