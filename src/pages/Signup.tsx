/* Signup.tsx — "/signup": the account form card in the left column, beside the
   vault that VaultLayout keeps mounted. The card joins the running transition
   when it is entered from the hero, and simply renders final on a direct load. */

import { useLayoutEffect, useRef } from "react";
import { useVaultScene } from "../lib/vaultScene";

export default function Signup() {
  const { enterSignupCard, registerSignupCard } = useVaultScene();
  const cardRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    registerSignupCard(card);
    enterSignupCard(card);
    const onResize = () => registerSignupCard(card);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enterSignupCard, registerSignupCard]);

  return (
    <main id="main" className="signup-layout">
      <div className="signup-card" data-testid="signup-card" ref={cardRef}>
        <h1 className="signup-h1" data-reveal>
          Open your vault.
        </h1>
        <p className="signup-sub" data-reveal>
          Pick your role. Create your account.
        </p>
      </div>
    </main>
  );
}
