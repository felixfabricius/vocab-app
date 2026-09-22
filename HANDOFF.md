# Technical handoff (for a fresh context)

Everything an implementer needs to continue from the 2026-09-21 state without the chat history.
Product decisions: `SPEC.md` (web phase, still valid) and `SPEC-NATIVE.md` (phase 2, revision 3, all questions answered; §1 is the decision table).
`PLAN-NATIVE.md` (revision 1, 2026-09-21) is the implementation plan: milestones M1–M7 with per-file steps, the CI pipeline, and the deferred-items tracker and decisions log in its §9. Start there; the next task is M1.

## 0. Phase-2 decisions that shape implementation

- **Platform: Capacitor wrapper** around the existing web app (Capacitor 8, SPM by default, no CocoaPods; the spec's "Capacitor 7" is superseded by `PLAN-NATIVE.md` §9.2 D1). OS features become small Swift plugins behind the seams in `ARCHITECTURE.md`. No SwiftUI rewrite.
- **App name "¡A la luna!"**, bundle id **`in.fabricius.vocab`**, iCloud container `iCloud.in.fabricius.vocab`, App Group `group.in.fabricius.vocab`. Xcode product name stays ASCII (`ALaLuna`); the display name carries the punctuation. The bundle id is permanent after the first upload.
- **Minimum iOS 26.** iPhone 14 is the only target device.
- **CI-led, no Mac.** Builds, signing (`fastlane match` with an App Store Connect API key) and TestFlight uploads run on GitHub Actions macOS runners. Everything is attempted from Windows + CI first. Whatever proves too cumbersome (candidates: adding the widget extension target, debugging entitlements or the audio session) is deferred, the decision documented, and listed in the tracker in `PLAN-NATIVE.md` for a later rented-Mac session.
- **Web app is frozen** once the native app works; no parallel deployment. Migration is a one-time backup export in the web app and import in the native app.
- **Shortcuts are removed** once the lock-screen widget, bottom-corner control and home-screen widget deep-link into the in-app translate screen. No Siri intent.
- **Storage:** iCloud Drive app container with `snapshot.json` plus `changes/*.jsonl` drained from the existing outbox. No Windows access needed.
- **Grading:** Again / Good only; Easy and the up-swipe are removed. Swipe right = Good.
- **Study by tag:** one tag per batch stored on every entry; tag study takes due + learning + new (toggle for everything), ignores the session cap and new limit, counts toward "introduced today".
- **Voice review:** level 1 (screen on, on-device sí / no) now, built as an `InputSource` so level 2 (locked) can follow; silence repeats once, then skips ungraded. Wired EarPods buttons via the remote command centre.
- **Card creation:** translate lookups (every one becomes a draft) go through a manual "Create cards from lookups" button with automatic Claude enrichment. Claude-app extraction uses prompt builders (series, textbook, book, context) and format `VOCABAPP-IMPORT v2` (batch `tag`, per-item `sentenceSource`); German glosses are translated to English and dropped. All multi-card jobs end in a flat drafts table (front/back rows, swipe to remove, tap to edit).
- **Order of work** is `SPEC-NATIVE.md` §8: wrapper + CI + TestFlight first, with the app unchanged.
Code seams: `ARCHITECTURE.md`. Original plan: `PLAN.md`.

## 1. Repository and toolchain

- Path `C:\Users\User\Documents\Coding\vocab-app`, git on `main`, ~14 commits, working tree clean after each milestone.
- Node 24 via **fnm**, pnpm 12 via corepack, pinned in `.node-version` and `package.json#packageManager`.
- From the Claude Code Bash tool, Node is not on PATH; prefix commands with
  `eval "$("$LOCALAPPDATA/Microsoft/WinGet/Packages/Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe/fnm.exe" env --shell bash)"`.
  In PowerShell the profile hook works in shells started after fnm was installed; a stale VS Code terminal needs a PATH refresh.
- pnpm 12 quirks: install scripts must be allowed in `pnpm-workspace.yaml` (`allowBuilds`); packages published < 24 h ago are rejected (`minimumReleaseAge`), so pin the previous version rather than adding exclusions; `pnpm deploy` is a pnpm builtin, the project script is `pnpm run deploy`; `rm -rf` from the Bash tool was denied, use `pnpm clean --lockfile`.
- Commands: `pnpm dev`, `pnpm test` (vitest, 17 files / 61 tests), `pnpm typecheck` (two tsconfigs: browser `tsconfig.json`, node `tsconfig.node.json` for scripts and configs), `pnpm build`, `pnpm run deploy` (Cloudflare Pages, project `vocab-app`, needs `wrangler login` once).
- CI: `.github/workflows/ci.yml` runs typecheck, tests, build on push; deploys to Pages if `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets exist. No GitHub remote has been verified from this side.
- Scripts (run with plain `node`, Node strips types): `scripts/build-verbs.ts` (Jehle CSV → `public/data/verbs.json`, 637 verbs, 269 flagged irregular after spelling-change normalisation), `scripts/build-frequency.ts` (OpenSubtitles list → `public/data/frequency.json`, 20k tokens, verb lemmas ranked by their most frequent form), `scripts/build-seed.ts` (Claude-based, needs `ANTHROPIC_API_KEY`, never run yet), `scripts/make-icons.mjs`. Downloads cache in `.cache/` (gitignored).

## 2. Stack

TypeScript, React 19, Vite 8 (Rolldown), Tailwind 4 (`@theme` tokens in `src/index.css`), react-router 7 (`BrowserRouter`), Dexie 4 (IndexedDB), ts-fsrs 5 (FSRS-6), zod 4, `@anthropic-ai/sdk` 0.126 (browser mode), vite-plugin-pwa (Workbox, `autoUpdate`, runtime-cached `/seed/*` and `/data/*`), vitest 5 with fake-indexeddb and jsdom for the smoke test, wrangler 4.134.

## 3. Layout (what lives where)

```
src/config/language.ts   LANG: paths to data files, rank thresholds (500/2000/10000), tense plan, person labels
src/config/variety.ts    VARIETY: es-CL locales, fallback locales, prompt wording, vosotros default
src/core/types.ts        all domain types + DEFAULT_SETTINGS
src/core/ids.ts          ulid, nowIso
src/core/scheduler/      day.ts (04:00 rollover), fsrs.ts (wrapper, grade map again=1 good=3 easy=4), session.ts (builds due/learning/fresh)
src/core/review/session.ts   pure state machine: start/flip/grade/repeat/bury/toggleFlag/undo → {state, effects}
src/core/generator/      cards.ts (production per sense), paradigm.ts (verb×tense rules, MODEL_VERBS hablar/comer/vivir)
src/core/priority/       rank.ts (rank→class, phrase class), frequency.ts (loads frequency.json)
src/core/dedupe/         exact lemma+pos identity, accent-insensitive did-you-mean only
src/core/verbs/          regular.ts (conjugator + orthographic rules), index.ts (table lookup, reflexive pronouns)
src/core/import/         paste.ts (VOCABAPP-IMPORT v1 + TSV lines), translateLog.ts (||| lines and JSON lines, rowsAfter/latestTimestamp)
src/llm/schema.ts        zod schemas (nullable, not optional) + normalizeDraft
src/llm/prompts/extract.ts   shared extraction prompt, formats "api" | "paste", PASTE_HEADER
src/llm/client.ts        callClaude: beta.messages.parse, betaZodOutputFormat, effort low, cache_control on system, fallbacks [{model: claude-opus-4-8}] with beta server-side-fallback-2026-06-01, spend cap, usage meter
src/llm/pipelines.ts     draftFromImage, draftFromText, scanText (>400 words), draftManual, enrichEntries, translateWithClaude
src/llm/image.ts         canvas resize to 1568 px JPEG + sha256
src/llm/pricing.ts       USD per MTok table, estimateUsd
src/storage/db.ts        Dexie schema v1 + outbox DBCore middleware (widens rw transactions to include outbox)
src/storage/Repository.ts / DexieRepository.ts   the only storage API used by features
src/storage/backup.ts    export/import JSON {app:"vocab", version:1, tables}, share sheet on iOS
src/audio/               AudioPlayer interface, WebSpeechPlayer (voice pick by es-CL then fallbacks, iOS unlock)
src/speech/              Transcriber interface, WhisperTranscriber (OpenAI), recorder.ts (MediaRecorder)
src/app/                 App.tsx (routes, boot: seed + trash purge), services.ts (repo, audio, schedulerFor), llmEnv.ts, seed.ts, useSettings.ts, components/ui.tsx (NavBar: Today, Words, Import, Translate, Settings)
src/features/            today, review (ReviewScreen, CardView, useSwipe), entries (list, EntryScreen, enrichService), import (ImportScreen, BatchScreen, SuggestionEditor, importService), translate, grammar (GrammarScreen, tenseService), settings (SettingsScreen, Diagnostics), stats
public/seed/essential.json   hand-authored ~150 Essential items (words + phrases, Chilean-aware), version 1
public/data/verbs.json, frequency.json
shortcuts/README.md      four Kurzbefehle, log format, import steps (German UI names)
```

## 4. Data model (Dexie v1)

Tables and keys: `entries` (id, [lemma+pos], lemma, priority, status, updatedAt), `senses` (id, entryId), `sentences` (id, sourceId), `encounters` (id, entryId, sentenceId), `cards` (id, entryId, status, fsrs.due, [status+fsrs.due], [entryId+type+tense], flagged), `reviewLogs` (id, cardId, reviewedAt), `sources`, `importBatches`, `suggestions` (id, batchId, decision), `ignoreList` (key = `lemma|pos`), `tensePlan` (tense, order), `settings` (single row id "settings"), `outbox` (++seq).

Semantics that matter:
- Entry identity = lemma + pos, exact and accent-sensitive. Senses are per meaning; production cards are per sense. Paradigm cards key = entryId + tense.
- `Card.fsrs` mirrors ts-fsrs Card in camelCase with ISO dates; `introducedOn` (day key) drives the daily new-card limit.
- `ReviewLog.fsrsLog` keeps the library's log verbatim (needed by `rollback` for undo and by the optimizer later). `mode` field exists (tap/typed/audio/voice) but only "tap"/"audio" are written.
- `Entry.tags` exists (seed writes `["seed"]`) but no UI uses tags yet. `Entry.sourceIds` links to `sources`.
- `Settings` includes `anthropicKey`, `openaiKey`, `model` (default `claude-opus-5`), `dailySpendCapUsd` (warn at 1×, stop at 2×), `llmUsage` (monthly meter), `translateLogImportedUntil`, `showVosotros`, `playback` (display | audioOn | handsFree, the last unused), `voiceURI`, `speechRate`, `fsrsWeights` (unused), `seedVersion`.
- Every mutation of the tracked tables writes an `outbox` row (table, rowId, op, at); nothing consumes it yet. This is the hook for sync.
- Backup file replaces or merges (newer `updatedAt` wins per row). Web storage and a native wrapper's WKWebView storage are different origins: migration = export + import.

## 5. Scheduling and review

- One `fsrs()` instance per priority class, keyed by retention target (0.95/0.92/0.90/0.85) and optional weights; short-term learning steps enabled (new card Good → back in ~10 min within the session).
- `buildSession`: due = review-state cards due before the next rollover, sorted by class then overdue ratio, capped at `sessionCap` (lowest class dropped first); learning = learning/relearning cards due within 20 min; fresh = new cards by class quota (60/25/12/3 %) minus `introducedToday`, ordered by frequency rank.
- `core/review/session.ts` is pure: every action returns `{state, effects}`; effects are `upsertCards`, `addLogs`, `deleteLogIds`. Leech: lapses ≥ per-class threshold on an Again → suspended + flagged. Undo uses `rollback` with the stored log. History depth 10.
- ReviewScreen: tap flips, swipe right Good / left Again (Easy removed in M2), buttons duplicate the swipes, audio on flip speaks lemma then sentence (paradigm: the six forms), any grade cancels speech. Content per card is loaded through `repo.getBundle` and cached per card id.
- Study by tag: `buildTagSession` in `core/scheduler/session.ts`, route `/review?tag=<t>&all=1`, picker on Today.

## 6. Card creation pipeline

- All drafts are `EntryDraft` (types.ts). Sources: `draftFromImage` (photo → Claude vision), `draftFromText` (≤400 words), `scanText` + later `enrichEntries` (>400 words: compact candidates first), `draftManual`, `parsePasteImport` (Claude-app reply), `parseTsvLines`, `draftsFromTranslateLog`, seed.
- `importService.createBatch` dedupes against active entries and the ignore list, sets frequency rank/priority for single words, splits parent drafts' `fromSentence` words into child suggestions that reuse the parent's generated sentence (`sourceSentence`, `parentSuggestionId`), and stores suggestions grouped `words | phrases | fromSentences`, checked by default unless known or niche.
- `acceptBatch` creates entries/senses/sentences/encounters/production cards, attaches encounters and new senses to existing entries, shares one sentence row per distinct text, generates paradigm cards for verbs against active tenses, returns `createdIds` and `bareIds` (entries without sentences) so the UI can offer enrichment.
- `enrichService.enrichEntryIds` (batches of 20) fills gender/article/note/priority (only if `priorityAuto` and no rank)/regional, adds extra senses and cards, adds a generated sentence when the entry has none, and spawns a child batch from `fromSentence` words.
- Prompt: `buildExtractPrompt` has sections variety, input, items, phrases (three chunking levels), priority rubric, sentences (6–12 words, neutral register, no inserted slang, from-sentence minimal entries), notes, output; `format: "paste"` appends the JSON example headed `VOCABAPP-IMPORT v1`. The paste parser tolerates omitted nullable fields and glosses given as strings.
- Structured outputs: schemas use `.nullable()` everywhere (never `.optional()`), and **no `z.tuple`** (emits `"items": false`, rejected by the SDK transformer; `src/llm/schema.test.ts` guards this).
- Cost meter: `rollUsage` in client.ts accumulates tokens and USD per month/day into settings; `checkSpendCap` blocks calls at 2× the daily cap.

## 7. Verbs and tenses

- `verbs.json` = `{ verbs: { lemma: { en, irregular, gerund, participle, forms: { pres|pret|impf|cond|fut|perf|plusq|subjPres|subjImpf|imp: [1s,2s,3s,1p,2p,3p] } } } }`. Missing verbs fall back to `conjugateRegular` (with c→qu, g→gu, z→c, g→j, gu→g spelling rules; stem changes count as irregular). Reflexive lemmas (-se) get pronouns prefixed except in the imperative.
- Tense plan rows are created on first use from `LANGUAGE.tensePlan` with `pres` active. `setTenseActive` suspends/unsuspends paradigm cards of that tense and generates missing ones. Paradigm rule: irregular verbs in Essential/Core, plus the three model verbs, plus per-verb `paradigmCards: "on"`; `"off"` drops the cards.
- Vosotros row is shown with a "Spain" tag; `settings.showVosotros` hides it; spoken forms skip it when hidden.

## 8. Audio and speech, current limits

- Web Speech on iOS Safari lists only compact voices (Mónica es-ES, Paulina es-MX); the downloaded enhanced Francisca (es-CL) is not exposed, so the "Automatic (es-CL preferred)" setting falls back to es-MX. Natively, `AVSpeechSynthesisVoice.speechVoices()` should list it; verify on the first build.
- iOS needs a user gesture before speech; `WebSpeechPlayer.unlock()` is called on flip. Utterances have a timeout safety net because iOS sometimes never fires `onend`.
- Speech recognition: only Whisper via `openaiKey` from the translate screen (MediaRecorder, `audio/mp4` on iOS). The Web Speech recognition API does not work in installed web apps on iOS. No voice grading exists.
- No background audio: JavaScript is suspended when the screen locks; nothing plays.

## 9. Translate today

- In-app (native, since M3): Apple Translation framework by default (`src/native/translate.ts` over `TranslatePlugin.swift`), Claude as the explicit button; own mic button streams on-device recognition per direction (`NativeLiveTranscriber` over `SpeechPlugin.swift`); every lookup is a `lookups` row; "Create cards" on Import turns unconsumed lookups into an enriched drafts table. The web app keeps Claude + Whisper.
- Lock screen: four Kurzbefehle (see `shortcuts/README.md`) using Apple's on-device Translate; each appends `date ||| dir ||| input ||| translation` to `iCloud Drive/Kurzbefehle/vocab-import/translate-log.txt`. Import picks the file; only rows newer than `settings.translateLogImportedUntil` are used; items ≤ 8 words become drafts, longer ones are skipped.

## 10. Facts that constrain the native phase

- No Mac: iOS builds run on GitHub Actions macOS runners (≈200 free minutes/month on the free plan for private repos, 10× multiplier) or Xcode Cloud (25 h/month with the program). `fastlane match` can create certificates and profiles with an App Store Connect API key on the runner. Capacitor 7 with SPM avoids CocoaPods, so `cap add ios` / `cap sync` run on Windows; only the build needs macOS. Adding extension targets (widget, intents) to the Xcode project without Xcode is impractical by hand; `xcodegen` from a YAML spec in CI or a rented cloud Mac are the realistic options.
- Capacitor plugins known to exist: `@capacitor-community/text-to-speech` (AVSpeechSynthesizer, voice list), `@capacitor-community/speech-recognition` (SFSpeechRecognizer, foreground), `@capacitor/filesystem` (no iCloud container directory), `@capacitor-community/sqlite`, `@capacitor/app` (deep links). Needing custom Swift: Translation framework (a SwiftUI `.translationTask` host), iCloud container file access (`FileManager.url(forUbiquityContainerIdentifier:)` + entitlement), MPRemoteCommandCenter + background audio session, continuous/background speech recognition or SpeechAnalyzer (iOS 26), WidgetKit + App Intents extension with an App Group for shared data, Keychain (or `@capacitor-community/secure-storage`-type plugin).
- iOS widgets cannot host text input; they can deep-link into the app. Lock-screen widgets/controls (iOS 18+) launch the app after Face ID. App Intents can answer via Siri without opening the app.
- Background voice grading while locked needs `audio` background mode with an active play-and-record session; SFSpeechRecognizer on-device tasks must be restarted periodically; SpeechAnalyzer (iOS 26) supports long-form on-device transcription. Wired EarPods buttons via the remote command centre work locked with no microphone.
- WKWebView storage (IndexedDB) persists but is a different origin from Safari's installed web app: migrate by backup export/import.
- Verb table licence is CC BY-NC-SA; frequency list CC BY-SA; both need attribution (README has it) and the former blocks a paid listing.
- The Anthropic key lives in settings on the device; browser calls use `dangerouslyAllowBrowser`. Fine for one user; a second user means a server.

## 11. Known gaps and small bugs to carry over

- Native phase progress (2026-09-22): M1 (wrapper, CI, TestFlight) built and uploaded; its phone checklist is still to be ticked. M2 (Again/Good only, scroll containment with `scrollEnabled: false`, tags with Dexie v2, study by tag, flat drafts table with swipe-to-remove, jobs with progress + cancel) and M3 (first Swift plugins `Speech` and `Translate` registered in `ViewController.swift`, added to the project in CI by `scripts/ios/sync-project.rb`; offline translate with pack download in Settings; live on-device dictation; lookups table + "Create cards" with automatic enrichment of drafts via `enrichBatchDrafts`; manual add with "Complete with AI") are implemented but not yet verified on the phone; M4 is next.
- Fixed 2026-09-21: the schema bug that broke every Claude call, and the English meaning on both sides of conjugation cards.
- `settings.playback = "handsFree"` is defined but unused (M7).
- Suggestion editor edits `generatedSentence.es` and clears its span (the highlight disappears after editing a sentence; recomputed only if `target` is re-derived; acceptable).
- Import screen's Claude-app prompt is generic (`sourceHint` = textbook page); the requested prompt builders (series, textbook, book, context) do not exist yet.
- Translate-log enrichment is manual (Enrich button in Import / after accept in the batch screen).
- Tags: batch tag on import, editable on the entry, filter chips on Words, study-by-tag on Today (since M2).
- Stats screen is minimal (14-day bar chart, retention, counts).
- Diagnostics page is reachable from Settings; it is the place to verify voices/camera/storage on a new build.
- `build-seed.ts` has never been executed; the seed is hand-authored.
