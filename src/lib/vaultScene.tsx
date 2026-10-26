/* vaultScene.tsx — what the persistent vault layout shares with the route
   content inside it: the FX handle, the stage refs the entrance timeline needs,
   the CTA refs, and the signup transition entry points. */

import { createContext, useContext } from "react";
import type { RefObject } from "react";
import type { VaultFx } from "../components/HeroVault";

/* what the entry gate measures on the two CTA clips: it hands the page over
   only once the frames the intro and a first click will draw are decoded. The
   hero owns the players, so it also owns the numbers. */
export interface VaultClipsHandle {
  /* 0..1 across both clips, counting only the frames the gate waits for */
  progress: () => number;
  /* every frame the entry sequence draws is banked */
  ready: () => boolean;
  /* the honest frame count behind that fraction */
  counts: () => { banked: number; total: number };
}

export interface VaultScene {
  fx: RefObject<VaultFx | null>;
  pageRef: RefObject<HTMLDivElement | null>;
  stageWrapRef: RefObject<HTMLDivElement | null>;
  rimRef: RefObject<HTMLDivElement | null>;
  glowRef: RefObject<HTMLDivElement | null>;
  signupRef: RefObject<HTMLAnchorElement | null>;
  signinRef: RefObject<HTMLAnchorElement | null>;
  /* the vault frame has painted at least once */
  ready: boolean;
  /* the entry gate has lifted, so the hero may run its entrance */
  booted: boolean;
  /* registered by the hero once its clip players exist */
  clips: RefObject<VaultClipsHandle | null>;
  reduced: boolean;
  /* the keypad frames could not be loaded, so /signin shows the flat CSS keys */
  padFail: boolean;
  /* arrived here by going back from /signup, so the hero returns instead of
     replaying the intro */
  returning: boolean;
  /* Sign up: the wheel has landed — move the vault, leave the hero, go to /signup */
  startSignup: () => void;
  /* Sign in: the keypad has reached K1 — keep that frame, move the vault, go to /signin */
  startSignin: () => void;
  /* the form card joins the running transition; a no-op on a direct load */
  enterSignupCard: (card: HTMLElement) => void;
  enterSigninCard: (card: HTMLElement) => void;
  /* the card keeps its last rect so the way back can animate it out after React
     has detached it */
  registerSignupCard: (card: HTMLElement) => void;
  registerSigninCard: (card: HTMLElement) => void;
  /* /signin: play the keypad's code entry (K1 to the last frame) over the held
     still and resolve when it lands, or when the beat is up */
  padEnter: () => Promise<void>;
}

export const VaultSceneContext = createContext<VaultScene | null>(null);

export function useVaultScene(): VaultScene {
  const scene = useContext(VaultSceneContext);
  if (!scene) throw new Error("useVaultScene must be used inside VaultLayout");
  return scene;
}
