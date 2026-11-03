/* NewVaultDrawer.tsx — the 610px right drawer: details, deliverables, review,
   then the invite code. It also carries the shorter "add files" job for an
   existing vault, which starts on the deliverables step.

   Everything it writes goes through the mock API, so the scan, the manifest and
   the invite code all behave the way the real endpoints will. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, VaultGlyph } from "../dashboard/icons";
import { canCreateVault, fees, formatCents, MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS } from "../../lib/fees";
import { useFreelancerData } from "./FreelancerData";
import {
  attachFiles,
  createVault,
  inviteLink,
  scanArchive,
  scanProblem,
  validateStagingUrl,
  type FreelancerFile,
  type FreelancerVault,
  type FreelancerVaultKind,
} from "./mockApi";
import { SCAN_STEPS, ARCHIVE_LIMITS } from "./mockConfig";
import type { ScanStep } from "./mockConfig";

type CheckState = "queued" | "running" | "pass" | "fail";
interface StepCheck {
  step: ScanStep;
  state: CheckState;
  reason?: string;
}

const STEPS = ["Details", "Deliverables", "Review"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NewVaultDrawer({
  mode,
  vault,
  onClose,
  onCreated,
}: {
  mode: "new" | "files";
  vault?: FreelancerVault;
  onClose: () => void;
  onCreated: (v: FreelancerVault) => void;
}) {
  const { perform } = useFreelancerData();
  const [step, setStep] = useState(mode === "files" ? 1 : 0);

  const [project, setProject] = useState(vault?.project ?? "");
  const [email, setEmail] = useState(vault?.clientEmail ?? "");
  const [amount, setAmount] = useState(vault ? (vault.amountCents / 100).toFixed(2) : "");
  const [kind, setKind] = useState<FreelancerVaultKind>(vault?.kind ?? "web");
  const [description, setDescription] = useState(vault?.description ?? "");

  const [tab, setTab] = useState<"zip" | "url">("zip");
  const [file, setFile] = useState<FreelancerFile | null>(null);
  const [checks, setChecks] = useState<StepCheck[]>(SCAN_STEPS.map((s) => ({ step: s, state: "queued" })));
  const [scan, setScan] = useState<"idle" | "running" | "pass" | "fail">("idle");
  const [scanReason, setScanReason] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [urlState, setUrlState] = useState<{ ok: boolean; text: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<FreelancerVault | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const firstField = useRef<HTMLInputElement>(null);

  const cents = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100);
  const breakdown = useMemo(() => fees(Number.isFinite(cents) ? cents : 0), [cents]);

  const detailsOk =
    project.trim().length >= 2 &&
    project.trim().length <= 60 &&
    EMAIL_RE.test(email.trim()) &&
    Number.isFinite(cents) &&
    cents >= MIN_AMOUNT_CENTS &&
    cents <= MAX_AMOUNT_CENTS &&
    canCreateVault(cents);

  const deliveryOk = tab === "zip" ? scan === "pass" : urlState?.ok === true;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    firstField.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const runScan = async (meta: FreelancerFile) => {
    const problem = scanProblem(meta);
    if (problem) {
      setScan("fail");
      setScanReason(problem);
      setChecks((prev) => prev.map((c, i) => (i === 0 ? { ...c, state: "fail", reason: problem } : c)));
      return;
    }
    setScan("running");
    setScanReason(null);
    setHash(null);
    try {
      const result = await scanArchive("pending", meta, (live) =>
        setChecks(live.map((c) => ({ step: c.step, state: c.state, reason: c.reason })))
      );
      setChecks(result.checks.map((c) => ({ step: c.step, state: c.state, reason: c.reason })));
      if (result.ok) {
        setScan("pass");
        setHash(result.manifestSha256 ?? null);
      } else {
        setScan("fail");
        setScanReason(result.reason ?? "The archive was refused.");
      }
    } catch {
      setScan("fail");
      setScanReason("The scan could not finish. Try again.");
    }
  };

  const takeFile = (f: File | undefined) => {
    if (!f) return;
    const meta = { name: f.name, sizeBytes: f.size };
    setFile(meta);
    void runScan(meta);
  };

  const checkUrl = () => {
    const result = validateStagingUrl(url);
    if (result.ok) {
      setUrlState({ ok: true, text: "Responded in 412 ms (MOCK)" });
    } else {
      setUrlState({ ok: false, text: result.reason });
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);

    if (mode === "files" && vault) {
      const files = file ? [file] : [];
      const out = await perform(() => attachFiles(vault.id, files), `${files.length} file added.`);
      setSubmitting(false);
      if (out) onClose();
      return;
    }

    const out = await perform(async () => {
      const v = await createVault(
        { project: project.trim(), clientEmail: email.trim(), amountCents: cents, kind, description: description.trim() },
        { draft: false }
      );
      if (file && scan === "pass") await attachFiles(v.id, [file]);
      return v;
    });

    setSubmitting(false);
    if (!out) return;
    setCreated(out);
    onCreated(out);
  };

  const copyCode = () => {
    if (!created?.inviteCode) return;
    void navigator.clipboard?.writeText(inviteLink(created.inviteCode)).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };

  return (
    <>
      <button type="button" className="fd-scrim" aria-label="Close the drawer" onClick={onClose} />
      <aside className="fd-drawer" role="dialog" aria-modal="true" aria-label="New vault">
        <header className="fd-drawer-head">
          <h2 className="fd-h2">{created ? "Vault created." : mode === "files" ? "Add files" : "New vault"}</h2>
          <button type="button" className="fd-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {!created && (
          <div className="fd-drawer-steps" aria-label="Steps">
            {STEPS.map((label, i) => (
              <span key={label} className="fd-dstep" data-state={i < step ? "done" : i === step ? "current" : "todo"}>
                <span className="fd-dstep-node" aria-hidden="true">
                  {i < step && <Check width="11" height="11" />}
                </span>
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="fd-drawer-body">
          {created ? (
            <div className="fd-success">
              <span className="fd-success-ring" aria-hidden="true">
                <Check width="26" height="26" />
              </span>
              <p className="fd-success-text">
                We sent an invite to {created.clientEmail} (mock). Give them the code, or send the link.
              </p>
              <p className="fd-code">{created.inviteCode}</p>
              <button type="button" className="fd-btn fd-btn-soft" onClick={copyCode}>
                <Copy width="13" height="13" /> {copied ? "Copied" : "Copy invite link"}
              </button>
            </div>
          ) : step === 0 ? (
            <>
              <label className="fd-field">
                <span className="fd-label">PROJECT NAME</span>
                <input
                  ref={firstField}
                  className="fd-input"
                  value={project}
                  maxLength={60}
                  onChange={(e) => setProject(e.target.value)}
                  autoComplete="off"
                />
              </label>

              <label className="fd-field">
                <span className="fd-label">CLIENT EMAIL</span>
                <input
                  className="fd-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </label>

              <label className="fd-field">
                <span className="fd-label">AMOUNT (USD)</span>
                <input
                  className="fd-input"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="180.00"
                />
              </label>
              <p className="fd-mono fd-estimate">
                YOU RECEIVE ABOUT {formatCents(breakdown.payoutCents)} ON {formatCents(breakdown.amountCents)}
              </p>

              <fieldset className="fd-fieldset">
                <legend className="fd-label">TYPE</legend>
                <div className="fd-seg" role="radiogroup" aria-label="Type">
                  {(["web", "design", "other"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={kind === k}
                      className="fd-seg-item"
                      data-on={kind === k ? "true" : undefined}
                      onClick={() => setKind(k)}
                    >
                      {k === "web" ? "Web app" : k === "design" ? "Design files" : "Other"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="fd-field">
                <span className="fd-label">DESCRIPTION (OPTIONAL)</span>
                <textarea
                  className="fd-input fd-textarea"
                  maxLength={160}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <span className="fd-count">{description.length}/160</span>
              </label>
            </>
          ) : step === 1 ? (
            <>
              <div className="fd-seg" role="radiogroup" aria-label="Deliverable kind">
                <button
                  type="button"
                  role="radio"
                  aria-checked={tab === "zip"}
                  className="fd-seg-item"
                  data-on={tab === "zip" ? "true" : undefined}
                  onClick={() => setTab("zip")}
                >
                  Upload zip
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={tab === "url"}
                  className="fd-seg-item"
                  data-on={tab === "url" ? "true" : undefined}
                  onClick={() => setTab("url")}
                >
                  Staging URL
                </button>
              </div>

              {tab === "zip" ? (
                <>
                  <div
                    className="fd-drop"
                    data-drag={dragging ? "true" : undefined}
                    data-fail={scan === "fail" ? "true" : undefined}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      takeFile(e.dataTransfer.files?.[0]);
                    }}
                  >
                    <span className="fd-drop-glyph" aria-hidden="true">
                      <VaultGlyph width="26" height="26" />
                    </span>
                    <p className="fd-drop-text">Drop a .zip here or browse</p>
                    <button type="button" className="fd-btn fd-btn-soft" onClick={() => fileInput.current?.click()}>
                      Browse
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept=".zip"
                      className="fd-sr"
                      onChange={(e) => takeFile(e.target.files?.[0] ?? undefined)}
                    />
                  </div>

                  {file && (
                    <div className="fd-file">
                      <span className="fd-file-name">{file.name}</span>
                      <span className="fd-mono">{Math.round(file.sizeBytes / 1024)} KB</span>
                      <button
                        type="button"
                        className="fd-btn fd-btn-ghost"
                        onClick={() => {
                          setFile(null);
                          setScan("idle");
                          setChecks(SCAN_STEPS.map((s) => ({ step: s, state: "queued" })));
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  <ul className="fd-scan" aria-live="polite">
                    {checks.map((c) => (
                      <li key={c.step} className="fd-scan-row" data-state={c.state}>
                        <span className="fd-scan-node" aria-hidden="true">
                          {c.state === "pass" && <Check width="11" height="11" />}
                          {c.state === "running" && <span className="fd-spin" />}
                        </span>
                        <span className="fd-scan-label">{c.step}</span>
                        <span className="fd-scan-state">{c.state.toUpperCase()}</span>
                      </li>
                    ))}
                  </ul>

                  {scan === "fail" && scanReason && (
                    <p className="fd-inline-error" role="alert">
                      {scanReason} Remove the file and try again.
                    </p>
                  )}
                </>
              ) : (
                <div className="fd-field">
                  <span className="fd-label">STAGING URL</span>
                  <div className="fd-url">
                    <input
                      className="fd-input"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setUrlState(null);
                      }}
                      placeholder="https://preview.example.dev"
                    />
                    <button type="button" className="fd-btn fd-btn-soft" onClick={checkUrl}>
                      Check URL
                    </button>
                  </div>
                  {urlState && (
                    <p className={urlState.ok ? "fd-url-ok" : "fd-inline-error"} role="status">
                      {urlState.ok && <span className="fd-live-dot" aria-hidden="true" />}
                      {urlState.text}
                    </p>
                  )}
                </div>
              )}

              <p className="fd-note">WE NEVER RUN YOUR CODE. UPLOADS ARE SCANNED AND HASHED.</p>
              <p className="fd-note dim">
                Limits: {ARCHIVE_LIMITS.maxCompressedBytes / 1024 / 1024} MB compressed,{" "}
                {ARCHIVE_LIMITS.maxUncompressedBytes / 1024 / 1024} MB expanded,{" "}
                {ARCHIVE_LIMITS.maxEntries} entries.
              </p>
            </>
          ) : (
            <>
              <dl className="fd-summary">
                <div>
                  <dt>PROJECT</dt>
                  <dd>{project}</dd>
                </div>
                <div>
                  <dt>CLIENT</dt>
                  <dd>{email}</dd>
                </div>
                <div>
                  <dt>AMOUNT</dt>
                  <dd>{formatCents(breakdown.amountCents)}</dd>
                </div>
                <div>
                  <dt>TYPE</dt>
                  <dd>{kind}</dd>
                </div>
                <div>
                  <dt>DELIVERABLES</dt>
                  <dd>{file ? `${file.name} · ${Math.round(file.sizeBytes / 1024)} KB` : `${url} (staging)`}</dd>
                </div>
                <div>
                  <dt>MANIFEST</dt>
                  <dd className="fd-mono">
                    {hash ? `${hash.slice(0, 12)}…` : "not hashed yet"} <span className="fd-mock">MOCK</span>
                  </dd>
                </div>
              </dl>

              <div className="fd-fee">
                <p>
                  <span>AMOUNT</span>
                  <span>{formatCents(breakdown.amountCents)}</span>
                </p>
                <p>
                  <span>VAULTLANCE FEE 5%</span>
                  <span>−{formatCents(breakdown.vaultlanceFeeCents)}</span>
                </p>
                <p>
                  <span>PAYPAL FEE (EST.)</span>
                  <span>−{formatCents(breakdown.paypalFeeCents)}</span>
                </p>
                <p className="fd-fee-total">
                  <span>YOU RECEIVE (EST.)</span>
                  <span>{formatCents(breakdown.payoutCents)}</span>
                </p>
              </div>
              <p className="fd-note dim">The PayPal fee is an estimate.</p>
              {error && <p className="fd-inline-error">{error}</p>}
            </>
          )}
        </div>

        <footer className="fd-drawer-foot">
          {created ? (
            <>
              <button type="button" className="fd-btn fd-btn-primary fd-btn-tall" onClick={onClose}>
                Done
              </button>
              <button
                type="button"
                className="fd-btn fd-btn-soft fd-btn-tall"
                onClick={() => {
                  setCreated(null);
                  setStep(0);
                  setProject("");
                  setEmail("");
                  setAmount("");
                  setFile(null);
                  setScan("idle");
                  setHash(null);
                }}
              >
                Create another
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="fd-btn fd-btn-soft fd-btn-tall"
                onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
              >
                {step === 0 ? "Cancel" : "Back"}
              </button>
              {step < 2 ? (
                <button
                  type="button"
                  className="fd-btn fd-btn-primary fd-btn-tall"
                  disabled={step === 0 ? !detailsOk : !deliveryOk}
                  onClick={() => setStep(step + 1)}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="fd-btn fd-btn-primary fd-btn-tall"
                  disabled={submitting}
                  onClick={() => void submit()}
                >
                  {submitting ? "Working…" : mode === "files" ? "Attach files" : "Create & invite client"}
                </button>
              )}
            </>
          )}
        </footer>
      </aside>
    </>
  );
}
