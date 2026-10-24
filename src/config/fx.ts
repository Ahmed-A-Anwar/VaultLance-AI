/* fx.ts — feature flags for hero effects. wheelClip false switches the Sign up
   vault clip off; the button then keeps the static vault (the old cropped-wheel
   spin and gold seam are no longer in the code). */

export const FX = {
  wheelClip: true,
};

export const CLIPS = {
  wheel: {
    fps: 24,
    dir: "/wheel-turn",
    /* frame naming in the folder: ezgif-frame-001.webp ... */
  },
} as const;

export type ClipConfig = typeof CLIPS.wheel;
