/**
 * Where the app is running. Every native branch in the app goes through here,
 * so the web build (pnpm dev, the jsdom smoke test, the frozen web app) keeps
 * its phase-1 behaviour untouched.
 */
import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function platform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

export type NativeErrorCode = "unavailable" | "denied" | "busy" | "notFound" | "cancelled" | "failed";

export class NativeError extends Error {
  constructor(
    public readonly code: NativeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class NativeUnavailableError extends NativeError {
  constructor(what: string) {
    super("unavailable", `${what} is only available in the native app`);
  }
}

/** Turn a rejected plugin call into a NativeError with a code the UI can branch on. */
export function toNativeError(e: unknown, fallback: NativeErrorCode = "failed"): NativeError {
  if (e instanceof NativeError) return e;
  const o = e as { code?: string; message?: string } | undefined;
  const code = (o?.code as NativeErrorCode | undefined) ?? fallback;
  return new NativeError(code, o?.message ?? String(e));
}
