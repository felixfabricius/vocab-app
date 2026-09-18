# Vocab app — technical implementation plan

Companion to `SPEC.md`. Phase 1 is the installed web app; phase 2 is the Capacitor wrapper. Everything below is designed so phase 2 adds adapters without rewriting.

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language / build | TypeScript, Vite | Fast on Windows, no native toolchain |
| UI | React 18, Tailwind | Fast to iterate; Capacitor-compatible later |
| PWA | vite-plugin-pwa (Workbox) | Offline shell + precached assets |
| Local DB | Dexie (IndexedDB) | Transactions, versioned migrations, works in WKWebView later |
| Scheduler | ts-fsrs | Official FSRS implementation |
| Validation | zod | Shared schema for LLM output and paste import |
| LLM | @anthropic-ai/sdk, `claude-opus-5`, structured outputs, effort low, `fallbacks: "default"` | Deterministic JSON, cheapest good quality |
| Speech in | OpenAI audio transcription (`whisper-1`) | Works from the installed web app; language fixed per field |
| Audio out | Web Speech API (`speechSynthesis`), es-CL voice | Free, offline |
| Hosting | Cloudflare Pages via `wrangler` | HTTPS, free, deploy from Windows |
| Tests | vitest | Pure-logic modules get unit tests |
| IDs / time | ULID, ISO-8601 UTC | Sync-safe |

Node 22 LTS, pnpm. Git repository initialized before first code; `.env*`, `dist/`, local exports ignored.

## 2. Repository layout

```
vocab-app/
  SPEC.md  PLAN.md  ARCHITECTURE.md      # ARCHITECTURE.md lists every EXT/LANG/VARIETY seam
  package.json  vite.config.ts  tailwind.config.ts  tsconfig.json
  public/
    seed/essential.json                  # built by scripts/build-seed.ts, committed
    data/verbs.json                      # built by scripts/build-verbs.ts, committed
    data/frequency.json                  # lemma -> rank (top 20k), committed
  scripts/
    build-seed.ts  build-verbs.ts  build-frequency.ts
  shortcuts/
    README.md                            # step-by-step to build the 4 Shortcuts
    translate-log.schema.json
  src/
    app/            routes, layout, theme
    core/           pure logic, no browser APIs, fully unit-tested
      scheduler/    fsrs wrapper, per-class retention, session builder, day boundary
      review/       ReviewSession state machine (next, grade, undo, flag, bury)
      generator/    cards from entries: production per sense, paradigm per verb×tense
      dedupe/       lemma+POS matching, sense merge decisions, ignore list
      priority/     rank -> class, phrase class from CEFR+usefulness, guards
      verbs/        conjugation lookup (Jehle) + regular-verb rules
      import/       parsers: paste (VOCABAPP-IMPORT), tsv lines, srt, translate-log
    llm/
      client.ts     Anthropic client (browser opt-in), model config, cost meter
      schema.ts     zod schemas: EntryDraft, ScanCandidate, TranslateResult
      prompts/      *.md templates with placeholders; shared by API and copy-prompt
      pipelines/    draftFromImage, draftFromText (scan+draft), draftManual, translate
    audio/
      AudioPlayer.ts        interface           // EXT: native TTS plugin
      WebSpeechPlayer.ts    Web Speech impl
      ClipCache.ts          Cache API for pre-generated clips (Azure, later)
    input/
      InputSource.ts        interface: emits Grade(Good|Again|Easy) | Repeat | Skip
      TouchInput.tsx        swipe/tap             // EXT: RemoteButtonsInput, VoiceInput
    speech/
      Transcriber.ts        interface             // EXT: native SpeechAnalyzer
      WhisperTranscriber.ts
    storage/
      Repository.ts         interface             // EXT: SQLite in Capacitor
      DexieRepository.ts    tables, migrations, outbox
      backup.ts             export/import JSON (versioned)
    features/
      review/  inbox/  entries/  import/  translate/  grammar/  settings/  stats/
    config/
      language.ts           // LANG: 'es' config: frequency file, verb data, prompt fragments
      variety.ts            // VARIETY: es-CL: ttsLocale, asrLocale, llmWording, showVosotros
```

## 3. Data model (Dexie tables)

All rows carry `id` (ULID), `createdAt`, `updatedAt`; soft-deletable rows carry `deletedAt`.

```ts
type Priority = 'essential' | 'core' | 'standard' | 'niche';
type Pos = 'noun' | 'verb' | 'adj' | 'adv' | 'phrase' | 'prep' | 'conj' | 'pron' | 'interj' | 'other';

interface Entry {
  id: string; lang: 'es';                       // LANG
  lemma: string; pos: Pos; isPhrase: boolean;
  gender?: 'm' | 'f'; plural?: string; article?: string;
  priority: Priority; priorityAuto: boolean; frequencyRank?: number; cefr?: 'A1'|'A2'|'B1'|'B2'|'C1'|'C2';
  regional: 'neutral' | 'chile';                // VARIETY
  note?: string; tags: string[];
  verb?: { irregular: boolean; paradigmCards: 'auto' | 'on' | 'off'; conjugationRef?: string };
  status: 'active' | 'suspended' | 'trashed';
  sourceIds: string[];
}
interface Sense { id; entryId; gloss: string; order: number; reflexive?: boolean }
interface Sentence { id; es: string; en: string; origin: 'source' | 'generated'; sourceId?: string; audioKey?: string }
interface Encounter { id; entryId; sentenceId; span: [number, number]; form?: string; tense?: string; person?: string }
interface Card {
  id; entryId; senseId?: string;
  type: 'production' | 'paradigm'; tense?: string;   // paradigm key = entryId + tense
  fsrs: { due: string; stability: number; difficulty: number; elapsedDays: number; scheduledDays: number;
          reps: number; lapses: number; state: 0|1|2|3; lastReview?: string };
  status: 'active' | 'suspended' | 'buried'; buriedUntil?: string; flagged: boolean;
}
interface ReviewLog { id; cardId; rating: 1 | 3 | 4; mode: 'tap' | 'typed' | 'audio' | 'voice';
  reviewedAt: string; fsrsLog: RecordLogItem['log'] }     // ts-fsrs log, needed by the optimizer
interface Source { id; type: 'photo' | 'paste' | 'text' | 'srt' | 'translate' | 'manual' | 'seed';
  label: string; pageRef?: string; imageHash?: string }
interface ImportBatch { id; sourceId; stage: 'scanned' | 'drafted' | 'done'; counts: { found; known; new } }
interface Suggestion { id; batchId; group: 'words' | 'phrases' | 'fromSentences';
  draft: EntryDraft; checked: boolean; existingEntryId?: string; didYouMean?: string;
  decision?: 'accepted' | 'excluded' | 'ignored' }
interface IgnoreEntry { key: string /* lemma|pos */ }
interface TensePlan { tense: string; order: number; status: 'locked' | 'active' }
interface Settings { dailyNewLimit: number; quotas: Record<Priority, number>; retention: Record<Priority, number>;
  playback: 'display' | 'audioOn' | 'handsFree'; chunking: 'conservative' | 'balanced' | 'generous';
  showVosotros: boolean; anthropicKey?: string; openaiKey?: string; model: string; dayRolloverHour: 4 }
interface Outbox { seq: number; table: string; rowId: string; op: 'upsert' | 'delete'; at: string }  // sync later
```

Indexes: `entries: [lemma+pos]`, `cards: [status+fsrs.due]`, `cards: entryId`, `encounters: sentenceId`, `suggestions: batchId`, `reviewLogs: reviewedAt`.

Backup file: `{ version: 1, exportedAt, tables: {...} }`. Import replaces or merges by id (newer `updatedAt` wins).

## 4. Core modules

### 4.1 Scheduler (`core/scheduler`)
- One `fsrs()` instance per priority class with `request_retention` from settings; parameters shared (defaults, later user-optimized).
- `gradeCard(card, rating, now)` → new fsrs state + log item. Rating map: Again=1, Good=3, Easy=4.
- `buildSession(now)`:
  1. `today` = date shifted by rollover hour.
  2. Due = active cards with `due <= now`, sorted by class then by overdue ratio.
  3. New = introduced today so far vs `dailyNewLimit`; fill by class quotas; within class by `frequencyRank` then `createdAt`. Unused quota flows down to the next class.
  4. Overflow policy: if due > session cap (setting, default 200), postpone lowest class first (leave due, exclude from today's list).
- Leech: lapses ≥ threshold per class (essential 12, core 8, standard 6, niche 4) → suspend + flag.

### 4.2 Review session (`core/review`)
State machine over a queue: `current`, `history` (for undo, depth 10), actions `grade`, `repeat`, `bury`, `flag`, `undo`. Emits `CardShown`, `CardFlipped`, `Graded` events that the audio layer listens to. Input sources only call actions.

### 4.3 Generator (`core/generator`)
- `ensureProductionCards(entry)`: one per sense, idempotent.
- `ensureParadigmCards(entry, activeTenses)`: rules from SPEC (irregular + essential/core → per tense; regular → model cards for `hablar/comer/vivir` classes; per-verb override).
- `onTenseActivated(tense)`: run over all verbs; `onTenseDeactivated` suspends.

### 4.4 Dedupe (`core/dedupe`)
- `findExisting(lemma, pos)` exact match. `didYouMean(lemma)` accent-stripped lookup, returns hint only.
- `decideMerge(existing, draft)`: same gloss family → attach encounter; new gloss → propose second sense; POS differs → new entry.

### 4.5 Priority (`core/priority`)
- Words: rank → class thresholds (500 / 2000 / 10000). Phrases: CEFR + usefulness → class, capped at the class of the rarest content word. Seed survival phrases forced Essential.

### 4.6 Verbs (`core/verbs`)
- `conjugate(lemma, tense)` → 6 forms from `verbs.json`; fallback to regular rules by ending; `isIrregular(lemma)` from data flag.
- Tense ids: `pres`, `pret`, `impf`, `cond`, `subjPres`, `imp`, `perf`, `fut`, `plusq`, `subjImpf`. Mapping from Jehle mood/tense labels lives in `scripts/build-verbs.ts`.

### 4.7 Import parsers (`core/import`)
- `parsePasteImport(text)`: locate ```` ```json ```` block after `VOCABAPP-IMPORT v1`; zod-validate each item; return `{ items, errors[] }`.
- `parseTsvLines(text)`: `es<TAB>en` → minimal drafts.
- `parseSrt(text)`: strip indices/timestamps/tags → numbered lines.
- `parseTranslateLog(jsonl)`: rows `{ at, dir, src, dst }`, dedupe by `at`.

## 5. LLM pipeline

### 5.1 Client
- Browser call with the SDK's browser opt-in; key from settings (Keychain later). Every call: `model` from settings (default `claude-opus-5`), `output_config: { effort: 'low', format: <zod schema> }`, `betas: ['server-side-fallback-2026-07-01']`, `fallbacks: 'default'`, streaming for anything with images or long text. Cost meter accumulates `usage` per call into settings for a monthly readout.
- Static prompt prefix (rules + variety + schema description) first, `cache_control` breakpoint after it; per-request content after.

### 5.2 Shared prompt template (`llm/prompts/extract.md`)
Sections: role; variety (`VARIETY` text); lemma & POS rules; phrase rules with chunking level and examples; priority rubric (classes, CEFR, usefulness); sentence rules (6–12 words, neutral LatAm/Chile register, no inserted slang, common words preferred, report verb form, mark target span); from-sentence minimal entries; usage-note criteria; output format. Placeholders: `{{chunking}}`, `{{knownLemmas}}` (capped at 2,000, most recent first), `{{ignoreList}}`, `{{pageHint}}`.
The **copy-prompt** feature renders this same template with `format = paste` (asks for a fenced JSON block headed `VOCABAPP-IMPORT v1`); the API path renders it with `format = api` (structured outputs).

### 5.3 Schemas (`llm/schema.ts`)
```ts
EntryDraft = { lemma, pos, isPhrase, gender?, article?, plural?, senses: [{gloss, reflexive?}], priority, cefr?, usefulness?,
  regional, note?, sourceSentence?: {es, en, span}, generatedSentence?: {es, en, span, verbForm?},
  fromSentence: [{lemma, pos, gloss, span}], verb?: {irregular}, pageRef? }
ScanCandidate = { lemma, pos, isPhrase, gloss, priority, lineIndex }
TranslateResult = { translation, alternatives[], note?, draft?: EntryDraft }
```

### 5.4 Pipelines
- **draftFromImage(file)**: client-side resize to ≤1568 px long edge, JPEG q0.85 → image block + template → `EntryDraft[]` → dedupe → suggestions (groups: words / phrases / fromSentences).
- **draftFromText(text)**: if ≤ 400 words → single stage as above. Else **scan** (whole text once, returns ≤60 words + ≤40 phrases as `ScanCandidate[]`, excluding known + ignore list) → user accepts in inbox → **draft** only accepted candidates with their source lines (batched 25 per call). "Show more" re-runs scan with an exclusion list.
- **draftManual(word)**: single entry, may ask for sense pick if ambiguous.
- **translate(text, dir)**: Claude path; returns translation + optional draft; user taps "add" to create suggestion.
- **Batch mode** (later): imports queued during the day submitted via Message Batches at 50% cost.

### 5.5 Cost controls
Effort low; cached prefix; scan/draft split; per-day spend cap in settings (default $1) with a warning, hard stop at 2×.

## 6. Seed data scripts (run once on Windows, output committed)

- `build-frequency.ts`: download hermitdave `es_full.txt` → top 20k tokens → `frequency.json` (token → rank). Also emits candidate list for the seed.
- `build-seed.ts`: top ~1,200 tokens → Claude (Batch API, structured outputs) → lemmatize, drop duplicates/forms, POS, gloss, gender, one sentence each → keep top 500 lemmas + generate 100 survival phrases (Chile-aware, neutral) → `essential.json` with `priority: 'essential'`, `sourceType: 'seed'`. Manual review of the JSON before commit.
- `build-verbs.ts`: Jehle CSV → `verbs.json` `{ lemma: { irregular, forms: { tenseId: [yo, tú, él, nosotros, vosotros, ellos] } } }`, plus regular-class detection.

On first launch the app imports `essential.json`, marks the top 50 due now, the rest as new.

## 7. Shortcuts (phase 1 translate)

Four shortcuts, documented step by step in `shortcuts/README.md`:

| Name | Input | Translate | Output |
|---|---|---|---|
| ES→EN Type | Ask for Input (text) | Translate Text, es→en, on-device on | Show Result; Append to File |
| ES→EN Speak | Dictate Text, language Spanish | same | same |
| EN→ES Type | Ask for Input | Translate Text, en→es, on-device on | same |
| EN→ES Speak | Dictate Text, language English | same | same |

Append format, one JSON object per line, file `iCloud Drive/Shortcuts/vocab-import/translate-log.jsonl`:
`{"at":"<Current Date ISO>","dir":"en-es","src":"<input>","dst":"<translation>"}`.
Placement: Lock Screen widgets (Shortcuts widget), iOS 18 bottom-corner controls, optional Back Tap. App: Import → "Translate log" → file picker → parse → suggestions (each row becomes a manual-type draft; Claude drafting runs on accept).

## 8. UI screens (phase 1)

1. **Today**: due/new counts, Start review, quick links (Import, Inbox badge, Translate).
2. **Review**: card, swipe left = Again, right = Good, up = Easy; buttons as fallback; undo; flag; edit; playback per setting; sentence words tappable → "add as card".
3. **Inbox**: batches → suggestion rows grouped words / phrases / from sentences; check/uncheck, swipe to exclude, long-press ignore, tap to edit; "Accept checked".
4. **Entries**: search, filters (class, status, POS, flagged), multi-select bulk actions; entry editor (all fields, senses, conjugation table view, regenerate, trash).
5. **Import**: Photo (camera/file), Paste (with "Copy extraction prompt"), Text/.srt file, Translate log, Manual word.
6. **Translate**: two fields (EN→ES, ES→EN), mic button (Whisper), Claude toggle, "Add as card".
7. **Grammar**: tense plan with activate/deactivate, per-verb overrides, vosotros toggle.
8. **Settings**: keys, model, limits, quotas, retention, playback, chunking, day rollover, backup export/import, cost meter, attributions.
9. **Stats** (minimal): reviews per day, retention, cards per class.

## 9. Extension seams (documented in ARCHITECTURE.md)

| Marker | Where | Phase 2 replacement |
|---|---|---|
| `EXT: input` | `input/InputSource.ts` | RemoteButtonsInput (MPRemoteCommandCenter plugin), VoiceInput |
| `EXT: audio` | `audio/AudioPlayer.ts` | Native TTS + background audio session |
| `EXT: transcriber` | `speech/Transcriber.ts` | On-device SpeechAnalyzer |
| `EXT: storage` | `storage/Repository.ts` | Capacitor SQLite; sync engine consumes `Outbox` |
| `EXT: translate` | `llm/pipelines/translate.ts` | Apple Translation framework as default provider |
| `EXT: share` | `features/import` | Share extension → import inbox |
| `LANG` | `config/language.ts` + comments | Second language config |
| `VARIETY` | `config/variety.ts` + comments | Other Spanish varieties |

## 10. Milestones

**M0 — Scaffold (hours 0–3)**: git init; Vite + React + TS + Tailwind + PWA; Dexie schema v1; Repository; Cloudflare Pages deploy; installed on phone over HTTPS; voice picker confirms Francisca.

**M1 — Usable tonight (day 1)**: seed import; scheduler + session builder; review screen with swipe grading, undo, flip audio via Web Speech; settings (limits, playback); backup export/import. Unit tests for scheduler, session, review state machine.

**M2 — Card creation (days 2–3)**: LLM client + schemas + template; photo import; paste import + copy-prompt; inbox; dedupe; entry list + editor; ignore list; cost meter.

**M3 — Translate + grammar (days 3–5)**: four Shortcuts + log import; translate screen with Whisper mic + Claude toggle; verbs.json; Grammar screen; paradigm card generator; tense activation.

**M4 — Long text + polish (week 2)**: scan/draft pipeline for text and .srt with caps and "show more"; Batch API queue; stats; leech handling; sync endpoint (Cloudflare Worker + D1, per-device token) consuming Outbox and the Shortcut log; optional Azure clips.

**M5 — Native (after Developer Program approval)**: Capacitor project; GitHub Actions macOS workflow → TestFlight; plugins for TTS, background audio + remote commands, speech recognition, share target; Apple Translation provider; App Intent + widget/control (one cloud-Mac day for the Swift targets).

## 11. Testing

- vitest: scheduler math against ts-fsrs reference values; session builder quotas and rollover; review undo; generator idempotence; dedupe rules incl. accents; all parsers with fixture files (paste block with errors, srt, jsonl).
- LLM pipelines: fixture responses recorded once; a small golden set of 10 textbook-page photos and 1 subtitle file, re-run after prompt changes and diffed.
- On-device checklist (iPhone 14, installed app): voice list contains es-CL; audio plays after first tap; camera input works; storage persists after relaunch; backup export lands in Files; Shortcuts append and import round-trip; Whisper mic round-trip.

## 12. Risks and open items

- Web Speech on iOS may not list downloaded enhanced voices → fallback es-MX/es-US voice, or Azure clips earlier.
- Storage eviction in the installed app → daily backup reminder until sync exists.
- Structured-output schema drift between paste and API paths → single zod source of truth, versioned header.
- Frequency list is token-based → seed script lemmatizes; classes for new entries use lemma lookup with token fallback.
- Confirm card-back language (English assumed).
