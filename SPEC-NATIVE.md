# Spec: from web app to native iOS app (phase 2)

Status: revision 2, 2026-09-21, with your answers to Q1–Q22 folded in. Items marked **decided** are settled.
Remaining open questions are numbered **Q1, Q4, Q23–Q25** and collected at the end.
`SPEC.md` stays the source of truth for everything this document does not change.

## 0. Where we are

- The web app (installed from Safari) is in daily use: review, seed, imports, translate tab, Shortcuts-based lock-screen translate.
- Apple Developer Program approved. TestFlight is available; App Review is not needed for personal use.
- Fixed 2026-09-21: every Claude call failed on a schema-validation error (`z.tuple` in the output schema). Conjugation cards show the verb's English meaning on both sides.
- Carried into this spec from the web phase: Francisca voice not selectable in the web app, "Easy" grade still present, no voice review, no in-app offline translation, no sync.

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Minimum iOS | **26** (your phone's version; unlocks SpeechAnalyzer for long-form on-device recognition and the newest Translation/Controls APIs) |
| Build pipeline | **GitHub Actions** macOS runners with fastlane; no Xcode Cloud |
| Cloud Mac | Acceptable if it earns its cost; default is CI. See §2.3 for what it buys under each platform option |
| Translate-log enrichment | **Automatic on import** |
| Lookups → cards | **Manual trigger** that gathers every lookup since the last run (in-app history; the Shortcuts file while it still exists), drafts, enriches, shows the table |
| Manual add | **One free field (Spanish or English) + optional other side + optional tag + "Complete with AI"** |
| Word/phrase split | **Target count + phrase preference (few / balanced / many)**, guidance not fraction |
| Series prompt scope | Everything except **very basic** words (Claude told to skip the ~200 most common function and survival words); the app filters known items |
| Tags | **One tag per batch**, stored on every entry of the batch |
| Groups words / phrases / from-sentences | **Stored, not shown**; the drafts table is flat |
| Grading | **Again / Good only**; swipe right = Good, left = Again |
| Study by tag | **Due + learning + new by default, "include everything" toggle**; counts toward "introduced today"; the daily new-card limit stays a one-tap setting |
| Voice review | **Level 1 now** (screen on), architecture ready for level 2 (locked in pocket); **silence: repeat once, then skip ungraded** |
| Translate entry points | **Lock-screen widget + bottom-corner control, plus home-screen widget**, all deep-linking into the translate screen; **no Siri intent** |
| Translate lookups | **Every lookup becomes a draft** |
| Storage | **iCloud Drive app container** (snapshot + change log); no Windows access needed now |
| Shortcuts | **Removed** once the widget/control path works |
| Web app | **Frozen** once the native app works; no parallel deployment |
| Order of work | As in §8 |

## 2. Platform: Capacitor wrapper vs SwiftUI rewrite (still open, Q1)

### 2.1 Does the swipe survive a Capacitor wrapper?

Yes. The card uses pointer events with `touch-none` on the element, which WKWebView delivers exactly like Safari. The wrapper turns off the web view's own edge-swipe navigation (Capacitor default) and rubber-band scrolling (`ios.scrollEnabled: false`), so nothing competes with the gesture. Tinder-style is the current behaviour: right = Good (yes), left = Again.

### 2.2 Feature by feature: what needs Swift anyway, what is SwiftUI-only

"Plugin" = a small Swift file exposed to the web app through Capacitor's bridge. Rough sizes are lines of Swift.

| Feature | Capacitor wrapper | SwiftUI rewrite | Verdict |
|---|---|---|---|
| Tinder swipe, review UI, drafts table, editors, settings | Existing code, unchanged | Rewrite in SwiftUI | Wrapper wins on effort; parity only |
| FSRS scheduling, session builder, import parsers, prompt builders, dedupe | Existing TypeScript, tested | Port to Swift (swift-fsrs exists; the rest is hand-ported) | Wrapper wins; the logic is the hard-won part |
| Francisca voice (AVSpeechSynthesizer, downloaded enhanced voices) | Plugin, ~60 lines, or `@capacitor-community/text-to-speech` | Direct | Same result either way |
| Voice grading level 1 (screen on): on-device recognition of sí/no | Plugin, ~120 lines | Direct | Same |
| Voice grading level 2 (locked in pocket) | Audio background mode + keep-alive session in a plugin; the review loop stays in JS. JavaScript in a WKWebView keeps running while the app process is kept alive by audio, but Apple does not guarantee it. Fallback: move the loop into the plugin (~300 lines) | Direct; the loop is native from the start | **Native is safer**; wrapper works with a fallback plan |
| Wired EarPods buttons (remote command centre) | Plugin, ~40 lines | Direct | Same |
| Offline translation (Translation framework) | The API is SwiftUI-shaped (`translationTask`); the plugin hosts an invisible SwiftUI view, ~100 lines | Direct | Same result; wrapper slightly awkward |
| Lock-screen widget, bottom-corner control, home-screen widget | An extension target written in Swift/SwiftUI **in both cases** (WidgetKit UI is always SwiftUI), sharing state through an App Group. The Xcode project needs the extra target: generated by `xcodegen` in CI, or added once on a Mac | Same extension, added in Xcode | Same work; project plumbing is easier with a Mac |
| Deep link opens translate screen **with the keyboard already up** | WKWebView blocks programmatic keyboard display without a tap; needs a small web-view configuration override | Trivial | **Native cleaner**; wrapper needs a known workaround |
| Dictation language following the direction | Keyboard dictation follows the keyboard language in both. Our own mic button with on-device recognition in the direction's language works identically in both (plugin vs direct) | Same | Same |
| iCloud Drive container (snapshot + change log) | Plugin, ~80 lines + entitlement | Direct | Same |
| Keychain for the API key | Community plugin | Direct | Same |
| System look (Liquid Glass, native lists, haptics, Dynamic Type) | Web look; haptics via plugin | Native | **SwiftUI only** |
| Live Activities / Dynamic Island for a running review | Not sensible through a web view | Possible | **SwiftUI only**, not requested |
| Debugging on device | Safari Web Inspector needs a Mac; console logs via TestFlight feedback otherwise | Xcode on a Mac | Both want a Mac for debugging |

Summary: nothing you asked for is impossible in the wrapper. Three items are cleaner natively: the locked-phone voice loop, the keyboard-up deep link, and the overall look. Everything else is the same Swift either way, because widgets and system frameworks are Swift regardless of what draws the screens.

### 2.3 What a rented Mac buys, per option

| Need | Wrapper (A) | SwiftUI rewrite (B) |
|---|---|---|
| Adding the widget extension target to the Xcode project | One session, or `xcodegen` in CI instead | Same |
| First signing run, entitlement mistakes (iCloud container, App Groups, background modes) | Usually solvable from CI logs; one session saves a day of 20-minute retries | Same |
| Debugging a crashing plugin or a mis-configured audio session | Xcode console on the simulator; otherwise blind through TestFlight | Same, but far more often |
| Day-to-day UI development | Not needed: web UI runs in the browser on Windows | **Essential**: SwiftUI previews and the simulator are how SwiftUI is written; via CI alone each look takes 20 minutes |
| Running on the physical iPhone from Xcode | Not possible from a cloud Mac (no USB; wireless debugging needs the same network); TestFlight remains the install path | Same limitation |
| Verdict | **Low value** for A: optional, one or two sessions at most; CI covers the rest | **High value** for B: without a Mac, B is not realistic |

Rental options, all controlled by remote desktop or VNC from Windows; prices are rough and worth re-checking:

| Option | Cost | Notes |
|---|---|---|
| MacinCloud pay-as-you-go | about $1 per hour, no minimum | Shared server, fine for a few sessions |
| MacinCloud managed | $30–60 per month | Always-on dedicated login |
| Scaleway Mac mini (Apple silicon) | about €0.10–0.20 per hour, 24-hour minimum | Cheapest per day among dedicated options |
| AWS EC2 Mac | about $0.65–1.10 per hour, 24-hour minimum | Enterprise-grade, overkill here |
| Used Mac mini M1 | €350–450 once | Pays for itself after a few months of rental; also fixes debugging permanently |

### 2.4 Recommendation

Wrapper (A). The only feature where native is materially better is voice review level 2, which you have deferred. Should level 2 later prove unreliable in the wrapper, the review loop alone moves into a native plugin; the rest of the app is unaffected.

- **Q1.** Wrapper (A) or SwiftUI rewrite (B), given §2.2–2.3?
- **Q4.** If A: rent a Mac for one session to add the widget target and run the first signing, or go CI-only with `xcodegen`? If B: the Mac is required; rental or purchase?

## 3. Build and delivery **(decided: GitHub Actions)**

- App Store Connect record created once in the web UI.
- **App name** is the label under the icon and in TestFlight; changeable later. **Bundle identifier** is the reverse-DNS id that uniquely identifies the app to Apple, e.g. `in.fabricius.vocab`; it cannot be changed after the first upload without creating a new app. It also seeds the iCloud container (`iCloud.in.fabricius.vocab`) and App Group (`group.in.fabricius.vocab`) names.
- Signing: `fastlane match` on the runner with an App Store Connect API key creates and stores certificates and profiles in a private repo; nothing is done on a personal machine.
- Pipeline on push to `main`: `pnpm build` → `cap sync ios` → `xcodebuild archive` → upload to TestFlight (internal tester: you). Free tier ≈ 200 macOS minutes/month, one build ≈ 15 minutes.
- iOS project: generated once with Capacitor 7 and SPM (no CocoaPods), committed. Extension targets per Q4.
- Data migration from the web app: Export backup → Import backup (exists). One-time, manual.

- **Q25.** Confirm app name `Vocab` and bundle id `in.fabricius.vocab`, or choose others.

## 4. Card creation

### 4a. In-app, with the API key on the phone

**Lookups → cards (decided).** A single **"Create cards from lookups"** button on Import, with a badge on Today showing how many lookups are waiting. It collects every lookup since the last run from the in-app translate history (and, until the Shortcuts are removed, from the Shortcuts file if the app can read it, else via the picker), creates one draft per lookup, enriches the batch automatically with Claude (sentence, gender/article, priority, regional tag, note), and opens the drafts table. Every lookup becomes a draft, including full sentences; those appear as phrase-type drafts you can delete in the table.

**Manual add (decided).** One field accepting Spanish or English, optional other-language field, optional tag, **Complete with AI** fills the rest and shows an editable draft. Without a key it saves what was typed.

### 4b. Claude-app based, no API calls in the app

Flow: prompt builder → Copy → Claude app (with photo or subtitle text) → copy the reply → paste into the app → drafts table.

**Format:** `VOCABAPP-IMPORT v2`, backwards compatible with v1. Additions: batch-level `tag`, per-item `sentenceSource` (`"source"` | `"generated"`), `glossSource` (original German gloss when the source was German).

**Claude supplies:** lemma, part of speech, gender + article, English meanings, priority estimate, regional flag, note, one sentence (from the source when the item occurred in it, otherwise generated), phrase flag, verb irregularity.

**The app fills in:** duplicate check against the collection and the ignore list, frequency-rank → priority override for single words, conjugation tables from the bundled verb table, paradigm cards for active tenses, audio via the system voice, the batch tag, highlight spans.

**Prompt builders** (fields + Copy button, one shared base prompt):

| Builder | Fields | Behaviour |
|---|---|---|
| Series episode | series, season/episode, tag (default: series), target count, phrase preference | Sentences taken from the subtitles; phrases include collocations and recurring slang; very basic words excluded |
| Textbook page | tag (default: book + page) | Everything on the page; glosses in English; a German gloss is translated to English and kept as `glossSource` |
| Book page | tag, density (unknown-looking words / all content words / everything) | Density is guidance; the app dedupes |
| Context | situation text, target count | No source text; items and sentences invented for the situation |

- **Q23.** German textbook glosses: keep the German as a visible secondary line on the card back, editor-only, or drop it after translation? Default if no answer: editor-only.

### 4c. Drafts table (applies to every multi-card job)

One row per draft: front (English) and back (Spanish with article), a class chip, a status icon (new / known / did-you-mean). Swipe a row to remove, tap to edit in a sheet. A header shows counts and, while a job runs (enrichment, lookup import), a progress bar with cancel. **Accept** saves all remaining rows. Group membership is stored on the draft but not displayed.

## 5. Review

**Grading (decided):** Again / Good. Up-swipe removed. Buttons mirror the swipes.

**Study by tag (decided).** Beside "Review": pick a tag → every active card whose entry carries it, due → learning → new, ignoring session cap and daily new limit; toggle "include everything" adds cards not yet due. Grades update FSRS as usual. New cards graded here count toward "introduced today". The daily new-card limit gets a quick-adjust control on the Today screen.

**Voice review level 1 (decided).** Screen on. Front spoken → pause (you may answer aloud) → back spoken → microphone listens for sí / no / yes / no / "otra vez" (repeat). On-device recognition in es-CL with a tiny vocabulary. Silence: repeat the back once, then skip ungraded. Architecture for level 2 later: the loop is a `VoiceInput` implementation of the existing `InputSource` seam plus the `Transcriber` seam; level 2 adds the audio background mode and a keep-alive session, or moves the loop natively if JS proves unreliable when locked (§2.2).

**EarPods buttons.** One press Good, two presses Again, three presses repeat, via the remote command centre. Works locked; independent of voice.

**Francisca.** Native voice list exposes downloaded enhanced voices; default to the first es-CL voice; verify on the first build.

## 6. Translate

**In-app (decided).** Default offline via the Translation framework (Spanish and English packs installed once). Claude stays an explicit button. Speaker button on every result. Every lookup is logged and becomes a draft on the next "Create cards from lookups".

**Dictation (decided: own mic button).** Keyboard dictation follows the keyboard language, so the app gets its own mic button per field that runs on-device recognition in the direction's language: English for EN→ES, Spanish (Chile) for ES→EN. The keyboard's dictation key keeps working too.

**Entry points (decided):** lock-screen widget, bottom-corner control, home-screen widget, each with EN→ES and ES→EN buttons that deep-link into the translate screen with the field focused. No Siri intent. Shortcuts removed once this works.

## 7. Storage (decided: iCloud Drive container)

The app writes `snapshot.json` (full export) whenever it goes to the background, plus `changes/*.jsonl` from the existing outbox after each session. On launch it compares the local and iCloud snapshots and merges the newer rows. The folder is visible in the Files app under the app's name, so a restore on a new phone is automatic and a manual copy is always possible. Multi-device editing is out of scope; the change log keeps the door open.

## 8. Order of work (decided)

1. Wrapper + CI + TestFlight with the web app unchanged. Verify Francisca, camera, storage, microphone.
2. Grading and swipe change, study by tag, drafts table, tag on entries.
3. Translate in-app (Translation framework, speaker button, mic buttons, history) → "Create cards from lookups" with automatic enrichment; manual add with AI complete.
4. Prompt builders and format v2.
5. iCloud container storage.
6. Widgets and control with deep links; remove Shortcuts.
7. Voice review level 1, EarPods buttons.

## Open questions, remaining

| # | Topic | Question |
|---|---|---|
| Q1 | Platform | Wrapper (A) or SwiftUI rewrite (B)? See §2.2–2.4 |
| Q4 | Build | If A: one Mac session for the widget target and first signing, or CI-only with xcodegen? If B: rent or buy? |
| Q23 | Creation | German textbook glosses: card back, editor-only, or dropped? |
| Q25 | Delivery | App name `Vocab`, bundle id `in.fabricius.vocab`? |
