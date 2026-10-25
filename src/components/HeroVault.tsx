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
  /* the clip canvases live inside the float + parallax wrapper; the drawn rect
     is the same box the static frame was painted into */
  getClipLayer: () => ClipLayer;
  getKeypadLayer: () => ClipLayer;
  setClipActive: (on: boolean) => void;
  setKeypadClipActive: (on: boolean) => void;
  /* drop every CTA reaction and put the hotspots back to rest. The hero calls
     this as it unmounts, so nothing it lit can follow the vault to /signup. */
  resetCtas: () => void;
  /* paint a still frame as the vault itself — the wheel's last frame becomes the
     resting photo once the turn has landed — or null to put f_001 back */
  holdFrame: (url: string | null) => Promise<void>;
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

/* vault body inside f_001.webp, as a fraction of the frame: the solid shell
   spans x 655-1244 and y 221-848 on the 1920x1080 frame (threshold cut 120 of
   255 on a 198.7 backdrop, which drops the contact shadow) */
const FRAME_ASPECT = 16 / 9;
const VAULT_FW = 0.3073;
const VAULT_FH = 0.5815;
const VAULT_CX = 0.4945;
const VAULT_CY = 0.4950;
/* the phone breakpoint, kept in step with the max-width: 767px block in hero.css */
const PHONE_MAX = 767;

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
  const keypadElRef = useRef<HTMLDivElement | null>(null);
  const keypadClipRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const clipRef = useRef<HTMLCanvasElement | null>(null);
  const lastRect = useRef<ClipRect | null>(null);
  /* the frame the base canvas is painted with: f_001, or the landed wheel */
  const heldRef = useRef<HTMLImageElement | null>(null);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const img = heldRef.current ?? imageRef.current;
    if (!canvas || !stage || !img) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w <= 0 || h <= 0) return;
    let dw: number;
    let dh: number;
    let dx: number;
    let dy: number;
    if (window.innerWidth <= PHONE_MAX) {
      /* phones: the vault zone is a short band, so fit the body into it instead
         of covering the stage. The drawn body is 80% of the zone height until
         the 61.8% viewport-width cap takes over; either way the body is centred
         and the frame is cropped by the zone, with no width cap on top. */
      dh = (0.8 * h) / VAULT_FH;
      dw = dh * FRAME_ASPECT;
      const maxBodyW = window.innerWidth * 0.618;
      if (dw * VAULT_FW > maxBodyW) {
        dw = maxBodyW / VAULT_FW;
        dh = dw / FRAME_ASPECT;
      }
      dx = w / 2 - dw * VAULT_CX;
      dy = h / 2 - dh * VAULT_CY;
    } else {
      let scale = Math.max(w / img.width, h / img.height);
      /* cap the drawn width so the vault never reaches into the 38.2% text column */
      const maxDrawnW = window.innerWidth * 1.12;
      if (img.width * scale > maxDrawnW) scale = maxDrawnW / img.width;
      dw = img.width * scale;
      dh = img.height * scale;
      dx = (w - dw) / 2;
      dy = (h - dh) / 2;
      if (anchor && window.innerWidth >= 1024) {
        // pin the wheel to the golden point: x 61.8% of viewport, y 50%
        dx += window.innerWidth * 0.618 - (dx + dw * (WHEEL_X / 100));
        dy += window.innerHeight * 0.5 - (dy + dh * (WHEEL_Y / 100));
      }
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    /* the canvas starts the photo's left fade at the drawn edge, not at the
       canvas edge, so the frame's cut never shows as a vertical band */
    canvas.style.setProperty("--draw-left", `${dx.toFixed(1)}px`);
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
    resetCtas() {
      keyRefs.current.forEach((key) => {
        if (!key) return;
        gsap.killTweensOf(key);
        gsap.set(key, { opacity: 0 });
      });
      hingeRefs.current.forEach((bar) => {
        if (!bar) return;
        gsap.killTweensOf(bar);
        gsap.set(bar, { opacity: 0, yPercent: 0 });
      });
      if (glowRef?.current) {
        gsap.killTweensOf(glowRef.current);
        gsap.set(glowRef.current, { opacity: 0 });
      }
      if (ledRef.current) {
        gsap.killTweensOf(ledRef.current);
        gsap.set(ledRef.current, { clearProps: "background,boxShadow" });
      }
      /* the dashed Sign in connector is redrawn on every hover, so dropping its
         path is enough to take a half-drawn one off the vault */
      if (connectorRef.current) {
        gsap.killTweensOf(connectorRef.current);
        connectorRef.current.removeAttribute("d");
      }
      if (seamRef.current) {
        gsap.killTweensOf(seamRef.current);
        gsap.set(seamRef.current, { stroke: "rgba(226,184,103,0)", strokeWidth: 2 });
        seamRef.current.style.visibility = "";
      }
      /* a clip hidden on the way out may have left the flat keypad hidden */
      if (keypadElRef.current) keypadElRef.current.style.visibility = "";
    },
    getClipLayer: () => ({
      canvas: clipRef.current,
      getRect: () => lastRect.current,
    }),
    getKeypadLayer: () => ({
      canvas: keypadClipRef.current,
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
    holdFrame(url) {
      return new Promise<void>((resolve) => {
        if (!url) {
          heldRef.current = null;
          paint();
          resolve();
          return;
        }
        const img = new Image();
        img.decoding = "async";
        img.onerror = () => resolve();
        const settle = () => {
          heldRef.current = img;
          paint();
          resolve();
        };
        img.src = url;
        if (typeof img.decode === "function") img.decode().then(settle, () => resolve());
        else img.onload = settle;
      });
    },
    setKeypadClipActive(on: boolean) {
      if (keypadElRef.current) keypadElRef.current.style.visibility = on ? "hidden" : "";
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
        /* kill this key's previous tween first. overwrite: "auto" only stops
           tweens that have already started, so a staggered tween still waiting
           on its delay would fire after the keys were asked to go dark — a
           pointer flick across Sign in left a staircase of keys lit, and the
           vault carried them onto /signup. */
        gsap.killTweensOf(key);
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
      <canvas ref={keypadClipRef} className="hero-canvas hero-clip" data-testid="keypad-clip" />
      <div className="hero-rim" ref={rimRef} />
      <div className="hero-rect" ref={rectRef}>
        <div
          className="hero-keypad"
          ref={keypadElRef}
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
