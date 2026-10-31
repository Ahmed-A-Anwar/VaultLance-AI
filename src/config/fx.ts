/* fx.ts — feature flags for hero effects.
   wheelClip false switches the Sign up vault clip off; keypadClip false switches
   the Sign in keypad clip off. In both cases the button keeps the static vault
   and the flat DOM overlays.

   signinFlow true hands the keypad to /signin: the click plays only as far as
   K1 (keys lit, idle) and the frame stays on the vault, so the form opens on a
   lit keypad instead of a finished code entry. false restores the old behavior —
   play to the last frame, then navigate. */

export const FX = {
  wheelClip: true,
  keypadClip: true,
  signinFlow: true,
  /* forgotFlow true hands the "Forgot password?" link on /signin over to the
     reset flow: it points at /forgot-password and carries a typed address
     across. false restores the old placeholder href ("#").

     mockErrors true lets the reset screens fail on 5% of submissions, so the
     failure paths stay reachable. false makes every submission succeed. */
  forgotFlow: true,
  mockErrors: true,
  /* settingsPage true mounts the client settings page at /dashboard/settings.
     false restores the blank area the dashboard shipped with. */
  settingsPage: true,
};

export const CLIPS = {
  wheel: {
    fps: 24,
    dir: "/wheel-turn",
    /* frame naming in the folder: ezgif-frame-001.webp ... */
  },
  keypad: {
    fps: 24,
    /* K1 = Math.round(frameCount * k1Fraction): keys fully lit, before entry */
    k1Fraction: 0.5,
  },
} as const;

export type ClipConfig = typeof CLIPS.wheel;
export type KeypadClipConfig = typeof CLIPS.keypad;
