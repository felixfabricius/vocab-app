/**
 * Wired EarPods (and any remote control): one click = Good (flips first when
 * needed), two clicks = Again, three clicks = repeat the audio.
 */
import { onRemoteCommand, setRemoteCommands, type RemoteCommand } from "@/native/audioSession";
import type { InputHandlers, InputSource } from "./InputSource";

export function mapRemoteCommand(command: RemoteCommand, h: InputHandlers): void {
  switch (command) {
    case "toggle":
      if (h.isFlipped()) h.grade("good", "audio");
      else h.flip();
      return;
    case "next":
      if (!h.isFlipped()) h.flip();
      h.grade("again", "audio");
      return;
    case "previous":
      h.repeatAudio();
      return;
  }
}

export class RemoteButtonsInput implements InputSource {
  private off: (() => void) | undefined;

  attach(handlers: InputHandlers) {
    this.detach();
    this.off = onRemoteCommand((c) => mapRemoteCommand(c, handlers));
    void setRemoteCommands(true).catch(() => undefined);
  }

  detach() {
    this.off?.();
    this.off = undefined;
    void setRemoteCommands(false).catch(() => undefined);
  }
}
