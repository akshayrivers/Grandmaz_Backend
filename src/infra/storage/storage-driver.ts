import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/** Bytes behind an asset id. Implementations must refuse keys that escape their root. */
export interface StorageDriver {
  put(key: string, bytes: Buffer): Promise<void>;
  open(key: string): Promise<Buffer | null>;
}

export class LocalDiskStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!/^[A-Za-z0-9/_-]{1,200}$/.test(key) || key.includes("..")) {
      throw new Error("Invalid storage key");
    }
    const root = path.resolve(this.root);
    const full = path.resolve(root, key);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }

  async open(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }
}
