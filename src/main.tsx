import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "@/app/App";
import { installLog } from "@/app/log";
import { isNative } from "@/native/platform";
import "./index.css";

installLog();
// The native app serves its bundle from the app package; WKWebView's custom scheme handler has no service worker.
if (!isNative()) registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
