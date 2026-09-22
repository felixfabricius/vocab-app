/**
 * Facade over the in-app AudioSessionPlugin: session category and the remote
 * command centre (wired EarPods clicks).
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { toNativeError } from "./platform";

export type RemoteCommand = "toggle" | "next" | "previous";

interface AudioSessionPlugin {
  configure(o: { mode: "playback" | "playAndRecord" }): Promise<{ route: string[] }>;
  deactivate(): Promise<void>;
  remoteCommands(o: { enabled: boolean }): Promise<void>;
  addListener(event: "remote", fn: (e: { command: RemoteCommand }) => void): Promise<PluginListenerHandle>;
  addListener(event: "interruption", fn: (e: { type: "began" | "ended" }) => void): Promise<PluginListenerHandle>;
}

const AudioSession = registerPlugin<AudioSessionPlugin>("AudioSession");

export async function configureAudioSession(mode: "playback" | "playAndRecord"): Promise<string[]> {
  try {
    return (await AudioSession.configure({ mode })).route;
  } catch (e) {
    throw toNativeError(e);
  }
}

export async function deactivateAudioSession(): Promise<void> {
  try {
    await AudioSession.deactivate();
  } catch {
    // nothing to release
  }
}

export async function setRemoteCommands(enabled: boolean): Promise<void> {
  try {
    await AudioSession.remoteCommands({ enabled });
  } catch (e) {
    throw toNativeError(e);
  }
}

export function onRemoteCommand(fn: (command: RemoteCommand) => void): () => void {
  const h = AudioSession.addListener("remote", (e) => fn(e.command));
  return () => void h.then((x) => x.remove());
}

export function onInterruption(fn: (type: "began" | "ended") => void): () => void {
  const h = AudioSession.addListener("interruption", (e) => fn(e.type));
  return () => void h.then((x) => x.remove());
}
