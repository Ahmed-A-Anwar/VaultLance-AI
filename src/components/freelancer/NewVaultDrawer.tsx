/* NewVaultDrawer.tsx — 610px of right-hand drawer, three steps and a success
   state. Details, deliverables, review: each step is valid or it isn't, and the
   footer button says which.

   The scan is local: the four checks are the rules the backend's upload
   middleware enforces, run against the file's name and size, so a bad archive is
   refused before a byte is sent. With an API configured, submit then creates the
   vault on the server, uploads the archive, locks and re-verifies its manifest,
   and invites the client; ?demo=1 keeps the in-memory path. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../shared/Toasts";
import { Check, Plus, VaultGlyph } from "../dashboard/icons";
import { amountProblem, fees, formatCents } from "../../lib/fees";
import { trapFocus } from "./focusTrap";
import {
  archiveProblem,
  createVault,
  manifestFor,
  stagingUrlProblem,
  URL_PROBLEM_TEXT,
  type FreelancerVault,
  type VaultFile,
  type VaultKind,
} from "./mockApi";
import { SCAN_RULES } from "./mockConfig";
import { apiClient, isDemoMode } from "../../lib/apiClient";
import { createVaultOnServer } from "../../lib/vaultWrites";
import { buildManifest, uploadArchive, verifyManifest } from "../../lib/uploadWrites";
import { realOn } from "../../config/fx";

type Step = 1 | 2 | 3;
type Mode = "zip" | "url";
type ScanState = "idle" | "scanning" | "pass" | "fail";

interface ProgressRow {
  id: string;
  label: string;
  state: "queued" | "running" | "pass" | "fail";
  reason?: string;
}

const TYPES: Array<{ key: VaultKind; label: string }> = [
  { key: "web", label: "Web app" },
  { key: "design", label: "Design files" },
  { key: "other", label: "Other" },
];

const STEPS = ["Details", "Deliverables", "Review"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NewVaultDrawer({
  openAt,
  vault,
  onClose,
  onCreated,
}: {
  openAt?: Step;
  /** an existing draft being continued or a vault being added to */
  vault?: FreelancerVault;
  onClose: () => void;
  onCreated: (vault: FreelancerVault, invited: boolean) => void;
}) {
  const toast = useToast();
  const panel = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>(openAt ?? 1);
  const [done, setDone] = useState<{ vault: FreelancerVault; invited: boolean } | null>(null);

  const [project, setProject] = useState(vault?.project ?? "");
  const [email, setEmail] = useState(vault?.clientEmail ?? "");
  const [amount, setAmount] = useState(vault ? String(vault.amountCents / 100) : "");
  const [kind, setKind] = useState<VaultKind>(vault?.kind ?? "web");
  const [description, setDescription] = useState(vault?.description ?? "");

  const [mode, setMode] = useState<Mode>("zip");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [scan, setScan] = useState<ScanState>("idle");
  const [scanReason, setScanReason] = useState<string | null>(null);
  const [manifest, setManifest] = useState<string | undefined>(vault?.manifestSha256);
  const [url, setUrl] = useState(vault?.stagingUrl ?? "");
  const [urlOk, setUrlOk] = useState<{ ms: number } | null>(null);

  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const cents = useMemo(() => Math.round(Number(amount) * 100), [amount]);
  const moneyProblem = amount.trim() === "" ? null : amountProblem(cents);
  const fee = useMemo(() => fees(Number.isFinite(cents) ? cents : 0), [cents]);

  const projectError = project.trim().length >= 2 && project.trim().length <= 60 ? null : "Use 2 to 60 characters.";
  const emailError = EMAIL_RE.test(email.trim()) ? null : "Enter a valid email address.";
  const amountError =
    moneyProblem === "too_small"
      ? "The minimum is $5."
      : moneyProblem === "too_large"
        ? "The maximum is $10,000."
        : moneyProblem === "negative_payout"
          ? "After fees there is nothing left to pay out."
          : moneyProblem
            ? "Enter an amount."
            : null;
  const detailsValid = !projectError && !emailError && !amountError && amount !== "";

  useEffect(() => {
    if (!panel.current) return;
    const trap = trapFocus(panel.current, onClose);
    return () => trap.release();
  }, [onClose]);

  const files: VaultFile[] = file ? [{ name: file.name, sizeBytes: file.size }] : [];
  const deliverablesValid = mode === "zip" ? scan === "pass" : !!urlOk;

  const startScan = (incoming: File) => {
    const problem = archiveProblem(incoming.name, incoming.size);
    const list: ProgressRow[] = [
      { id: "structure", label: "Archive structure", state: "queued" },
      { id: "types", label: "File types", state: "queued" },
      { id: "size", label: "Size limits", state: "queued" },
      { id: "hash", label: "Manifest hash", state: "queued" },
    ];
    setRows(list);
    setScan("scanning");
    setScanReason(null);
    setManifest(undefined);

    const verdicts: Record<string, string | null> = {
      structure: incoming.name.toLowerCase().includes("bomb") ? "Expands past the 100:1 ratio limit." : null,
      types: problem && !incoming.name.toLowerCase().includes("bomb") ? problem : null,
      size: incoming.size > SCAN_RULES.maxCompressedBytes ? "Over the 100 MB compressed limit." : null,
      hash: problem ? "No manifest: the archive did not pass." : null,
    };

    let i = 0;
    const tick = () => {
      if (i > 0) {
        const prev = list[i - 1];
        prev.state = verdicts[prev.id] ? "fail" : "pass";
        prev.reason = verdicts[prev.id] ?? undefined;
        setRows(list.map((r) => ({ ...r })));
      }
      if (i === list.length) {
        const failed = list.some((r) => r.state === "fail");
        setScan(failed ? "fail" : "pass");
        setScanReason(failed ? (list.find((r) => r.state === "fail")?.reason ?? "The archive didn’t pass.") : null);
        setManifest(failed ? undefined : manifestFor(files.length ? files : [{ name: incoming.name, sizeBytes: incoming.size }]));
        return;
      }
      list[i].state = "running";
      setRows(list.map((r) => ({ ...r })));
      i += 1;
      window.setTimeout(tick, 382);
    };
    tick();
  };

  const onPick = (incoming: File | null) => {
    if (!incoming) return;
    const problem = archiveProblem(incoming.name, incoming.size);
    if (problem && !incoming.name.toLowerCase().includes("bomb")) {
      setFile(null);
      setScan("fail");
      setScanReason(problem);
      setRows([]);
      return;
    }
    setFile(incoming);
    startScan(incoming);
  };

  const checkUrl = async () => {
    const problem = stagingUrlProblem(url);
    if (problem) {
      setUrlOk(null);
      toast({ message: URL_PROBLEM_TEXT[problem], tone: "error" });
      return;
    }
    await new Promise((r) => setTimeout(r, 412));
    setUrlOk({ ms: 412 });
  };

  /* the server path: create the vault, upload the archive, lock and re-verify
     its manifest, then invite the client — stopping at the first step the server
     refuses, with that step's own message */
  const createOnServer = async (draft: boolean): Promise<{ created: FreelancerVault; invited: boolean }> => {
    const existing = vault && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(vault.id) ? vault : null;
    let vaultId = existing?.id ?? "";

    if (!vaultId) {
      /* FX.real.vaultsWrite sends this through the http client and the vault
         adapter; with the flag off the shipped apiClient path is untouched */
      if (realOn("vaultsWrite")) {
        vaultId = (
          await createVaultOnServer({
            title: project.trim(),
            ...(description ? { description: description.trim() } : {}),
            amountCents: cents,
          })
        ).id;
      } else {
        const res = await apiClient.vaults.create({
          title: project.trim(),
          ...(description ? { description: description.trim() } : {}),
          amount: cents / 100,
          currency: "USD",
        });
        if (!res.success || !res.data?.id) throw new Error(res.message || "The vault could not be created.");
        vaultId = res.data.id;
      }
    }

    let serverManifest: string | undefined;

    if (mode === "zip" && file) {
      if (realOn("uploads")) {
        /* upload, build, re-verify — each step's own failure stops the run */
        await uploadArchive(vaultId, file);
        const built = await buildManifest(vaultId);
        if (!built.hash) throw new Error("The manifest could not be built.");
        if (built.totalFiles < 1) {
          throw new Error("The manifest came back empty, so the upload was not recorded.");
        }
        const check = await verifyManifest(vaultId);
        if (!check.reproducible) {
          throw new Error("The manifest did not reproduce, so the delivery was refused.");
        }
        serverManifest = built.hash;
        setManifest(serverManifest);
      } else {
        const upload = await apiClient.uploads.uploadFile(vaultId, file);
        if (!upload.success) throw new Error(upload.message || "The archive could not be uploaded.");

        const built = await apiClient.manifests.get(vaultId);
        if (!built.success || !built.data?.manifestHash) {
          throw new Error(built.message || "The manifest could not be built.");
        }
        if (Number(built.data.totalFiles) < 1) {
          throw new Error("The manifest came back empty, so the upload was not recorded.");
        }
        serverManifest = built.data.manifestHash;
        setManifest(serverManifest);

        const check = await apiClient.manifests.verify(vaultId);
        if (check.success && check.data && check.data.reproducible === false) {
          throw new Error("The manifest did not reproduce, so the delivery was refused.");
        }
      }
    }

    let invited = false;
    if (!draft) {
      const invite = await apiClient.vaults.invite(vaultId, email.trim());
      invited = invite.success;
      if (!invite.success) {
        toast({ message: invite.message || "The vault was created, but the invite did not go out.", tone: "info" });
      }
    }

    return {
      created: {
        id: vaultId,
        project: project.trim(),
        clientName: email.trim().split("@")[0] || "Client",
        clientEmail: email.trim(),
        amountCents: cents,
        uiStatus: "awaiting_payment" as FreelancerVault["uiStatus"],
        kind,
        ...(description ? { description } : {}),
        filesCount: files.length,
        files,
        ...(serverManifest ? { manifestSha256: serverManifest } : {}),
        ...(mode === "url" && url ? { stagingUrl: url } : {}),
        createdAt: Date.now(),
      },
      invited,
    };
  };

  const submit = async (draft: boolean) => {
    setTouched(true);
    if (!detailsValid) {
      setStep(1);
      return;
    }
    if (!draft && !deliverablesValid) {
      setStep(2);
      return;
    }
    setBusy(true);
    try {
      /* a demo vault (a v_… id from the mock store) keeps the mock path even
         with an API configured, so "Add files" never mints a duplicate vault */
      const onServer = !isDemoMode() && (!vault || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(vault.id));
      const { created, invited } = onServer
        ? await createOnServer(draft)
        : {
            created: await createVault(
              {
                project,
                clientEmail: email,
                amountCents: cents,
                kind,
                ...(description ? { description } : {}),
                ...(mode === "zip" ? { files } : { stagingUrl: url }),
                ...(manifest ? { manifestSha256: manifest } : {}),
              },
              { draft }
            ),
            invited: true,
          };

      if (draft) {
        toast({ message: "Draft saved.", tone: "success" });
        onCreated(created, false);
        onClose();
        return;
      }
      setDone({ vault: created, invited });
      onCreated(created, invited);
      toast({
        message: invited ? "Vault created. Invite sent." : "Vault created. Invite not sent.",
        tone: invited ? "success" : "info",
      });
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : "Couldn’t create the vault.",
        tone: "error",
        action: { label: "Retry", run: () => void submit(draft) },
      });
    } finally {
      setBusy(false);
    }
  };

  const copiedNow = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };

  /* The clipboard API is refused on insecure origins and without permission in
     some browsers, and a rejection used to leave the button doing nothing at all.
     Fall back to selecting the text, then say so if even that fails. */
  const copy = async (text: string, message: string) => {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      copiedNow();
      toast({ message, tone: "success" });
      return;
    } catch {
      /* try the selection fallback below */
    }
    try {
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.top = "0";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(box);
      if (!ok) throw new Error("copy refused");
      copiedNow();
      toast({ message, tone: "success" });
    } catch {
      toast({ message: "Couldn’t copy. Select the code and copy it by hand.", tone: "error" });
    }
  };

  const stepIndex = done ? 3 : step - 1;

  return (
    <div className="fd-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="fd-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-drawer-h"
        ref={panel}
        tabIndex={-1}
      >
        <header className="fd-drawer-head">
          <h2 id="fd-drawer-h" className="fd-drawer-title">
            {done ? "Vault created" : vault ? "Add to vault" : "New vault"}
          </h2>
          <button type="button" className="fd-icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        {!done && (
          <ol className="fd-drawer-steps" aria-label="New vault steps">
            {STEPS.map((label, i) => (
              <li key={label} data-state={i < stepIndex ? "done" : i === stepIndex ? "current" : "todo"}>
                <span className="fd-drawer-node" aria-hidden="true">
                  {i < stepIndex ? <Check width="9" height="9" /> : i + 1}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="fd-drawer-body">
          {done ? (
            <div className="fd-success">
              <span className="fd-success-ring" aria-hidden="true">
                <Check width="21" height="21" />
              </span>
              <p className="fd-success-h">Vault created.</p>
              <p className="fd-dim">
                {done.invited
                  ? `We sent an invite to ${done.vault.clientEmail}.`
                  : `The vault is saved. ${done.vault.clientEmail} can be invited once their account exists.`}
              </p>
              {done.vault.inviteCode && (
                <>
                  <div className="fd-code-box">
                    <span className="fd-mono fd-dim">INVITE CODE</span>
                    <span className="fd-code">{done.vault.inviteCode}</span>
                    <button type="button" className="fd-icon-btn" aria-label="Copy invite code" onClick={() => copy(done.vault.inviteCode!, "Invite code copied.")}>
                      {copied ? <Check width="13" height="13" /> : "⧉"}
                    </button>
                  </div>
                  <button
                      type="button"
                      className="fd-btn fd-btn-secondary"
                      onClick={() =>
                        void copy(`${window.location.origin}/v/${done.vault.inviteCode!}`, "Invite link copied.")
                      }
                    >
                      Copy invite link
                    </button>
                </>
              )}
            </div>
          ) : step === 1 ? (
            <div className="fd-step-body" key="s1">
              <label className="fd-field">
                <span className="fd-label">Project name</span>
                <input
                  className="fd-input"
                  value={project}
                  maxLength={60}
                  onChange={(e) => setProject(e.target.value)}
                  aria-invalid={touched && !!projectError}
                />
                {touched && projectError && <span className="fd-error">{projectError}</span>}
              </label>

              <label className="fd-field">
                <span className="fd-label">Client email</span>
                <input
                  className="fd-input"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={touched && !!emailError}
                />
                {touched && emailError && <span className="fd-error">{emailError}</span>}
              </label>

              <label className="fd-field">
                <span className="fd-label">Amount in USD</span>
                <div className="fd-money">
                  <span aria-hidden="true">$</span>
                  <input
                    className="fd-input fd-input-money"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    aria-invalid={touched && !!amountError}
                  />
                </div>
                <span className="fd-mono fd-dim">
                  YOU RECEIVE ABOUT {formatCents(fee.payoutCents)} ON {formatCents(fee.amountCents)}
                </span>
                {touched && amountError && <span className="fd-error">{amountError}</span>}
              </label>

              <div className="fd-field">
                <span className="fd-label" id="fd-type-label">
                  Type
                </span>
                <div className="fd-seg" role="radiogroup" aria-labelledby="fd-type-label">
                  {TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="radio"
                      aria-checked={kind === t.key}
                      className="fd-seg-item"
                      data-on={kind === t.key}
                      onClick={() => setKind(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="fd-field">
                <span className="fd-label">Description (optional)</span>
                <textarea
                  className="fd-input fd-textarea"
                  maxLength={160}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 160))}
                />
                <span className="fd-mono fd-dim">{description.length}/160</span>
              </label>
            </div>
          ) : step === 2 ? (
            <div className="fd-step-body" key="s2">
              <div className="fd-seg" role="radiogroup" aria-label="Deliverable type">
                <button type="button" role="radio" aria-checked={mode === "zip"} data-on={mode === "zip"} className="fd-seg-item" onClick={() => setMode("zip")}>
                  Upload zip
                </button>
                <button type="button" role="radio" aria-checked={mode === "url"} data-on={mode === "url"} className="fd-seg-item" onClick={() => setMode("url")}>
                  Staging URL
                </button>
              </div>

              {mode === "zip" ? (
                <>
                  <label className="fd-drop" data-over={undefined} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files[0] ?? null); }}>
                    <VaultGlyph width="34" height="34" aria-hidden="true" />
                    <span>Drop a .zip here or browse</span>
                    <input
                      className="fd-file"
                      type="file"
                      accept=".zip"
                      onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                      aria-label="Choose a zip archive"
                    />
                  </label>

                  {file && (
                    <div className="fd-file-row">
                      <span className="fd-mono">{file.name}</span>
                      <span className="fd-dim">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                      <button type="button" className="fd-icon-btn" aria-label="Remove file" onClick={() => { setFile(null); setScan("idle"); setRows([]); }}>
                        ×
                      </button>
                    </div>
                  )}

                  {rows.length > 0 && (
                    <ul className="fd-scan" aria-live="polite">
                      {rows.map((r) => (
                        <li key={r.id} data-state={r.state}>
                          <span className="fd-scan-label">{r.label}</span>
                          <span className="fd-scan-state">{r.state.toUpperCase()}</span>
                          {r.reason && <span className="fd-error">{r.reason}</span>}
                        </li>
                      ))}
                    </ul>
                  )}

                  {scan === "fail" && scanReason && !rows.length && <p className="fd-error">{scanReason}</p>}
                  {scan === "fail" && <p className="fd-dim">Remove the file and try again.</p>}
                </>
              ) : (
                <>
                  <div className="fd-url-row">
                    <input className="fd-input" placeholder="https://staging.example.com" value={url} onChange={(e) => { setUrl(e.target.value); setUrlOk(null); }} aria-label="Staging URL" />
                    <button type="button" className="fd-btn fd-btn-secondary" onClick={() => void checkUrl()}>
                      Check URL
                    </button>
                  </div>
                  {urlOk && (
                    <p className="fd-live">
                      <span className="fd-live-dot" aria-hidden="true" /> Responded in {urlOk.ms} ms (MOCK)
                    </p>
                  )}
                  {url && stagingUrlProblem(url) && <p className="fd-error">{URL_PROBLEM_TEXT[stagingUrlProblem(url)!]}</p>}
                </>
              )}

              <p className="fd-mono fd-dim fd-note">WE NEVER RUN YOUR CODE. UPLOADS ARE SCANNED AND HASHED.</p>
            </div>
          ) : (
            <div className="fd-step-body" key="s3">
              <dl className="fd-review">
                <div><dt>PROJECT</dt><dd>{project}</dd></div>
                <div><dt>CLIENT</dt><dd>{email}</dd></div>
                <div><dt>AMOUNT</dt><dd>{formatCents(fee.amountCents)}</dd></div>
                <div><dt>TYPE</dt><dd>{TYPES.find((t) => t.key === kind)?.label}</dd></div>
                <div>
                  <dt>DELIVERABLES</dt>
                  <dd>{mode === "zip" ? `${files.length} file${files.length === 1 ? "" : "s"}` : url}</dd>
                </div>
                <div>
                  <dt>MANIFEST</dt>
                  <dd className="fd-mono">
                    {manifest ? `${manifest.slice(0, 12)}…` : "—"}
                    {manifest && (
                      <button type="button" className="fd-icon-btn" aria-label="Copy manifest" onClick={() => copy(manifest, "Manifest copied.")}>
                        ⧉
                      </button>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="fd-fees">
                <p><span>AMOUNT</span><span>{formatCents(fee.amountCents)}</span></p>
                <p><span>VAULTLANCE FEE 5%</span><span>−{formatCents(fee.vaultlanceFeeCents)}</span></p>
                <p><span>PAYPAL FEE (EST.)</span><span>−{formatCents(fee.paypalFeeCents)}</span></p>
                <p className="fd-fees-total"><span>YOU RECEIVE (EST.)</span><span>{formatCents(fee.payoutCents)}</span></p>
                <p className="fd-mono fd-dim">The PayPal fee is an estimate.</p>
              </div>
            </div>
          )}
        </div>

        <footer className="fd-drawer-foot">
          {done ? (
            <>
              <button type="button" className="fd-btn fd-btn-primary" onClick={onClose}>
                Done
              </button>
              <button
                type="button"
                className="fd-btn fd-btn-secondary"
                onClick={() => {
                  setDone(null);
                  setStep(1);
                  setProject("");
                  setEmail("");
                  setAmount("");
                  setDescription("");
                  setFile(null);
                  setRows([]);
                  setScan("idle");
                  setUrl("");
                  setUrlOk(null);
                  setManifest(undefined);
                }}
              >
                Create another
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="fd-btn fd-btn-secondary"
                onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as Step))}
              >
                {step === 1 ? "Cancel" : "Back"}
              </button>
              {step === 1 && (
                <button type="button" className="fd-btn fd-btn-ghost" onClick={() => void submit(true)} disabled={busy}>
                  Save draft
                </button>
              )}
              {step < 3 ? (
                <button
                  type="button"
                  className="fd-btn fd-btn-primary"
                  onClick={() => {
                    setTouched(true);
                    if (step === 1 && detailsValid) setStep(2);
                    else if (step === 2 && deliverablesValid) setStep(3);
                  }}
                  disabled={step === 1 ? !detailsValid : !deliverablesValid}
                >
                  Next
                </button>
              ) : (
                <button type="button" className="fd-btn fd-btn-primary" onClick={() => void submit(false)} disabled={busy}>
                  Create &amp; invite client
                </button>
              )}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

export { Plus };
