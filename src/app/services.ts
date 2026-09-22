/**
 * App-level singletons and small factories that bind core logic to storage
 * and settings. UI code imports from here rather than constructing things.
 */
import type { FSRS } from "ts-fsrs";
import { makeScheduler } from "@/core/scheduler/fsrs";
import type { Priority, Settings } from "@/core/types";
import { getRepository } from "@/storage/DexieRepository";
import type { Repository } from "@/storage/Repository";
import type { AudioPlayer } from "@/audio/AudioPlayer";
import { WebSpeechPlayer } from "@/audio/WebSpeechPlayer";
import { NativeTtsPlayer } from "@/audio/NativeTtsPlayer";
import { isNative } from "@/native/platform";
import { NativeCloudFiles } from "@/native/cloudFiles";
import { CloudSync, MemoryCloudFiles } from "@/storage/cloudSync";

export const repo: Repository = getRepository();

let player: AudioPlayer | undefined;
/** EXT: audio — native builds speak through AVSpeechSynthesizer, the web app through Web Speech. */
export function getAudio(): AudioPlayer {
  if (!player) player = isNative() ? new NativeTtsPlayer() : new WebSpeechPlayer();
  return player;
}

let cloud: CloudSync | undefined;
/** EXT: storage — iCloud snapshot + change log; on the web a disabled in-memory stand-in. */
export function getCloudSync(): CloudSync {
  if (!cloud) cloud = new CloudSync(repo, isNative() ? new NativeCloudFiles() : new MemoryCloudFiles(false));
  return cloud;
}

const schedulerCache = new Map<string, FSRS>();

/** One scheduler per priority class, keyed by its retention target and weights. */
export function schedulerFor(settings: Settings, priority: Priority): FSRS {
  const key = `${priority}:${settings.retention[priority]}:${(settings.fsrsWeights ?? []).join(",")}`;
  let s = schedulerCache.get(key);
  if (!s) {
    s = makeScheduler({
      requestRetention: settings.retention[priority],
      ...(settings.fsrsWeights ? { weights: settings.fsrsWeights } : {}),
    });
    schedulerCache.set(key, s);
  }
  return s;
}
