import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Diagnostics } from "@/features/settings/Diagnostics";

export function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="*" element={<Navigate to="/diagnostics" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
