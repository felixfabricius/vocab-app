# Spec: from web app to native iOS app (phase 2)

Status: draft for alignment, 2026-09-21. Nothing in here is decided unless marked **decided**.
Open questions are numbered **Q1…Q26** and collected at the end so they can be answered in one go.
`SPEC.md` stays the source of truth for everything this document does not change.

## 0. Where we are

- The web app (installed from Safari) is in daily use: review, seed, imports, translate tab, Shortcuts-based lock-screen translate.
- Apple Developer Program: approved. TestFlight is therefore available; App Review is not needed for personal use.
- Fixed on 2026-09-21: every Claude call failed with "JSON schema must have a type defined…" (a `z.tuple` in the output schema). Conjugation cards now show the verb's English meaning on both sides.
- Still open from the web phase and carried into this spec: Francisca voice not selectable in the web app, "Easy" grade still present, no voice review, no in-app offline translation, no sync.

## 1. Platform decision

Two credible routes. The choice affects everything below, so it comes first.

| | A. Capacitor wrapper around the existing web app | B. Native SwiftUI rewrite |
|---|---|---|
| Reuse | ~90 % of current code (review, scheduler, imports, parsers, prompts, storage) | Core logic must be ported to Swift: FSRS (swift-fsrs exists), session builder, import service, paste parser, prompt builders |
| Native pieces needed anyway | Small Swift plugins: text-to-speech with voice selection, speech recognition, Translation framework, iCloud container, remote-control buttons, background audio session, widget + App Intent extension | Same features, but first-class: WidgetKit, App Intents, AVSpeech, SFSpeech/SpeechAnalyzer, Translation, CloudKit or iCloud Drive |
| Fit with your constraints | Development stays on Windows in TypeScript; Swift is confined to ~6 small files | Every change needs a macOS build to see; without a Mac the loop is CI → TestFlight (15–25 min) |
| UI quality | Web view; fine for this app, no Liquid Glass, keyboard/scroll quirks occasionally | Native feel, system components |
| Risk | Plugin maintenance; Xcode project edits (extension targets) without a Mac are painful | Time: realistically 3–5× the effort of A before feature parity |

Recommendation: **A**, with the web app kept as-is inside the wrapper, and a rule that anything needing an OS API becomes a small Swift plugin behind the existing seams (`ARCHITECTURE.md`). Revisit B only if the web view turns out to be the bottleneck for hands-free review.

- **Q1.** Capacitor wrapper (A) or SwiftUI rewrite (B)?
- **Q2.** Minimum iOS version: 18 (Translation framework, controls) or 26 (SpeechAnalyzer for long-form on-device recognition, your phone's version)? iOS 26 is simpler if the phone is the only target.

## 2. Build and delivery without a Mac

- Bundle id, app name, App Store Connect record: created once in the ASC web UI (no Mac needed).
- Signing: certificates and profiles created and stored by `fastlane match` running on a GitHub Actions macOS runner, using an App Store Connect API key. No personal Mac involved.
- Build + upload: GitHub Actions macOS runner runs `pnpm build`, `cap sync`, `xcodebuild archive`, uploads to TestFlight. Free tier ≈ 200 macOS minutes/month, one build ≈ 15 min. Alternative: Xcode Cloud (25 h/month included with the program), configured from App Store Connect; verify that first-time workflow creation works without Xcode.
- The iOS project itself: generated once (`cap add ios`, SPM package manager so no CocoaPods) and committed. Extension targets (widget, App Intents) cannot be added sensibly by hand-editing the project file; options: generate the project from a YAML spec with `xcodegen` in CI, or rent a cloud Mac for a day for that step.
- Install on the phone: TestFlight app, internal tester = you. Builds expire after 90 days; CI re-uploads on every push to `main`.
- Data migration from the web app: Settings → Export backup in the web app, Import backup in the native app. Already implemented. Web storage and the wrapper's storage are separate origins, so this is a one-time manual step.

- **Q3.** GitHub Actions + fastlane, or Xcode Cloud?
- **Q4.** Are you willing to rent a cloud Mac for one or two sessions (widget extension, first signing run, on-device debugging), or must everything go through CI?

## 3. Card creation

### 3a. Fully in-app, with the API key on the phone

**Translate log → cards, automatic.** On import of `translate-log.txt`, every new lookup becomes a draft, and the app immediately calls Claude to enrich the batch (one call per 20 items): one example sentence, gender/article, priority, regional tag, note. Result lands in the drafts table (3c) for review. Cost: about a cent per lookup.

- **Q5.** Should the enrichment run automatically on import (current behaviour is a manual "Enrich" button), or only after you have accepted the drafts, so excluded lookups cost nothing?
- **Q6.** The Shortcuts still write the log to iCloud Drive and the app imports it with a file picker. Natively the app can read that file itself on launch (iCloud Drive container, see §6) and do the import unattended. Wanted?

**Manual add.** Proposed minimal form: one text field that accepts Spanish *or* English, an optional second field for the other language, an optional tag, then **Complete with AI**, which fills everything else (part of speech, gender/article, senses, sentence, priority, regional, note) and shows the result as an editable draft before saving. Without a key the form saves what was typed.

- **Q7.** Is that the right minimal form, or do you want part of speech and tag as required fields?

### 3b. Claude-app based, no API calls in the app

The app is the parser, deduper and completer; Claude in the Claude app is the extractor. Flow: prompt builder → copy → Claude app (with photo or subtitle text) → copy reply → paste into the app → drafts table.

**Format (decided in the web phase, kept):** a fenced JSON block headed `VOCABAPP-IMPORT v1`, schema in `src/llm/schema.ts`. Proposed additions for v2: a batch-level `tag`, per-item `sentenceSource` ("series" | "generated"), and `episodeRef`. Old v1 blocks stay accepted.

**What Claude supplies:** lemma, part of speech, gender + article, meanings, priority estimate, regional flag, note, one sentence (from the source when the item occurred in it, otherwise generated), phrase flag, verb irregularity.

**What the app fills in:** duplicate check against the collection and the ignore list, frequency rank → priority override for single words, conjugation tables from the bundled verb table, paradigm cards for active tenses, audio via the system voice, tag assignment, encounter/highlight spans.

**Prompt builders** (input fields + Copy button, all sharing one base prompt with the format rules):

| Builder | Variables | Notes |
|---|---|---|
| Series episode | series, season/episode, tag (default: series name), target item count, phrase preference (few / balanced / many) | Sentences taken from the subtitles themselves; phrases include collocations (hacer planes) and slang if it recurs |
| Textbook page | tag (default: book name + page) | Everything on the page; adjacent English/German glosses used as hints |
| Book page | tag, density (only unknown-looking words / all content words / everything) | Density is a rough instruction; the app dedupes anyway |
| Context | free-text situation ("playing basketball with Chileans"), target count | No source text; Claude invents the items and sentences |

- **Q8.** Fraction of single words vs phrases: fixed number, or guidance only? Proposal: a target *count* plus a three-way phrase preference, and the instruction "prefer a phrase over its parts whenever the phrase is not derivable from them". A hard fraction would force filler in episodes that are mostly one or the other.
- **Q9.** Should the series prompt also ask for the 20 most useful *unknown-looking* items only, or for everything and let the app filter known ones? (Claude does not know your collection; the known-lemma list can be pasted into the prompt but it is already 300+ words and growing.)
- **Q10.** Tag semantics: one tag per batch (simple) or multiple tags per entry (episode + series + "slang")?

### 3c. Batch overview (applies to every multi-card job)

Replace the current grouped inbox with a **drafts table**: one row per draft, columns front (English) / back (Spanish, with article), a class chip, a status icon (new / known / did-you-mean). Rows are removable with a swipe, editable with a tap (sheet). A header shows counts and, while a job runs (enrichment, log import), a progress bar with cancel. Accept saves all remaining rows.

- **Q11.** Keep the three groups (words / phrases / from sentences) as sections inside the table, or a flat list sorted by class?

## 4. Review

**Grading (decided by you): Again / Good only.** Easy is removed from buttons and swipes. Swipe right = Good, swipe left = Again; up does nothing. FSRS handles binary grading without changes.

**Study by tag.** A second entry point beside "Review": pick a tag, get every active card whose entry carries it, in the order due → learning → new, ignoring the daily new-card limit and the session cap. Grades update FSRS exactly as in a normal session, so a card reviewed here is simply not due in the normal session later. Cards introduced here count as "introduced today" for the normal limit (otherwise the same day could introduce 20 + N new cards); this is the one coupling.

- **Q12.** Include cards that are not due yet (ahead of schedule)? Doing so is "cramming"; FSRS tolerates it but it inflates stability less than a due review would. Proposal: include only due, learning and new cards by default, with an "include everything" toggle.
- **Q13.** Should tag study count toward "introduced today", as proposed, or be fully independent?

**Voice review (sí / no).** Two levels:

1. *Screen on, phone in hand or on the table:* front is spoken, pause, you may speak the answer, back is spoken, then the microphone listens for "sí" / "no" (also "yes" / "no", "otra vez" = repeat). On-device recognition; no cost. Feasible in the wrapper with a plugin.
2. *Phone locked in the pocket:* requires the audio background mode, an audio session in play-and-record, and continuous on-device recognition restarted every minute (SFSpeechRecognizer) or a long-form SpeechAnalyzer session (iOS 26). Feasible but the most fragile feature in this spec: battery, orange mic indicator, iOS may still suspend after long inactivity, wired EarPods mic works but picks up pocket noise. Effort: roughly the same as everything else in §4 combined.

Cheaper hands-free path that works locked: wired EarPods buttons via the remote command centre (one press Good, two presses Again, three presses repeat). Rock solid on iOS, no microphone, no recognition.

- **Q14.** Build level 1 only, or also level 2? Proposal: level 1 plus EarPods buttons now; level 2 later if the buttons are not enough.
- **Q15.** In voice mode, silence after the answer: repeat once then skip ungraded (current spec), or treat silence as Again?

**Francisca voice.** The web app cannot see enhanced voices through Safari, which is why only Mexican and Spain voices appear. Natively, `AVSpeechSynthesisVoice.speechVoices()` lists downloaded enhanced voices, so Francisca (es-CL) becomes selectable; the app defaults to the first es-CL voice. To verify on the first TestFlight build.

**Conjugation cards:** English meaning on both sides (done). Paradigm audio: forms read one after another with a short gap (already implemented).

## 5. Translate

**In-app, default offline.** Apple's Translation framework (iOS 18+) with the Spanish and English packs installed once; runs on device, free. Claude stays an explicit button per lookup. Each result has a speaker button (Francisca for Spanish, system English voice for English). Lookups are logged in the app's own history and become drafts exactly like the Shortcuts log. The Shortcuts can then be retired or kept as a fallback.

**Home screen / lock screen.** Widgets on iOS cannot contain text fields or keyboards; they only display content and offer buttons. So "translation fields on the home screen" is not possible as a widget. What is possible:

| Option | Taps to first keystroke | Works locked |
|---|---|---|
| Home-screen widget with two buttons (EN→ES, ES→EN) that open the app straight into the translate screen with the keyboard already up | 1 | No (unlock, then 1) |
| Lock-screen widget / bottom-corner control doing the same | 1 after Face ID | Yes |
| Siri / App Intent: "Hey Siri, Spanish for 'where is the bathroom'" — spoken answer, no UI | 0 | Yes |
| Keep the Shortcuts | 1 after Face ID, then their own UI | Yes |

- **Q16.** Which of these do you want first? Proposal: widget + lock-screen control that deep-link into the translate screen, plus the App Intent for Siri.
- **Q17.** Should the in-app translate history *automatically* create drafts (every lookup) or only on tap ("Add as card")? The Shortcuts log currently creates drafts for everything short.

## 6. Storage and sync

Today: IndexedDB on the phone, manual JSON backup. Options for "not tied to the phone":

| Option | What it gives | Effort | Limits |
|---|---|---|---|
| **iCloud Drive app container** | The app writes a JSON snapshot plus an append-only change log into its own iCloud folder; iOS syncs it; the folder is visible in the Files app and on any Mac/PC with iCloud Drive | Small Swift plugin (container URL + file coordination) | One writer at a time; a second device would need merge logic (the outbox already exists for that) |
| **CloudKit private database** | Structured per-record sync between your devices, Apple-hosted, free | Medium; Swift plugin or a Capacitor community plugin; schema per table | iOS/macOS only; not readable from Windows |
| **Own endpoint** (Cloudflare Worker + D1) | Platform-independent, reachable from the PC, basis for any future second user | Medium; auth token, sync protocol over the outbox | Not free forever if it grows; you run it |
| Backup only (status quo, automated) | Nightly JSON export to the iCloud container | Smallest | Restore is manual |

Recommendation: iCloud Drive container with snapshot + change log as the first step (covers "not tied to the phone", makes the data visible on your PC through iCloud for Windows, and the Windows side can later become the second writer through the change log). CloudKit only if a second Apple device appears; the Worker only if the PC needs to write or a second person joins.

- **Q18.** Is "readable and restorable from the PC" the goal, or true multi-device editing?
- **Q19.** Is iCloud for Windows installed or acceptable on the PC?

## 7. Other

- The API key moves from web storage to the iOS Keychain (Capacitor secure-storage plugin). Still personal use; no server.
- Shortcuts: keep the four for now; retire once the widget/control path exists (Q16).
- Non-commercial licence of the verb table: fine for TestFlight/personal use; blocks a paid App Store listing.
- Not in phase 2: pre-generated cloud audio (Azure), Batch API queue, multi-user, Android.

- **Q20.** App name and bundle identifier (e.g. `in.fabricius.vocab`)?
- **Q21.** Should the web app keep being deployed in parallel (as a fallback), or freeze it once TestFlight works?

## 8. Suggested order of work (after answers)

1. Wrapper + CI + TestFlight with the web app unchanged. Verify Francisca, camera, storage, mic.
2. Grading and swipe change, study by tag, drafts table.
3. Translate in-app (Translation framework) + speaker button + history → drafts; automatic log enrichment.
4. Prompt builders and format v2.
5. iCloud container storage.
6. Widget/control + App Intent.
7. Voice review level 1, EarPods buttons; level 2 if wanted.

- **Q22.** Agree with the order, or should translate/widgets come before study-by-tag and the drafts table?

## Open questions, collected

| # | Topic | Question |
|---|---|---|
| Q1 | Platform | Capacitor wrapper (A) or SwiftUI rewrite (B)? |
| Q2 | Platform | Minimum iOS 18 or 26? |
| Q3 | Build | GitHub Actions + fastlane or Xcode Cloud? |
| Q4 | Build | Cloud Mac for one or two sessions acceptable? |
| Q5 | Creation | Enrich translate-log drafts automatically on import, or after acceptance? |
| Q6 | Creation | App reads the Shortcuts log from iCloud itself, unattended? |
| Q7 | Creation | Manual-add form: one free field + AI complete, or more required fields? |
| Q8 | Creation | Word/phrase split: count + preference, or a fixed fraction? |
| Q9 | Creation | Series prompt: everything (app filters) or "most useful N"? |
| Q10 | Creation | One tag per batch or multiple tags per entry? |
| Q11 | Creation | Drafts table: sections or flat list? |
| Q12 | Review | Tag study includes not-yet-due cards? |
| Q13 | Review | Tag study counts toward "introduced today"? |
| Q14 | Review | Voice review: level 1 (+ EarPods buttons) only, or also locked-in-pocket? |
| Q15 | Review | Silence in voice mode: skip or Again? |
| Q16 | Translate | Widget/control deep link, Siri intent, Shortcuts: which first? |
| Q17 | Translate | In-app lookups auto-create drafts or on tap? |
| Q18 | Storage | PC-readable backup, or multi-device editing? |
| Q19 | Storage | iCloud for Windows on the PC acceptable? |
| Q20 | Other | App name and bundle id? |
| Q21 | Other | Keep deploying the web app in parallel? |
| Q22 | Plan | Order of work as proposed? |
