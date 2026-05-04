/**
 * Atomic JSON store utility — prevents race conditions and corrupted files.
 *
 * Usage:
 *   import { withLock, atomicWriteJson, safeReadJson } from "@/lib/storage/atomic-store";
 *
 *   await withLock(STORE_PATH, async () => {
 *     const store = await safeReadJson(STORE_PATH, { items: [] });
 *     store.items.push(newItem);
 *     await atomicWriteJson(STORE_PATH, store);
 *   });
 *
 * Features:
 * - In-process mutex per file path (serializes concurrent writers)
 * - Atomic write via tmp file + rename (POSIX atomic)
 * - Distinguishes "missing file" from "corrupt JSON"
 * - On corruption: renames to .corrupt.{ts} and returns default
 */

import fs from "fs/promises";
import path from "path";
import { log } from "@/lib/logger";

// Per-file mutex chain
const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const prev = locks.get(key) ?? Promise.resolve();
  // Chain next to tail; catch errors so one failure doesn't poison the chain
  const next = prev.then(fn, fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    // Clean up if we're still the tail
    if (locks.get(key) === next) locks.delete(key);
  }
}

/**
 * Atomic write: write to tmp file in same dir, then rename.
 * On POSIX, rename within the same filesystem is atomic.
 */
export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const serialized = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, serialized, "utf-8");
  await fs.rename(tmp, filePath);
}

/**
 * Safe read with corruption recovery.
 * - ENOENT → returns default silently (fresh install)
 * - Parse error → logs + renames corrupt file to .corrupt.{ts} → returns default
 */
export async function safeReadJson<T>(filePath: string, defaultValue: T): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return defaultValue;
    log.error({ scope: "atomic-store", file: filePath, err: err.message }, "read failed");
    return defaultValue;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    // Corruption! Preserve the bad file for forensics and return default.
    const corruptPath = `${filePath}.corrupt.${Date.now()}`;
    log.error(
      { scope: "atomic-store", file: filePath, corruptPath, err: (e as Error).message },
      "CORRUPT JSON — moved to .corrupt file",
    );
    try {
      await fs.rename(filePath, corruptPath);
    } catch { /* best-effort */ }
    return defaultValue;
  }
}

/** Convenience: full read-modify-write in one call. */
export async function updateJsonStore<T>(
  filePath: string,
  defaultValue: T,
  mutator: (current: T) => T | Promise<T>
): Promise<T> {
  return withLock(filePath, async () => {
    const current = await safeReadJson(filePath, defaultValue);
    const updated = await mutator(current);
    await atomicWriteJson(filePath, updated);
    return updated;
  });
}
