/* fx.ts — feature flags for hero effects. Flipping wheelClip to false restores
   exact v1 behavior (cropped wheel rotation and the gold seam rectangle). */

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
