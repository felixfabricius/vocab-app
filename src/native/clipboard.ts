/**
 * Copy text. WKWebView only honours `navigator.clipboard.writeText` inside a
 * user gesture, which an `await` before the call can lose; the native plugin
 * has no such rule.
 */
import { Clipboard } from "@capacitor/clipboard";
import { isNative } from "./platform";

export async function copyText(text: string): Promise<void> {
  if (isNative()) {
    await Clipboard.write({ string: text });
    return;
  }
  await navigator.clipboard.writeText(text);
}
