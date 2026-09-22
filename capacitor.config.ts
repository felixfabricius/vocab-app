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
    // Stays true in M1 (app unchanged); M2 moves scrolling into the Screen container and sets this to false.
    scrollEnabled: true,
  },
  plugins: { Keyboard: { resize: "native" } },
};

export default config;
