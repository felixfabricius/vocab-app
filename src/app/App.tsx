import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router";
import { installDeepLinks } from "@/native/deepLinks";
import { App as CapApp } from "@capacitor/app";
import { NavBar, Spinner } from "./components/ui";
import { getCloudSync, repo } from "./services";
import { isNative } from "@/native/platform";
import { seedIfNeeded } from "./seed";
import { TodayScreen } from "@/features/today/TodayScreen";
import { ReviewScreen } from "@/features/review/ReviewScreen";
import { EntriesScreen } from "@/features/entries/EntriesScreen";
import { EntryScreen } from "@/features/entries/EntryScreen";
import { ImportScreen } from "@/features/import/ImportScreen";
import { BatchScreen } from "@/features/import/BatchScreen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { Diagnostics } from "@/features/settings/Diagnostics";
import { GrammarScreen } from "@/features/grammar/GrammarScreen";
import { TranslateScreen } from "@/features/translate/TranslateScreen";
import { StatsScreen } from "@/features/stats/StatsScreen";

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const hideNav = location.pathname.startsWith("/review");

  // Widgets and controls open alaluna:// links (M6). `navigate` changes identity on every
  // route change, so the listener is installed once and reads the latest navigate via a ref.
  const navRef = useRef(navigate);
  navRef.current = navigate;
  useEffect(() => {
    if (!isNative()) return;
    return installDeepLinks((route) => navRef.current(route));
  }, []);
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/review" element={<ReviewScreen />} />
        <Route path="/entries" element={<EntriesScreen />} />
        <Route path="/entries/:id" element={<EntryScreen />} />
        <Route path="/import" element={<ImportScreen />} />
        <Route path="/import/batch/:id" element={<BatchScreen />} />
        <Route path="/translate" element={<TranslateScreen />} />
        <Route path="/grammar" element={<GrammarScreen />} />
        <Route path="/stats" element={<StatsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/diagnostics" element={<Diagnostics />} />
        <Route path="*" element={<TodayScreen />} />
      </Routes>
      {!hideNav && <NavBar />}
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      try {
        // A fresh install restores from the iCloud snapshot before the seed runs (M5).
        try {
          const r = await getCloudSync().restoreIfNeeded();
          if (r !== "none") console.info(`cloud: ${r} from iCloud snapshot`);
        } catch (e) {
          console.warn("cloud restore failed", e);
        }
        await seedIfNeeded(repo);
        // 30-day trash: purge entries trashed more than 30 days ago.
        await repo.purgeTrashedBefore(new Date(Date.now() - 30 * 86_400_000).toISOString());
      } catch (e) {
        setError(String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Going to the background: drain the outbox to iCloud, snapshot when due.
  useEffect(() => {
    if (!isNative()) return;
    const handle = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) void getCloudSync().onBackground().catch((e) => console.warn("cloud sync failed", e));
    });
    return () => void handle.then((h) => h.remove());
  }, []);

  if (!ready) return <Spinner label="Preparing…" />;
  return (
    <BrowserRouter>
      {error && <div className="bg-again/20 p-2 text-center text-sm text-again">{error}</div>}
      <Shell />
    </BrowserRouter>
  );
}
