/**
 * storage.supabase.ts — the same storage contract, backed by a private bucket.
 *
 * The local adapter writes to the container's disk, which on Fly is ephemeral
 * and per-machine: a deliverable uploaded to one machine vanished on the next
 * deploy, and the signed-download route could never sign an object that was
 * never in the bucket. When Supabase is configured, the bytes go there instead.
 */
import { AppError, NotFoundError } from "../shared/errors.js";
import { supabase, isSupabaseConfigured } from "../shared/supabaseClient.js";
import type { IStorageAdapter } from "./storage.adapter.js";

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "vault-files";

export class SupabasePrivateStorageAdapter implements IStorageAdapter {
  constructor(private bucket: string = STORAGE_BUCKET) {}

  private client() {
    if (!isSupabaseConfigured() || !supabase) {
      throw new AppError("Supabase storage is not configured.", 503, "STORAGE_UNAVAILABLE");
    }
    return supabase;
  }

  async save(key: string, buffer: Buffer): Promise<string> {
    const { error } = await this.client()
      .storage.from(this.bucket)
      .upload(key, new Uint8Array(buffer), { upsert: true, contentType: "application/octet-stream" });
    if (error) {
      throw new AppError(
        `Could not store the deliverable (${error.message}). Create a private "${this.bucket}" bucket if it is missing.`,
        502,
        "STORAGE_WRITE_FAILED"
      );
    }
    return key;
  }

  async read(key: string): Promise<Buffer> {
    const { data, error } = await this.client().storage.from(this.bucket).download(key);
    if (error || !data) throw new NotFoundError("The stored deliverable is missing.", "FILE_CONTENT_MISSING");
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    await this.client().storage.from(this.bucket).remove([key]);
  }

  async exists(key: string): Promise<boolean> {
    const { data } = await this.client().storage.from(this.bucket).list("", { search: key, limit: 1 });
    return Boolean(data?.some((entry) => entry.name === key));
  }
}
