# Vocab app — product spec

Personal Spanish vocabulary trainer. Chilean Spanish, English card backs (confirm), single learner for now.
Decisions recorded here are final unless changed in this file. Technical plan: see `PLAN.md`.

## Purpose

1. Recall works well: spaced repetition (FSRS) with fast, binary self-grading.
2. Card creation is automated: photos of textbook or book pages, pasted text, subtitle files, a translate log, and manual entry all feed one suggestions inbox.

## Delivery

- **Phase 1 (now):** installed home-screen web app (PWA). Built and deployed from Windows. No Apple account needed.
- **Phase 2 (after Apple Developer Program approval, $99/year):** same code wrapped with Capacitor, built in cloud CI, installed via TestFlight internal testing (no App Review).
- **Deferred to phase 2, not attempted in phase 1:** headphone-button control, audio review with screen locked, voice grading ("sí"/"no"), share-sheet target, lock-screen widget owned by the app, in-app offline translation.
- App Store only if the app is ever shared. Multi-user is a later concern; see storage notes in `PLAN.md`.
- Device: iPhone 14 (no Action Button, no Apple Intelligence; has Back Tap). iOS 26. iPad dropped.

## Data model

- **Entry** = one lemma + part of speech (+ phrase flag). Holds senses, priority class, regional tag, note, verb profile.
- **Sense** = one meaning of an entry. Production cards are per sense.
- **Sentence** = Spanish sentence + English translation (+ audio). Shared between entries via **Encounters** (entry, sentence, span, inflected form, tense, person).
- **Card** = generated from an entry: `production` (English → Spanish) per sense; `paradigm` (verb × tense, all six persons on the back).
- **Review log** = append-only, one row per grade, with `mode` (tap | typed | audio | voice) for future use.
- Same lemma + POS → same entry, always. Different inflection → encounter only. Different POS → separate entry. Different sense → second sense on the same entry. Reflexive variants → senses with a reflexive marker. Matching is exact and accent-sensitive; an optional "did you mean está?" hint may be shown, never auto-merged.

## Learning engine

- **Scheduler:** FSRS-6 via `ts-fsrs`. Default parameters; optimize later from exported review logs.
- **Grades:** Again / Good, optional Easy (swipe up). Self-graded yes/no. No typed answer checking in v1.
- **Direction:** English → Spanish production from day one. No recognition cards in v1.
- **Priority classes** (default from frequency rank; phrases from LLM CEFR + usefulness, capped by rarest content word; user override):

| Class | Default membership | Share of new cards | Retention target |
|---|---|---|---|
| Essential | top ~500 words + ~100 survival phrases | 60% | 0.95 |
| Core | rank 500–2000 | 25% | 0.92 |
| Standard | rank 2000–10000 | 12% | 0.90 |
| Niche | rest | 3% | 0.85 |

- Priority affects: introduction order and daily quota, retention target per class, which due cards get postponed on overflow (lowest first), leech thresholds.
- Daily new-card limit default 20. Day rolls over at 04:00 local.
- Audio vs written recall distinction: not in v1 (review log keeps `mode` so it can be added).

## Verbs and tenses

- Conjugations come from a lookup table (Fred Jehle database, CC BY-NC-SA) plus rules for regular verbs. Notes store only which tenses are active and whether the verb is irregular.
- **Paradigm card:** front "ser · pretérito", back all six persons. Vosotros shown with a "Spain" tag; a setting can hide it (default: shown).
- Irregular verbs in Essential/Core get paradigm cards per active tense. Regular verbs get one model card per conjugation class per tense (hablar / comer / vivir). Any verb can be switched to individual cards.
- **Tenses activate progressively.** Ordered plan: presente, pretérito, imperfecto, condicional, presente de subjuntivo, imperativo, pretérito perfecto, futuro, pluscuamperfecto, imperfecto de subjuntivo. Manual activation from a Grammar screen; optional suggestion when 80% of the current tense's cards have stability > 14 days. Activation is idempotent (card key = verb + tense). Deactivation suspends, never deletes.
- No cloze cards.
- Audio: no pre-generated clips for conjugation forms; play them with the system voice at review time.

## Phrases

- Defined generously: idioms, verb+noun collocations (hacer planes), verb+preposition patterns (soñar con), fixed formulas (a lo mejor), regional formulas. Excluded: free combinations that translate word for word.
- Setting: conservative / balanced / generous chunking. Default balanced.
- Phrase entries link to component words; components are drafted only if unknown and at least Core.
- Cap per import batch for long free text (subtitles, articles): 60 words + 40 phrases, "show more" fetches the rest. No cap for page photos or short pastes.

## Example sentences

- Every entry keeps its **source sentence** (verbatim, when there is one) and gets **one generated sentence** with English translation and audio.
- Generated-sentence rules: 6–12 words; neutral Latin American Spanish as spoken in Chile; no regional slang unless the target itself is regional; common words preferred, not restricted to known words; shows the typical collocation; verbs appear in a common conjugated form and the form is reported.
- Every content word in a generated sentence that is unknown becomes a minimal entry (lemma, POS, gloss) reusing that sentence. No further sentences are generated for those. They appear in the inbox under "from sentences", checked by default.
- Usage note only when significant (false friend, ser/estar, por/para, regional word, confusable synonym). Nouns always get gender and article. Every entry is tagged neutral or chileno.
- No image on the card; the entry keeps a pointer to the source (photo id, page ref, subtitle line, translate log row).

## Review screen

- Production card front: English prompt; English sentence collapsed as a hint. Back: Spanish target, Spanish sentence with target highlighted, note.
- Playback settings: **display only** (tap to play), **audio on** (on flip: target, short gap, sentence; any swipe cuts playback), **hands-free** (phase 2: target only, sentence after Again or on request).
- Undo last grade. Flag gesture to fix later. Edit button on the card.

## Editing and deleting

- Edit every field, add/remove senses, change class, toggle paradigm cards, regenerate sentence or audio, suspend, bury for today, reset progress, delete (soft, 30-day trash; review logs kept).
- List view: search, filters, multi-select for bulk class change / suspend / delete.
- Permanent ignore list (lemma + POS) for words never to suggest again.

## Import sources

1. **Photo** (textbook, book, sign): image sent to Claude directly; mixed Spanish/English/German pages handled by prompt (adjacent gloss used as translation hint).
2. **Paste import from the Claude app**: "Copy extraction prompt" button; user pastes prompt + photo into the Claude app; pastes the reply back; parser reads the `VOCABAPP-IMPORT v1` JSON block. Same schema and same inbox as the API path. Also accepts plain `spanish<TAB>english` lines.
3. **Pasted text / .srt file**: two-stage (scan → draft accepted).
4. **Translate log** written by iOS Shortcuts (see below).
5. **Manual**: type a word, Claude drafts the rest.
6. **Seed**: Essential list at install; top 50 due immediately, rest introduced at the daily limit.

## Translate

- Default translator is offline and free. Phase 1: iOS Shortcuts (on-device Translate Text). Phase 2: Apple Translation framework in-app.
- Claude translation is an explicit per-sentence toggle in the translate screen (phase 1: the in-app translate screen is Claude-only and online).
- Lock-screen access (phase 1): four Shortcuts (ES→EN type, ES→EN speak, EN→ES type, EN→ES speak) placed as Lock Screen widgets / bottom-corner controls; Back Tap optional. Each appends a JSON line to `iCloud Drive/Shortcuts/vocab-import/translate-log.jsonl`. App imports the file with one tap. Phase 2: app-owned widget + control + App Intent, automatic logging.
- In-app microphone (phase 1): record → Whisper with language fixed per field.

## Audio

- Spanish voice: Apple "Francisca" (es-CL, enhanced) through the Web Speech API. Azure es-CL Catalina/Lorenzo optional later for pre-generated clips of lemma + sentences (free tier covers usage).
- Variety is a single config object (TTS locale, ASR locale, LLM wording, vosotros display). Every hard-coded use carries a `// VARIETY:` comment. Every Spanish-specific piece carries `// LANG:`.

## Storage and backup

- Phase 1: local-first IndexedDB (Dexie). One-tap JSON backup export/import via the Files app. Change outbox recorded from day one.
- Week 2 or before phase 2: tiny sync endpoint (Cloudflare Worker) that receives the outbox and the Shortcut log.
- Phase 2 multi-user (if ever): server DB per user, Sign in with Apple, API keys server-side with quotas.

## Budget

Target ≤ $10/month. Drafting on Claude Opus 5 at low effort; Sonnet 5 is the fallback if the bill matters. Batch API for end-of-day imports. Whisper for microphone input is cents per month. Hosting, scheduler, verb data, voices: $0.

## Attribution required in the app

- FSRS / ts-fsrs (MIT). Frequency list: hermitdave FrequencyWords (CC BY-SA). Verb data: Fred Jehle Spanish Verb Database, compiled by ghidinelli (CC BY-NC-SA 3.0).
