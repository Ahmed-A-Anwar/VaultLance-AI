/* HeroVault.tsx — canvas frame 1 of the vault sequence plus a hotspot overlay
   that uses the exact drawn image rect. Exposes an imperative FX API used by the
   CTA buttons (keypad cascade, door-seam light, hinge glint). The Sign up vault
   reaction is the wheel clip, which draws on its own canvas here. */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import gsap from "gsap";
import type { ClipRect } from "../lib/clipPlayer";

export interface ClipLayer {
  canvas: HTMLCanvasElement | null;
  getRect: () => ClipRect | null;
}

export interface VaultFx {
  signUpHover: (on: boolean) => void;
  signInHover: (on: boolean) => void;
  signInClick: () => void;
  /* the clip canvas lives inside the float + parallax wrapper; the drawn rect
     is the same box the static frame was painted into */
  getClipLayer: () => ClipLayer;
  setClipActive: (on: boolean) => void;
}

interface Rect {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  w: number;
  h: number;
}

export interface HeroVaultProps {
  frameSrc?: string;
  anchor?: boolean;
  signinAnchorRef?: React.RefObject<HTMLElement | null>;
  rimRef?: React.RefObject<HTMLDivElement | null>;
  glowRef?: React.RefObject<HTMLDivElement | null>;
  onReady?: () => void;
}

/* measured on f_001.webp (1920x1080) */
const WHEEL_X = 53.54;
const WHEEL_Y = 49.72;

const KEYPAD = { x: 59.6, y: 50.0, w: 3.2, h: 6.5 };
const SEAM =
  "M 447 255 H 585 A 30 30 0 0 1 615 285 V 700 A 30 30 0 0 1 585 730 H 447 A 30 30 0 0 1 417 700 V 285 A 30 30 0 0 1 447 255 Z";

export const HeroVault = forwardRef<VaultFx, HeroVaultProps>(function HeroVault(
  { frameSrc = "/vault-frames/f_001.webp", anchor = true, signinAnchorRef, rimRef, glowRef, onReady },
  ref
) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rectRef = useRef<HTMLDivElement | null>(null);
  const hingeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const keyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ledRef = useRef<HTMLDivElement | null>(null);
  const seamRef = useRef<SVGPathElement | null>(null);
  const connectorRef = useRef<SVGPathElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const clipRef = useRef<HTMLCanvasElement | null>(null);
  const lastRect = useRef<ClipRect | null>(null);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const img = imageRef.current;
    if (!canvas || !stage || !img) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w <= 0 || h <= 0) return;
    let scale = Math.max(w / img.width, h / img.height);
    /* cap the drawn width so the vault never reaches into the 38.2% text column */
    const maxDrawnW = window.innerWidth * 1.12;
    if (img.width * scale > maxDrawnW) scale = maxDrawnW / img.width;
    const dw = img.width * scale;
    const dh = img.height * scale;
    let dx = (w - dw) / 2;
    let dy = (h - dh) / 2;
    if (anchor && window.innerWidth >= 1024) {
      // pin the wheel to the golden point: x 61.8% of viewport, y 50%
      dx += window.innerWidth * 0.618 - (dx + dw * (WHEEL_X / 100));
      dy += window.innerHeight * 0.5 - (dy + dh * (WHEEL_Y / 100));
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    const rect = rectRef.current;
    if (rect) {
      rect.style.left = `${dx}px`;
      rect.style.top = `${dy}px`;
      rect.style.width = `${dw}px`;
      rect.style.height = `${dh}px`;
    }
    const next: Rect = { dx, dy, dw, dh, w, h };
    lastRect.current = { dx, dy, dw, dh };
    if (rect) {
      rect.dataset.rect = JSON.stringify(next);
      rect.dataset.painted = "1";
    }
  }, [anchor]);

  useEffect(() => {
    const img = new Image();
    img.decoding = "async";
    img.src = frameSrc;
    img.onload = () => {
      imageRef.current = img;
      paint();
      onReady?.();
    };
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(stage);
    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    const raf = requestAnimationFrame(() => paint());
    document.fonts?.ready.then(() => paint()).catch(() => undefined);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [frameSrc, paint, onReady]);

  useImperativeHandle(ref, () => ({
    getClipLayer: () => ({
      canvas: clipRef.current,
      getRect: () => lastRect.current,
    }),
    setClipActive(on: boolean) {
      if (seamRef.current) {
        if (on) seamRef.current.style.visibility = "hidden";
        else {
          seamRef.current.style.visibility = "";
          gsap.set(seamRef.current, { stroke: "rgba(226,184,103,0)", strokeWidth: 2 });
        }
      }
    },
    /* the clip owns the wheel and the gold seam now; Sign up only runs the
       hinge glint on the vault itself */
    signUpHover(on) {
      hingeRefs.current.forEach((bar) => {
        if (!bar) return;
        gsap.fromTo(
          bar,
          { yPercent: on ? -100 : 100 },
          { yPercent: on ? 100 : -100, duration: 0.618, ease: "power2.out", overwrite: "auto" }
        );
        gsap.to(bar, { opacity: on ? 1 : 0, duration: on ? 0.236 : 0.382, ease: "power2.out" });
      });
    },
    signInHover(on) {
      if (glowRef?.current) {
        gsap.to(glowRef.current, {
          opacity: on ? 0.9 : 0,
          duration: 0.382,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
      keyRefs.current.forEach((key, i) => {
        if (!key) return;
        const col = i % 3;
        const row = Math.floor(i / 3);
        gsap.to(key, {
          opacity: on ? 1 : 0,
          duration: 0.0618,
          delay: on ? (col + row) * 0.0618 : 0,
          ease: "power2.out",
          overwrite: "auto",
        });
      });
      drawConnector(on);
      if (seamRef.current) {
        gsap.to(seamRef.current, {
          stroke: on ? "rgba(18,165,181,0.45)" : "rgba(18,165,181,0)",
          duration: 0.382,
          ease: "power2.out",
          overwrite: "auto",
        });
      }
    },
    signInClick() {
      drawConnector(true);
      keyRefs.current.slice(0, 4).forEach((key, i) => {
        if (!key) return;
        gsap.fromTo(
          key,
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.1618,
            delay: i * 0.1618,
            yoyo: true,
            repeat: 1,
            ease: "power2.out",
            overwrite: "auto",
          }
        );
      });
      if (ledRef.current) {
        gsap.to(ledRef.current, {
          background: "#1F9D6B",
          boxShadow: "0 0 13px rgba(31,157,107,0.9)",
          delay: 4 * 0.1618,
          duration: 0.236,
          overwrite: "auto",
        });
      }
      if (seamRef.current) {
        const path = seamRef.current;
        gsap.fromTo(
          path,
          { stroke: "rgba(18,165,181,0)", strokeDasharray: "0.08 0.06", strokeDashoffset: 1 },
          {
            stroke: "rgba(18,165,181,0.85)",
            strokeDashoffset: 0,
            duration: 0.618,
            ease: "power2.out",
            overwrite: "auto",
          }
        );
      }
    },
  }));

  function drawConnector(on: boolean) {
    const path = connectorRef.current;
    const stage = stageRef.current;
    const rect = rectRef.current;
    const from = signinAnchorRef?.current;
    if (!path || !stage || !rect || !from) return;
    const s = stage.getBoundingClientRect();
    const r = rect.getBoundingClientRect();
    const b = from.getBoundingClientRect();
    const x1 = ((b.left + b.width / 2 - s.left) / s.width) * 100;
    const y1 = ((b.top + b.height / 2 - s.top) / s.height) * 100;
    const x2 = ((r.left + r.width * (KEYPAD.x / 100) - s.left) / s.width) * 100;
    const y2 = ((r.top + r.height * (KEYPAD.y / 100) - s.top) / s.height) * 100;
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + 12} ${y1}, ${x2 - 14} ${y2}, ${x2} ${y2}`);
    if (typeof path.getTotalLength === "function" && path.getTotalLength() > 0) {
      const len = path.getTotalLength();
      path.style.strokeDasharray = `${len}`;
      gsap.fromTo(
        path,
        { strokeDashoffset: on ? len : 0 },
        { strokeDashoffset: on ? 0 : len, duration: 0.618, ease: "power2.out", overwrite: "auto" }
      );
    }
  }

  return (
    <div className="hero-stage" ref={stageRef} aria-hidden="true">
      <canvas ref={canvasRef} className="hero-canvas" />
      <canvas ref={clipRef} className="hero-canvas hero-clip" data-testid="wheel-clip" />
      <div className="hero-rim" ref={rimRef} />
      <div className="hero-rect" ref={rectRef}>
        <div
          className="hero-keypad"
          style={{
            left: `${KEYPAD.x}%`,
            top: `${KEYPAD.y}%`,
            width: `${KEYPAD.w}%`,
            height: `${KEYPAD.h}%`,
          }}
        >
          <div className="hero-keypad-glow" ref={glowRef} />
          <div className="hero-keypad-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <div className="hero-keypad-key" key={i} ref={(el) => { keyRefs.current[i] = el; }} />
            ))}
          </div>
          <div className="hero-led" ref={ledRef} />
        </div>

        <div className="hero-hinge" style={{ left: "52.3%", top: "28%" }}>
          <div className="hero-hinge-bar" ref={(el) => { hingeRefs.current[0] = el; }} />
        </div>
        <div className="hero-hinge" style={{ left: "52.3%", top: "72%" }}>
          <div className="hero-hinge-bar" ref={(el) => { hingeRefs.current[1] = el; }} />
        </div>

        <svg className="hero-seam-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <path
            ref={seamRef}
            d={SEAM}
            fill="none"
            stroke="rgba(226,184,103,0)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <svg className="hero-connector" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          ref={connectorRef}
          d=""
          fill="none"
          stroke="rgba(18,165,181,0.5)"
          strokeWidth="1"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
});
