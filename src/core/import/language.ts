/**
 * LANG: cheap guess whether a short text is Spanish rather than English, for the
 * manual-add form when no API key is available to sort the sides out.
 */
const SPANISH_MARKERS = /[áéíóúñü¿¡]/i;
const SPANISH_WORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "y", "o", "que", "en", "con", "por", "para", "es", "son",
  "está", "estoy", "no", "sí", "me", "te", "se", "lo", "mi", "tu", "su", "muy", "más", "pero", "como", "qué", "hay", "ser", "estar",
  "tener", "hacer", "ir", "poder", "querer", "bien", "gracias", "hola", "adiós", "buenos", "días", "noche", "hoy", "mañana",
]);
const ENGLISH_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "it", "you", "i", "we", "they", "this", "that",
  "my", "your", "not", "very", "but", "how", "what", "there", "be", "have", "do", "go", "can", "want", "good", "thanks", "hello",
]);

export function looksSpanish(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (SPANISH_MARKERS.test(t)) return true;
  const words = t.split(/[^\p{L}]+/u).filter(Boolean);
  let es = 0;
  let en = 0;
  for (const w of words) {
    if (SPANISH_WORDS.has(w)) es++;
    if (ENGLISH_WORDS.has(w)) en++;
  }
  if (es !== en) return es > en;
  // Endings typical of Spanish content words; English rarely ends in these.
  return /(ar|er|ir|ción|dad|mente|ito|ita|oso|osa)$/.test(words[words.length - 1] ?? "");
}
