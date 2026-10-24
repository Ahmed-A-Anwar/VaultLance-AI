import { unzipSync } from "fflate";

export type ManifestItem = {
  path: string;
  size: number;
  hash: string; // sha-256 hex, computed locally of entry bytes
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashBlob(file: File): Promise<ManifestItem> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return {
    path: file.webkitRelativePath || file.name,
    size: buf.byteLength,
    hash: await sha256Hex(buf),
  };
}

/* Read a .zip client-side: real paths, real byte sizes, real sha-256 per entry. */
export async function manifestFromZip(zipFile: File): Promise<ManifestItem[]> {
  const bytes = new Uint8Array(await zipFile.arrayBuffer());
  const entries = unzipSync(bytes);
  const items: ManifestItem[] = [];
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith("/") || path.startsWith("__MACOSX") || path.includes(".DS_Store")) continue;
    if (!data.byteLength) continue;
    items.push({ path, size: data.byteLength, hash: await sha256Hex(data) });
  }
  items.sort((a, b) => a.path.localeCompare(b.path));
  return items;
}
