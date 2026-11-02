import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { uploadConfig } from "./upload.config.js";

export interface IStorageAdapter {
  save(key: string, buffer: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  getReadStream(key: string): fsSync.ReadStream;
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

export const storageAdapter = new LocalPrivateStorageAdapter();
