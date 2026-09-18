# Lock-screen translate with iOS Shortcuts

Four shortcuts give offline, free translation from the lock screen and log every lookup
to a file the app imports. They use Apple's on-device translation (download the Spanish
pack once: Settings → Apps → Translate → Downloaded Languages, or the prompt on first use).

## Build each shortcut (Shortcuts app → + )

| Name | Step 1 | Step 2 | Step 3 | Step 4 |
|---|---|---|---|---|
| **EN→ES Type** | Ask for Input (Text), prompt "English" | Translate Text: *Provided Input* from English to Spanish, On-device ON | Show Result: *Translated Text* | Append to Text File (see below), dir `en-es` |
| **EN→ES Speak** | Dictate Text, Language English, Stop listening: After pause | same | same | same |
| **ES→EN Type** | Ask for Input (Text), prompt "Español" | Translate Text from Spanish to English, On-device ON | Show Result | Append, dir `es-en` |
| **ES→EN Speak** | Dictate Text, Language Spanish (Chile) | same | same | same |

### Step 4, the log line

Add a **Text** action with exactly this content (replace `en-es` with `es-en` in the two ES→EN shortcuts).
Insert the variables from the variable picker, and use the **Current Date** action formatted as ISO 8601
(add a *Format Date* action: Date Format → Custom → `yyyy-MM-dd'T'HH:mm:ssZ`):

```
{"at":"<Formatted Date>","dir":"en-es","src":<Provided Input as JSON string>,"dst":<Translated Text as JSON string>}
```

The simplest way to get valid JSON strings: use the **Get Dictionary Value**-free approach below instead:

1. **Dictionary** action with keys `at`, `dir`, `src`, `dst` and the variables as values.
2. **Get Text from Input** on the dictionary → this yields the JSON line.
3. **Append to Text File**: File = `Shortcuts/vocab-import/translate-log.jsonl` in iCloud Drive,
   Text = the JSON from step 2, **Make New Line: ON**.

Turn "Show When Run" off on the Append action so it stays silent.

## Put them on the lock screen

- **Lock Screen widget**: long-press the lock screen → Customize → tap the widget area → Shortcuts → pick a shortcut. Up to four small ones fit.
- **Bottom-corner controls (iOS 18+)**: Customize → tap a corner control → search "Shortcut" → pick one.
- **Control Center**: add "Shortcut" controls the same way.
- **Back Tap**: Settings → Accessibility → Touch → Back Tap → Double Tap → pick a shortcut. Works while locked.

## Import into the app

Import → **Translate log** → pick `translate-log.jsonl` from iCloud Drive/Shortcuts/vocab-import.
Rows are de-duplicated by timestamp, short items become suggestions, long sentences are skipped.
You can clear the file afterwards or leave it; re-imports skip what was already imported in the same file
(the app ignores duplicates within one import; delete old lines occasionally to keep it small).
