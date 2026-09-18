/** Client-side image preparation: downscale to the model's sweet spot and JPEG-encode. */
export interface PreparedImage {
  base64: string;
  mediaType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
  /** SHA-256 hex of the encoded bytes, for de-duplicating sources */
  hash: string;
}

const MAX_EDGE = 1568;

export async function prepareImage(file: Blob, maxEdge = MAX_EDGE, quality = 0.85): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encoding failed"))), "image/jpeg", quality),
  );
  const buf = await blob.arrayBuffer();
  const hash = await sha256Hex(buf);
  return { base64: arrayBufferToBase64(buf), mediaType: "image/jpeg", width: w, height: h, bytes: buf.byteLength, hash };
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) return String(buf.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
