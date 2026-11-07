/**
 * samples.ts — the deliveries bundled with the API.
 *
 * Both are real archives in `backend/playground-samples`, read from disk and
 * uploaded through the same UploadService the product uses. Nothing here
 * fabricates a check result: the complete package has documentation and a
 * passing JUnit log, the incomplete one has neither, and the deterministic
 * runner decides what that means.
 */
import fs from "fs/promises";
import path from "path";

export type SampleKind = "complete" | "incomplete";

interface SampleFile {
  /** the name the vault stores and the checks read */
  name: string;
  /** the bundled file's name */
  source: string;
  mimeType: string;
}

const COMPLETE: SampleFile[] = [
  { name: "northwind-web-app.zip", source: "complete-web-app.zip", mimeType: "application/zip" },
  { name: "northwind-logo-pack.zip", source: "logo-pack.zip", mimeType: "application/zip" },
  { name: "README.md", source: "complete-README.md", mimeType: "text/markdown" },
  { name: "test-log.txt", source: "complete-test-log.txt", mimeType: "text/plain" },
];

const INCOMPLETE: SampleFile[] = [
  { name: "late-web-app.zip", source: "incomplete-web-app.zip", mimeType: "application/zip" },
  { name: "northwind-logo-pack.zip", source: "logo-pack.zip", mimeType: "application/zip" },
  { name: "test-log.txt", source: "incomplete-test-log.txt", mimeType: "text/plain" },
];

export const sampleLabel = (kind: SampleKind): string =>
  kind === "complete" ? "Complete sample project" : "Uncomplete sample project";

const sampleDirectory = () => path.resolve(process.cwd(), "playground-samples");

export async function readSampleFiles(kind: SampleKind): Promise<Array<{ name: string; mimeType: string; buffer: Buffer }>> {
  const files = kind === "complete" ? COMPLETE : INCOMPLETE;
  const directory = sampleDirectory();
  const out: Array<{ name: string; mimeType: string; buffer: Buffer }> = [];
  for (const file of files) {
    const buffer = await fs.readFile(path.join(directory, file.source));
    out.push({ name: file.name, mimeType: file.mimeType, buffer });
  }
  return out;
}

export function sampleDescription(kind: SampleKind): string {
  return kind === "complete"
    ? "Northwind booking web app and brand pack. Documentation and a passing test log are included."
    : "Late Northwind web app build and brand pack. The handoff is missing documentation and its test log records failures.";
}
