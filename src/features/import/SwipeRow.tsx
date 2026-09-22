import { useRef, useState, type ReactNode } from "react";

/**
 * A list row that can be swiped horizontally to remove it. Vertical movement is
 * left to the scroll container (`touch-action: pan-y`), so the list still scrolls.
 */
export function SwipeRow({ children, onRemove, onTap, threshold = 80 }: { children: ReactNode; onRemove: () => void; onTap: () => void; threshold?: number }) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; horizontal?: boolean } | null>(null);

  function down(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function move(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (s.horizontal === undefined && Math.hypot(mx, my) > 8) s.horizontal = Math.abs(mx) > Math.abs(my);
    if (!s.horizontal) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDx(mx);
  }
  function up(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.horizontal) {
      setDx(0);
      if (Math.hypot(mx, my) < 8) onTap();
      return;
    }
    if (Math.abs(mx) >= threshold) {
      setLeaving(true);
      setDx(mx > 0 ? 600 : -600);
      setTimeout(onRemove, 180);
    } else {
      setDx(0);
    }
  }
  function cancel() {
    start.current = null;
    setDx(0);
  }

  const reveal = Math.min(1, Math.abs(dx) / threshold);
  return (
    <li className="relative overflow-hidden" style={{ touchAction: "pan-y" }}>
      <div className="absolute inset-0 flex items-center justify-between bg-again/30 px-4 text-sm text-again" style={{ opacity: reveal }}>
        <span>Remove</span>
        <span>Remove</span>
      </div>
      <div
        className={`relative bg-surface ${leaving ? "transition-transform duration-200" : dx === 0 ? "transition-transform duration-150" : ""}`}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
      >
        {children}
      </div>
    </li>
  );
}
