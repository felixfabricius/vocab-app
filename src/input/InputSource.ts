/**
 * EXT: input — anything that grades cards besides touch. The review screen
 * hands an InputSource these handlers; the source never touches the DOM or
 * the session state directly.
 */
import type { GradeName, ReviewMode } from "@/core/types";

export interface InputHandlers {
  flip(): void;
  grade(g: GradeName, mode: ReviewMode): void;
  /** speak the back of the current card again */
  repeatAudio(): void;
  /** leave the current card ungraded for today */
  skip(): void;
  isFlipped(): boolean;
}

export interface InputSource {
  attach(handlers: InputHandlers): void;
  detach(): void;
}
