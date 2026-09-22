import { useCallback, useRef, useState } from "react";

export type SwipeDir = "left" | "right";

export interface SwipeState {
  dx: number;
  dragging: boolean;
}

/**
 * Pointer-based swipe recogniser for the review card. Horizontal swipes past
 * `threshold` fire left (Again) / right (Good). A short movement counts as a
 * tap. Vertical movement is ignored (the up-swipe grade was removed).
 */
export function useSwipe(opts: {
  enabled: boolean;
  threshold?: number;
  onSwipe: (dir: SwipeDir) => void;
  onTap: () => void;
}) {
  const threshold = opts.threshold ?? 90;
  const [state, setState] = useState<SwipeState>({ dx: 0, dragging: false });
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setState({ dx: 0, dragging: true });
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current || start.current.id !== e.pointerId) return;
      const dx = e.clientX - start.current.x;
      setState({ dx: opts.enabled ? dx : 0, dragging: true });
    },
    [opts.enabled],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current || start.current.id !== e.pointerId) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      start.current = null;
      setState({ dx: 0, dragging: false });
      if (Math.hypot(dx, dy) < 12) {
        opts.onTap();
        return;
      }
      if (!opts.enabled) return;
      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) {
        opts.onSwipe(dx > 0 ? "right" : "left");
      }
    },
    [opts, threshold],
  );

  const onPointerCancel = useCallback(() => {
    start.current = null;
    setState({ dx: 0, dragging: false });
  }, []);

  return { state, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
