import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router";
import { NavBar, Spinner } from "./components/ui";
import { repo } from "./services";
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

function Shell() {
  const location = useLocation();
  const hideNav = location.pathname.startsWith("/review");
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
    seedIfNeeded(repo)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <Spinner label="Preparing…" />;
  return (
    <BrowserRouter>
      {error && <div className="bg-again/20 p-2 text-center text-sm text-again">{error}</div>}
      <Shell />
    </BrowserRouter>
  );
}
