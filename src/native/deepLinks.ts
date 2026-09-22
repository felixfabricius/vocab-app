/**
 * `alaluna://` deep links from the widgets and controls (M6).
 *   alaluna://translate?dir=en-es|es-en  → /translate?dir=…&focus=1
 */
import { App as CapApp } from "@capacitor/app";

export function routeForDeepLink(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== "alaluna:") return undefined;
  const target = (u.host || u.pathname.replace(/^\/+/, "")).toLowerCase();
  if (target === "translate") {
    const dir = u.searchParams.get("dir");
    const q = new URLSearchParams({ focus: "1" });
    if (dir === "en-es" || dir === "es-en") q.set("dir", dir);
    return `/translate?${q.toString()}`;
  }
  return undefined;
}

let launchUrlHandled = false;

/**
 * Cold start (launch URL, acted on once per process) and warm start (appUrlOpen).
 * Returns the unsubscribe function.
 */
export function installDeepLinks(navigate: (route: string) => void): () => void {
  if (!launchUrlHandled) {
    launchUrlHandled = true;
    void CapApp.getLaunchUrl().then((r) => {
      const route = r?.url ? routeForDeepLink(r.url) : undefined;
      if (route) navigate(route);
    });
  }
  const handle = CapApp.addListener("appUrlOpen", ({ url }) => {
    const route = routeForDeepLink(url);
    if (route) navigate(route);
  });
  return () => void handle.then((h) => h.remove());
}
