/* vaultScene.tsx — what the persistent vault layout shares with the route
   content inside it: the FX handle, the stage refs the entrance timeline needs,
   the CTA refs, and the signup transition entry points. */

import { createContext, useContext } from "react";
import type { RefObject } from "react";
import type { VaultFx } from "../components/HeroVault";

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
  reduced: boolean;
  /* arrived here by going back from /signup, so the hero returns instead of
     replaying the intro */
  returning: boolean;
  /* Sign up: the wheel has landed — move the vault, leave the hero, go to /signup */
  startSignup: () => void;
  /* the form card joins the running transition; a no-op on a direct load */
  enterSignupCard: (card: HTMLElement) => void;
  /* the card keeps its last rect so the way back can animate it out after React
     has detached it */
  registerSignupCard: (card: HTMLElement) => void;
}

export const VaultSceneContext = createContext<VaultScene | null>(null);

export function useVaultScene(): VaultScene {
  const scene = useContext(VaultSceneContext);
  if (!scene) throw new Error("useVaultScene must be used inside VaultLayout");
  return scene;
}
