/**
 * Facade over the in-app CloudFilesPlugin: text files in the iCloud Drive
 * container's Documents folder. `CloudFiles` is the interface the sync engine
 * uses, so tests can substitute an in-memory one.
 */
import { registerPlugin } from "@capacitor/core";
import { toNativeError } from "./platform";

export interface CloudEntry {
  name: string;
  modifiedAt: string;
  size: number;
  downloaded: boolean;
}

export interface CloudFiles {
  available(): Promise<boolean>;
  /** undefined when the file does not exist */
  read(path: string): Promise<string | undefined>;
  write(path: string, text: string): Promise<void>;
  list(dir: string): Promise<CloudEntry[]>;
  delete(path: string): Promise<void>;
}

interface CloudFilesPlugin {
  available(): Promise<{ available: boolean; path: string }>;
  read(o: { path: string; waitSeconds?: number }): Promise<{ text: string }>;
  write(o: { path: string; text: string }): Promise<{ bytes: number }>;
  list(o: { dir: string }): Promise<{ entries: CloudEntry[] }>;
  delete(o: { path: string }): Promise<void>;
}

const Plugin = registerPlugin<CloudFilesPlugin>("CloudFiles");

export class NativeCloudFiles implements CloudFiles {
  async available(): Promise<boolean> {
    try {
      return (await Plugin.available()).available;
    } catch {
      return false;
    }
  }
  async read(path: string): Promise<string | undefined> {
    try {
      return (await Plugin.read({ path })).text;
    } catch (e) {
      const err = toNativeError(e);
      if (err.code === "notFound") return undefined;
      throw err;
    }
  }
  async write(path: string, text: string): Promise<void> {
    try {
      await Plugin.write({ path, text });
    } catch (e) {
      throw toNativeError(e);
    }
  }
  async list(dir: string): Promise<CloudEntry[]> {
    try {
      return (await Plugin.list({ dir })).entries;
    } catch (e) {
      throw toNativeError(e);
    }
  }
  async delete(path: string): Promise<void> {
    try {
      await Plugin.delete({ path });
    } catch (e) {
      throw toNativeError(e);
    }
  }
}
