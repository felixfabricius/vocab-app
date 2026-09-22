# Architecture and extension seams

Layers, top to bottom. Arrows point at what a layer may import.

```
features/*  (screens)  →  app/* (services, env)  →  core/* (pure logic)  ←  storage/*  (Dexie)
                                                 →  llm/*  (Claude)         audio/* speech/* (device adapters)
```

`core/*` never imports from `features`, `storage`, `llm`, `audio` or `speech`. It is unit-tested with plain data.

## Seams for the native phase

| Marker | File | What it is | Phase 2 replacement |
|---|---|---|---|
| `EXT: input` | `src/core/review/session.ts`, `src/features/review/useSwipe.ts` | All grading goes through `grade / repeat / bury / undo` on the pure session; touch is one caller | `RemoteButtonsInput` (headphone play/pause = Good, next = Again, previous = repeat via a MPRemoteCommandCenter plugin), `VoiceInput` (sí / no) |
| `EXT: audio` | `src/audio/AudioPlayer.ts`, `src/audio/WebSpeechPlayer.ts` | `speak(text)`, `play(clipKey)`, `cancel()`, voice selection | Native TTS plugin with background audio session; `ClipCache` for pre-generated es-CL clips (Azure) |
| `EXT: transcriber` | `src/speech/Transcriber.ts`, `src/speech/WhisperTranscriber.ts` | `transcribe(blob, lang)` | On-device SpeechAnalyzer; used for "sí / no" in hands-free review |
| `EXT: storage` | `src/storage/Repository.ts`, `src/storage/DexieRepository.ts`, `src/storage/db.ts` | Every read/write; `outbox` table records mutations | Capacitor SQLite implementation; a sync engine drains `outbox` to a server |
| `EXT: translate` | `src/llm/pipelines.ts` (`translateWithClaude`), `src/features/translate/TranslateScreen.tsx` | Claude is the only in-app translator today; offline translation is the Shortcuts path | Apple Translation framework as the default provider, Claude stays the explicit "better" button |
| `EXT: share` | `src/features/import/ImportScreen.tsx` | Imports start from user actions on this screen | Share extension and App Intent hand text/images to `createBatch` |
| `LANG` | `src/config/language.ts` plus `// LANG:` comments | Frequency file, verb table, seed, tense plan, person labels, rank thresholds | A second `LanguageConfig`; entries carry `lang` |
| `VARIETY` | `src/config/variety.ts` plus `// VARIETY:` comments | TTS/ASR locales, prompt wording, vosotros display, regional tag | Another `VarietyConfig` selected in settings |

Hands-free review (screen locked) is deliberately absent from phase 1. When it arrives it is a new
`InputSource` plus the native `AudioPlayer`; the review session and card content code do not change.

## Data flow for card creation

```
photo / text / word ──► llm/pipelines ──► EntryDraft[] ──┐
paste (Claude app)  ──► core/import/paste ──────────────┤
translate lookups   ──► features/translate/lookupsService ┼──► importService.createBatch ──► suggestions (drafts table)
seed                ──► app/seed ───────────────────────┘                                        │
                                                                                                  ▼
                                              importService.acceptBatch ──► entries, senses, sentences, encounters, cards
                                                                                                  │
                                                                     grammar/tenseService.ensureParadigmCards (verbs)
```

The extraction prompt (`src/llm/prompts/extract.ts`) and the zod schema (`src/llm/schema.ts`) are shared by
the API path and the copy-prompt path, so both produce identical drafts.

## Scheduling

`core/scheduler/session.ts` builds today's queue from all cards (due by class and overdue ratio, learning
cards in a learn-ahead window, new cards by class quota). `core/review/session.ts` walks it and returns
persistence effects; the screen applies them through the repository. One `ts-fsrs` scheduler instance exists
per priority class, keyed by its retention target.
