import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "in.fabricius.vocab",
  appName: "¡A la luna!",
  webDir: "dist",
  // Origin https://localhost. Fixed forever: WKWebView storage (IndexedDB) is bound to it (PLAN-NATIVE D2).
  server: { iosScheme: "https" },
  ios: {
    contentInset: "never",
    allowsLinkPreview: false,
    backgroundColor: "#0f172a",
    // Screens scroll inside `.screen-scroll`; the web view itself must not (no rubber-banding under the swipe card).
    scrollEnabled: false,
  },
  plugins: { Keyboard: { resize: "native" } },
  // `cap sync` derives `.iOS(.v26)` from the deployment target; the default tools version 5.9 does not know it.
  experimental: { ios: { spm: { swiftToolsVersion: "6.2" } } },
};

export default config;
