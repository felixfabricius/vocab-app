/**
 * In-app log for debugging without a Mac: console output, uncaught errors and
 * unhandled rejections go into a ring buffer that Diagnostics shows and copies.
 * Persisted in localStorage so a crash on the previous launch is still readable.
 */
const KEY = "alaluna.log";
const MAX = 500;

let lines: string[] = [];
let installed = false;
const listeners = new Set<() => void>();

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ""}`;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // storage may be unavailable; the in-memory buffer still works
  }
}

export function logLine(level: string, ...args: unknown[]) {
  const t = new Date().toISOString().slice(11, 23);
  lines.push(`${t} ${level} ${fmt(args)}`);
  if (lines.length > MAX) lines = lines.slice(-MAX);
  persist();
  for (const l of listeners) l();
}

export function getLog(): string[] {
  return lines;
}

export function clearLog() {
  lines = [];
  persist();
  for (const l of listeners) l();
}

export function subscribeLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function installLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) lines = (JSON.parse(saved) as string[]).slice(-MAX);
  } catch {
    lines = [];
  }
  const orig = { warn: console.warn.bind(console), error: console.error.bind(console), info: console.info.bind(console) };
  console.warn = (...a: unknown[]) => {
    logLine("warn", ...a);
    orig.warn(...a);
  };
  console.error = (...a: unknown[]) => {
    logLine("error", ...a);
    orig.error(...a);
  };
  console.info = (...a: unknown[]) => {
    logLine("info", ...a);
    orig.info(...a);
  };
  window.addEventListener("error", (e) => logLine("uncaught", e.message, `${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => logLine("rejection", e.reason));
  logLine("info", `app start ${navigator.userAgent}`);
}
