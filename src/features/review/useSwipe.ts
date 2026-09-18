import { useCallback, useRef, useState } from "react";

export type SwipeDir = "left" | "right" | "up";

export interface SwipeState {
  dx: number;
  dy: number;
  dragging: boolean;
}

/**
 * Pointer-based swipe recogniser for the review card. Horizontal swipes past
 * `threshold` fire left/right; a mostly vertical upward swipe fires up.
 * A short movement counts as a tap.
 */
export function useSwipe(opts: {
  enabled: boolean;
  threshold?: number;
  onSwipe: (dir: SwipeDir) => void;
  onTap: () => void;
}) {
  const threshold = opts.threshold ?? 90;
  const [state, setState] = useState<SwipeState>({ dx: 0, dy: 0, dragging: false });
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setState({ dx: 0, dy: 0, dragging: true });
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current || start.current.id !== e.pointerId) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      setState({ dx: opts.enabled ? dx : 0, dy: opts.enabled ? Math.min(dy, 0) : 0, dragging: true });
    },
    [opts.enabled],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current || start.current.id !== e.pointerId) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      start.current = null;
      setState({ dx: 0, dy: 0, dragging: false });
      const dist = Math.hypot(dx, dy);
      if (dist < 12) {
        opts.onTap();
        return;
      }
      if (!opts.enabled) return;
      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) {
        opts.onSwipe(dx > 0 ? "right" : "left");
      } else if (dy <= -threshold && Math.abs(dy) > Math.abs(dx)) {
        opts.onSwipe("up");
      }
    },
    [opts, threshold],
  );

  const onPointerCancel = useCallback(() => {
    start.current = null;
    setState({ dx: 0, dy: 0, dragging: false });
  }, []);

  return { state, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
