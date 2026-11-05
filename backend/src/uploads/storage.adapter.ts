import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { uploadConfig } from "./upload.config.js";
import { isSupabaseConfigured } from "../shared/supabaseClient.js";
import { SupabasePrivateStorageAdapter } from "./storage.supabase.js";

export interface IStorageAdapter {
  save(key: string, buffer: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  /* only the local adapter can hand back a stream; bucket reads are async */
  getReadStream?(key: string): fsSync.ReadStream;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class LocalPrivateStorageAdapter implements IStorageAdapter {
  private baseDir: string;

  constructor(baseDir: string = uploadConfig.storageDirectory) {
    this.baseDir = path.resolve(baseDir);
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fsSync.existsSync(this.baseDir)) {
      fsSync.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    }
  }

  private getSafePath(key: string): string {
    // Sanitize key to ensure no path traversal
    const safeKey = path.basename(key);
    return path.join(this.baseDir, safeKey);
  }

  public async save(key: string, buffer: Buffer): Promise<string> {
    this.ensureDirectoryExists();
    const filePath = this.getSafePath(key);
    await fs.writeFile(filePath, buffer, { mode: 0o600 });
    return filePath;
  }

  public async read(key: string): Promise<Buffer> {
    const filePath = this.getSafePath(key);
    return fs.readFile(filePath);
  }

  public getReadStream(key: string): fsSync.ReadStream {
    const filePath = this.getSafePath(key);
    return fsSync.createReadStream(filePath);
  }

  public async delete(key: string): Promise<void> {
    const filePath = this.getSafePath(key);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore if already deleted
    }
  }

  public async exists(key: string): Promise<boolean> {
    const filePath = this.getSafePath(key);
    return fsSync.existsSync(filePath);
  }
}

/* Bytes belong in the bucket whenever it is configured, because that is the
   only place the signed-download route can reach and the only copy that
   survives a redeploy. Local disk remains for tests and offline development. */
export const storageAdapter: IStorageAdapter = isSupabaseConfigured()
  ? new SupabasePrivateStorageAdapter()
  : new LocalPrivateStorageAdapter();
