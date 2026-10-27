/* JoinRow.tsx — the inline row the strip's "Join a vault" opens: one code, one
   join, and a demo shortcut for anyone who does not have a code to hand. */

import { useEffect, useRef, useState } from "react";
import { ApiError, joinVault } from "../../lib/api";
import { useDashData } from "./data";
import { useToast } from "./Toasts";

export function JoinRow({ onDone }: { onDone?: () => void }) {
  const { reload } = useDashData();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const vault = await joinVault(value);
      setCode("");
      toast({ message: `${vault.project} joined. Authorize the payment when you are ready.`, tone: "success" });
      reload();
      onDone?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="dash-join"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) void submit(code);
      }}
    >
      <input
        ref={input}
        className="dash-join-input"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          if (error) setError(null);
        }}
        placeholder="Enter invite code"
        aria-label="Invite code"
        aria-invalid={error ? true : undefined}
        aria-describedby="dash-join-msg"
      />
      <button type="submit" className="dash-btn dash-btn-primary" disabled={busy || !code.trim()}>
        <span className="dash-btn-label">{busy ? "Joining…" : "Join"}</span>
      </button>
      <button type="button" className="dash-btn dash-btn-ghost" disabled={busy} onClick={() => void submit("DEMO-1234")}>
        <span className="dash-btn-label">Try the demo project</span>
      </button>
      <p id="dash-join-msg" className={error ? "dash-join-error" : "dash-sr"} role={error ? "alert" : undefined}>
        {error ?? ""}
      </p>
    </form>
  );
}
