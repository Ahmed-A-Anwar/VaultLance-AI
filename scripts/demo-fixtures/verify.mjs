#!/usr/bin/env node
/**
 * demo-fixtures/verify.mjs — checks the two zips the way the audit will.
 *
 * Mirrors the JUnit branch of backend/src/audit/checks.ts (parseTestSummary)
 * and the extension/size rules, so a fixture can never "look" failing while
 * the real check reads it as passing.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const AdmZip = require("adm-zip");

const MAX_TOTAL_BYTES = 50_000_000;
const ALLOWED = new Set([".html", ".htm", ".css", ".js", ".md", ".txt", ".json", ".xml", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".zip", ".pdf"]);

function junitSummary(text) {
  const suite = text.match(/<testsuite\b([^>]*)>/i);
  if (!suite) return null;
  const attrs = suite[1];
  const n = (name) => Number((attrs.match(new RegExp(`${name}\\s*=\\s*["'](\\d+)["']`, "i")) || [])[1] || 0);
  const total = n("tests");
  const failed = n("failures") + n("errors");
  const skipped = n("skipped");
  if (total <= 0) return null;
  return { total, failed, skipped, passed: Math.max(0, total - failed - skipped) };
}

let bad = 0;
for (const version of ["v1", "v2"]) {
  const file = path.resolve(`scripts/demo-fixtures/corner-bean-${version}.zip`);
  /* read first: adm-zip's constructor rejects Windows paths with spaces */
  const zip = new AdmZip(fs.readFileSync(file));
  const entries = zip.getEntries();
  const names = entries.map((e) => e.entryName).sort();
  const totalSize = entries.reduce((sum, e) => sum + e.header.size, 0);
  const badExt = names.filter((n) => !ALLOWED.has(path.extname(n).toLowerCase()));
  const log = zip.readAsText("test-log.txt");
  const summary = junitSummary(log);
  const docs = names.filter((n) => /readme/i.test(n) || /\.(md|pdf|docx)$/i.test(n));
  const hasContact = names.includes("contact.html");

  const expectFailing = version === "v1";
  const ok =
    fs.statSync(file).size < 1_000_000 &&
    totalSize <= MAX_TOTAL_BYTES &&
    badExt.length === 0 &&
    docs.length > 0 &&
    summary !== null &&
    (expectFailing ? summary.failed === 1 : summary.failed === 0) &&
    (expectFailing ? !hasContact : hasContact);

  if (!ok) bad += 1;
  console.log(
    `${version}: ${(fs.statSync(file).size / 1024).toFixed(1)} kB | entries=${names.length} | contact=${hasContact} ` +
      `| junit ${summary?.passed} passed ${summary?.failed} failed | docs=${docs.length} | badExt=${badExt.length} ` +
      `| test-log check would ${summary.failed > 0 ? "FAIL" : "PASS"} | ${ok ? "OK" : "PROBLEM"}`
  );
  console.log(`   ${names.join(", ")}`);
}
process.exit(bad ? 1 : 0);
