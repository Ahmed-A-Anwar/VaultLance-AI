/* vaultScene.tsx — what the persistent vault layout shares with the route
   content inside it: the FX handle, the stage refs the entrance timeline needs,
   the CTA refs, and the signup transition entry point. */

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
  /* arrived here from /signup, so the hero shows its return instead of the intro */
  returning: boolean;
  /* Sign up: the wheel has landed — move the vault, leave the hero, go to /signup */
  startSignup: () => void;
  /* the mounted hero hands over its exit animation for the transition */
  registerHeroExit: (fn: (() => void) | null) => void;
}

export const VaultSceneContext = createContext<VaultScene | null>(null);

export function useVaultScene(): VaultScene {
  const scene = useContext(VaultSceneContext);
  if (!scene) throw new Error("useVaultScene must be used inside VaultLayout");
  return scene;
}
