import type { ButtonHTMLAttributes, ReactNode } from "react";
import { NavLink } from "react-router";

export function Screen({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-24 pt-2">
      {title && (
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {right}
        </header>
      )}
      {children}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-bg font-medium",
  secondary: "bg-surface-2 text-text",
  ghost: "bg-transparent text-muted",
  danger: "bg-again/20 text-again",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-xl px-4 py-3 text-base active:opacity-70 disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-4 ${className}`}>{children}</section>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

const tabs: { to: string; label: string; icon: string }[] = [
  { to: "/", label: "Today", icon: "◎" },
  { to: "/entries", label: "Words", icon: "≡" },
  { to: "/import", label: "Import", icon: "＋" },
  { to: "/translate", label: "Translate", icon: "⇄" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export function NavBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-surface-2 bg-bg/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-2 text-xs ${isActive ? "text-accent" : "text-muted"}`
            }
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 p-8 text-muted">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-accent" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
