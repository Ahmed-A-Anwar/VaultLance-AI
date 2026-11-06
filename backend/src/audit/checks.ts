/**
 * Deterministic audit checks. The model never decides a result here.
 *
 * Files are metadata plus (when the storage adapter can read them) bytes.
 * Nothing in this module executes uploaded code or follows a URL redirect
 * without validating the destination first.
 */
import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import path from "path";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { storageAdapter } from "../uploads/storage.adapter.js";
import { uploadConfig } from "../uploads/upload.config.js";

export type AuditSource = "TEST LOG" | "PIXEL SCAN" | "HTTP PROBE" | "FILE INDEX";
export type AuditResult = "pass" | "warn" | "fail";

export interface AuditFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  storagePath?: string;
}

export interface AuditManifest {
  sha: string;
  fileCount: number;
  totalSizeBytes: number;
}

export interface AuditCheck {
  id: string;
  name: string;
  detail: string;
  source: AuditSource;
  result: AuditResult;
  state: AuditResult | "queued";
  rows: Array<{ label: string; value: string }>;
  swatch?: string;
}

export interface AuditContext {
  vaultId: string;
  files: AuditFile[];
  manifest?: AuditManifest | null;
  stagingUrl?: string | null;
}

export interface AuditEvidence {
  checkId: string;
  source: AuditSource;
  result: AuditResult;
  detail: string;
}

export interface AuditRun {
  checks: AuditCheck[];
  evidence: AuditEvidence[];
}

const MAX_TOTAL_BYTES = 50_000_000;
const ALLOWED_EXTENSIONS = new Set(uploadConfig.allowedExtensions);
const TEST_LOG_RE = /(junit|jest|pytest|test[-_. ]?log|tests?\.(xml|json|log|txt))/i;
const TEXT_RE = /\.(txt|log|xml|json|md|csv)$/i;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|svg)$/i;

const check = (
  id: string,
  name: string,
  detail: string,
  source: AuditSource,
  result: AuditResult,
  rows: Array<{ label: string; value: string }>,
  swatch?: string
): AuditCheck => ({ id, name, detail, source, result, state: "queued", rows, ...(swatch ? { swatch } : {}) });

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
  if (p[0] === 192 && p[1] === 0 && (p[2] === 0 || p[2] === 2)) return true;
  if (p[0] === 198 && (p[1] === 18 || p[1] === 19 || p[1] === 51)) return true;
  if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;
  if (p[0] >= 224) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (lower.startsWith("ff")) return true;
  if (lower.startsWith("::ffff:")) {
    const tail = lower.slice(7);
    if (net.isIPv4(tail)) return isPrivateIpv4(tail);
  }
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip.replace(/^\[|\]$/g, ""));
  return true;
}

export type UrlProblem =
  | "malformed"
  | "not_https"
  | "credentials"
  | "localhost"
  | "private"
  | "metadata";

export interface UrlValidation {
  ok: boolean;
  problem?: UrlProblem;
  url?: URL;
}

export function validateProbeUrl(raw: string): UrlValidation {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return { ok: false, problem: "malformed" };
  }
  if (url.protocol !== "https:") return { ok: false, problem: "not_https" };
  if (url.username || url.password) return { ok: false, problem: "credentials" };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0"
  ) {
    return { ok: false, problem: "localhost" };
  }
  if (
    host === "metadata.google.internal" ||
    host === "metadata.google" ||
    host === "169.254.169.254" ||
    host === "100.100.100.200" ||
    host === "fd00:ec2::254"
  ) {
    return { ok: false, problem: "metadata" };
  }
  if (net.isIP(host) && isBlockedAddress(host)) return { ok: false, problem: "private" };
  return { ok: true, url };
}

export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "metadata.google.internal" || host === "metadata.google") {
    throw new Error("metadata");
  }
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new Error("private");
    return;
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length) throw new Error("unresolved");
  for (const { address } of addresses) {
    if (isBlockedAddress(address)) throw new Error("private");
  }
}

export interface HttpProbeResult {
  ok: boolean;
  status: number | null;
  latencyMs: number;
  hops: number;
  finalUrl: string | null;
  error?: string;
}

export async function probeStagingUrl(raw: string): Promise<HttpProbeResult> {
  const validation = validateProbeUrl(raw);
  if (!validation.ok || !validation.url) {
    return { ok: false, status: null, latencyMs: 0, hops: 0, finalUrl: null, error: validation.problem };
  }

  const started = Date.now();
  let current = validation.url;
  let hops = 0;
  try {
    await assertPublicHost(current.hostname);
    for (; hops <= 5; hops++) {
      if (hops > 0) {
        const nextValue = validateProbeUrl(current.toString());
        if (!nextValue.ok || !nextValue.url) {
          return { ok: false, status: null, latencyMs: Date.now() - started, hops, finalUrl: null, error: nextValue.problem };
        }
        current = nextValue.url;
        await assertPublicHost(current.hostname);
      }

      const res = await fetch(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { "user-agent": "VaultLance-Audit/1.0" },
        signal: AbortSignal.timeout(8000),
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) {
          return { ok: false, status: res.status, latencyMs: Date.now() - started, hops, finalUrl: current.toString(), error: "redirect_without_location" };
        }
        current = new URL(location, current);
        if (hops >= 5) {
          return { ok: false, status: res.status, latencyMs: Date.now() - started, hops, finalUrl: current.toString(), error: "too_many_redirects" };
        }
        continue;
      }

      return {
        ok: res.ok,
        status: res.status,
        latencyMs: Date.now() - started,
        hops,
        finalUrl: current.toString(),
        ...(res.ok ? {} : { error: `http_${res.status}` }),
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      hops,
      finalUrl: current.toString(),
      error: err?.message === "timeout" ? "timeout" : String(err?.message || "unreachable"),
    };
  }
  return { ok: false, status: null, latencyMs: Date.now() - started, hops, finalUrl: current.toString(), error: "too_many_redirects" };
}

export interface TestSummary {
  framework: "junit" | "jest" | "pytest";
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export function parseTestSummary(text: string): TestSummary | null {
  const junit = text.match(/<testsuite\b([^>]*)>/i);
  if (junit) {
    const attrs = junit[1];
    const n = (name: string) => Number((attrs.match(new RegExp(`${name}\\s*=\\s*["'](\\d+)["']`, "i")) || [])[1] || 0);
    const total = n("tests");
    const failed = n("failures") + n("errors");
    const skipped = n("skipped");
    if (total > 0) return { framework: "junit", total, passed: Math.max(0, total - failed - skipped), failed, skipped };
  }

  const jest = text.match(/Tests:\s*(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(\d+)\s+passed/i);
  if (jest) {
    const failed = Number(jest[1] || 0);
    const skipped = Number(jest[2] || 0);
    const passed = Number(jest[3] || 0);
    return { framework: "jest", total: failed + skipped + passed, passed, failed, skipped };
  }

  const pytest = text.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/i);
  if (pytest) {
    const passed = Number(pytest[1] || 0);
    const failed = Number(pytest[2] || 0);
    const skipped = Number(pytest[3] || 0);
    return { framework: "pytest", total: passed + failed + skipped, passed, failed, skipped };
  }
  return null;
}

function isTestLog(file: AuditFile): boolean {
  return TEST_LOG_RE.test(file.name);
}

function isText(file: AuditFile): boolean {
  return TEXT_RE.test(file.name) || file.mimeType.startsWith("text/");
}

async function readFile(file: AuditFile): Promise<Buffer | null> {
  if (!file.storagePath) return null;
  try {
    return await storageAdapter.read(file.storagePath);
  } catch {
    return null;
  }
}

async function imageCheck(file: AuditFile, buffer: Buffer): Promise<AuditCheck> {
  try {
    const meta = await sharp(buffer).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const hasAlpha = Boolean(meta.hasAlpha);
    const raw = await sharp(buffer).resize(1, 1, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const [r, g, b] = [raw.data[0] || 0, raw.data[1] || 0, raw.data[2] || 0];
    const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    const small = width < 64 || height < 64;
    return check(
      `chk_image_${file.id}`,
      `Image: ${file.name}`,
      `${width} x ${height} · ${hasAlpha ? "alpha channel" : "no alpha"} · ${hex}`,
      "PIXEL SCAN",
      small ? "warn" : "pass",
      [
        { label: "dimensions", value: `${width} x ${height}` },
        { label: "alpha", value: hasAlpha ? "present" : "absent" },
        { label: "dominant", value: hex },
        { label: "format", value: meta.format || "unknown" },
      ],
      hex
    );
  } catch {
    return check(`chk_image_${file.id}`, `Image: ${file.name}`, "Could not decode image", "PIXEL SCAN", "fail", [
      { label: "file", value: file.name },
    ]);
  }
}

function zipCheck(file: AuditFile, buffer: Buffer): AuditCheck {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const symlinks = entries.filter((entry) => ((entry.header.attr >>> 16) & 0o170000) === 0o120000);
    if (symlinks.length) {
      return check(`chk_zip_${file.id}`, `Archive: ${file.name}`, "Symlink entry rejected", "FILE INDEX", "fail", [
        { label: "symlinks", value: String(symlinks.length) },
      ]);
    }
    const nested = entries.filter((entry) => /\.zip$/i.test(entry.entryName));
    for (const entry of nested) {
      try {
        const inner = new AdmZip(entry.getData());
        const innerEntries = inner.getEntries();
        const innerSymlink = innerEntries.some((e) => ((e.header.attr >>> 16) & 0o170000) === 0o120000);
        const innerNested = innerEntries.some((e) => /\.zip$/i.test(e.entryName));
        if (innerSymlink || innerNested) {
          return check(`chk_zip_${file.id}`, `Archive: ${file.name}`, "Nested archive exceeds depth 1 or contains a symlink", "FILE INDEX", "fail", [
            { label: "nested archive", value: entry.entryName },
            { label: "allowed depth", value: "1" },
          ]);
        }
      } catch {
        return check(`chk_zip_${file.id}`, `Archive: ${file.name}`, "Nested archive could not be inspected safely", "FILE INDEX", "fail", [
          { label: "nested archive", value: entry.entryName },
        ]);
      }
    }
    return check(`chk_zip_${file.id}`, `Archive: ${file.name}`, `${entries.length} entries · depth 1 max`, "FILE INDEX", "pass", [
      { label: "entries", value: String(entries.length) },
      { label: "nested archives", value: String(nested.length) },
      { label: "symlinks", value: "0" },
    ]);
  } catch {
    return check(`chk_zip_${file.id}`, `Archive: ${file.name}`, "Corrupt or unreadable archive", "FILE INDEX", "fail", [
      { label: "file", value: file.name },
    ]);
  }
}

export async function runDeterministicChecks(context: AuditContext): Promise<AuditRun> {
  const checks: AuditCheck[] = [];
  const files = context.files;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const badExtensions = files.filter((f) => !ALLOWED_EXTENSIONS.has(path.extname(f.name).toLowerCase()));
  const hashesValid = files.filter((f) => /^[a-f0-9]{64}$/i.test(f.sha256)).length;
  checks.push(
    check(
      "chk_file_types",
      "File types and hashes",
      badExtensions.length ? `${badExtensions.length} unsupported file type(s)` : `${files.length} files · SHA-256 hashes verified`,
      "FILE INDEX",
      badExtensions.length || hashesValid !== files.length ? "fail" : "pass",
      [
        { label: "files", value: String(files.length) },
        { label: "hashes valid", value: `${hashesValid}/${files.length}` },
        { label: "types", value: [...new Set(files.map((f) => path.extname(f.name).toLowerCase() || "none"))].join(", ") || "none" },
      ]
    )
  );

  checks.push(
    check(
      "chk_size",
      "Package size",
      `${formatBytes(totalSize)} total`,
      "FILE INDEX",
      totalSize > MAX_TOTAL_BYTES ? "fail" : totalSize > MAX_TOTAL_BYTES * 0.8 ? "warn" : "pass",
      [
        { label: "total", value: formatBytes(totalSize) },
        { label: "limit", value: formatBytes(MAX_TOTAL_BYTES) },
        { label: "files", value: String(files.length) },
      ]
    )
  );

  const docs = files.filter(
    (f) => /readme/i.test(f.name) || /\.(md|pdf|docx)$/i.test(f.name)
  );
  checks.push(
    check(
      "chk_docs",
      "Documentation",
      docs.length ? `${docs.length} documentation file(s)` : "No README or document included",
      "FILE INDEX",
      docs.length ? "pass" : "fail",
      [{ label: "documents", value: docs.map((f) => f.name).join(", ") || "none" }]
    )
  );

  let manifestMatch = false;
  if (context.manifest) {
    manifestMatch =
      context.manifest.fileCount === files.length &&
      context.manifest.totalSizeBytes === totalSize &&
      Boolean(context.manifest.sha && /^[a-f0-9]{64}$/i.test(context.manifest.sha));
  }
  checks.push(
    check(
      "chk_manifest",
      "Locked manifest",
      context.manifest ? (manifestMatch ? "Manifest matches the delivered files" : "Manifest does not match the delivered files") : "No manifest was locked",
      "TEST LOG",
      context.manifest ? (manifestMatch ? "pass" : "fail") : "warn",
      [
        { label: "locked files", value: context.manifest ? String(context.manifest.fileCount) : "none" },
        { label: "delivered", value: String(files.length) },
        { label: "sha256", value: context.manifest?.sha ? `${context.manifest.sha.slice(0, 12)}…` : "none" },
      ]
    )
  );

  const testFiles = files.filter(isTestLog);
  let testSummary: TestSummary | null = null;
  for (const file of testFiles) {
    const buffer = await readFile(file);
    if (!buffer || !isText(file)) continue;
    testSummary = parseTestSummary(buffer.toString("utf8"));
    if (testSummary) break;
  }
  checks.push(
    check(
      "chk_tests",
      "Test log",
      testSummary
        ? `${testSummary.passed} passed · ${testSummary.failed} failed · ${testSummary.skipped} skipped`
        : testFiles.length
          ? "Test log found but no JUnit, Jest or pytest summary"
          : "No test log was delivered",
      "TEST LOG",
      testSummary ? (testSummary.failed > 0 ? "fail" : "pass") : "warn",
      [
        { label: "framework", value: testSummary?.framework || "unknown" },
        { label: "passed", value: String(testSummary?.passed ?? 0) },
        { label: "failed", value: String(testSummary?.failed ?? 0) },
        { label: "skipped", value: String(testSummary?.skipped ?? 0) },
      ]
    )
  );

  for (const file of files.filter((f) => IMAGE_RE.test(f.name) || f.mimeType.startsWith("image/"))) {
    const buffer = await readFile(file);
    if (buffer) checks.push(await imageCheck(file, buffer));
  }

  for (const file of files.filter((f) => /\.zip$/i.test(f.name) || f.mimeType.includes("zip"))) {
    const buffer = await readFile(file);
    if (buffer) checks.push(zipCheck(file, buffer));
  }

  const stagingUrl = context.stagingUrl?.trim() || "";
  if (stagingUrl) {
    const probe = await probeStagingUrl(stagingUrl);
    checks.push(
      check(
        "chk_http",
        "Staging HTTPS probe",
        probe.ok ? `HTTP ${probe.status} in ${probe.latencyMs} ms` : `Probe failed: ${probe.error || "unreachable"}`,
        "HTTP PROBE",
        probe.ok ? "pass" : "fail",
        [
          { label: "status", value: probe.status === null ? "none" : String(probe.status) },
          { label: "latency", value: `${probe.latencyMs} ms` },
          { label: "redirects", value: String(probe.hops) },
          { label: "host", value: probe.finalUrl ? new URL(probe.finalUrl).hostname : "blocked" },
        ]
      )
    );
  }

  return {
    checks,
    evidence: checks.map((c) => ({ checkId: c.id, source: c.source, result: c.result, detail: c.detail })),
  };
}

export function stagingUrlFromText(text: string | null | undefined): string | null {
  const match = String(text || "").match(/https:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return validateProbeUrl(match[0]).ok ? match[0] : null;
}

export function checksHash(checks: AuditCheck[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(checks.map((c) => [c.id, c.result, c.detail]))).digest("hex");
}
