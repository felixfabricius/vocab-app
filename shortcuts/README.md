# Lock-screen translate with iOS Shortcuts (Kurzbefehle)

Four shortcuts give offline, free translation from the lock screen. Each one also appends one line
per lookup to a text file that the app imports later. German iOS names are used throughout;
exact wording can differ slightly between iOS versions.

## One-time preparation

1. **Offline languages.** Einstellungen › Apps › Übersetzen › Geladene Sprachen: download Spanisch and Englisch.
   On the same screen, switch on **Auf dem Gerät-Modus**, so nothing goes to Apple's servers.
2. **Log folder.** Dateien app › Durchsuchen › iCloud Drive › **Kurzbefehle** › tap ⋯ › Neuer Ordner › `vocab-import`.
   The Kurzbefehle folder appears once any shortcut has used a file; if it is missing, create it too.

## The log file

- Path: `iCloud Drive › Kurzbefehle › vocab-import › translate-log.txt`
- One line per lookup, four fields separated by `|||`:

```
2026-09-18T19:05:12+02:00 ||| en-es ||| where is the bathroom ||| ¿Dónde está el baño?
```

  Date, direction (`en-es` or `es-en`), what you typed or said, the translation.
  The file is created automatically by the first lookup.

## Build the first shortcut: "EN→ES Tippen"

Kurzbefehle app › **+** (top right) › tap the name at the top › rename to `EN→ES Tippen`.
Add these actions in order with **Aktion hinzufügen** / the search field at the bottom:

1. **Nach Eingabe fragen**
   - Eingabetyp: *Text*. Frage: `Englisch`.
   - Tap the arrow › **Mehrzeilig zulassen**: off (keeps one lookup on one line).
2. **Text übersetzen**
   - Tap the blue *Text* placeholder › choose the variable **Angegebene Eingabe**.
   - From **Englisch** to **Spanisch**.
3. **Text**
   - Type the line below. The three bracketed items are variables: tap where they go,
     then pick them from the variable bar above the keyboard (or **Variable auswählen**).
   - `[Aktuelles Datum] ||| en-es ||| [Angegebene Eingabe] ||| [Übersetzter Text]`
   - Tap the inserted **Aktuelles Datum** › Datumsformat: **ISO 8601** › **Uhrzeit einschließen**: on.
4. **An Textdatei anhängen**
   - Text: the **Text** from step 3 (usually filled in automatically).
   - Dateipfad: `vocab-import/translate-log.txt` (relative to iCloud Drive › Kurzbefehle).
   - **Neue Zeile erstellen**: on.
5. **Ergebnis anzeigen**
   - Tap the placeholder › **Übersetzter Text**.

Run it once from inside the Kurzbefehle app (▶). Allow file access when asked, then check that
`translate-log.txt` appeared in the Dateien app with one line in it.

The log is written before the result is shown, so swiping the result away never loses a lookup.

## The other three: duplicate and edit

Long-press the finished shortcut › **Duplizieren**, rename, then change only what the table says.

| Shortcut | Step 1 | Step 2 | Direction in step 3 |
|---|---|---|---|
| **EN→ES Sprechen** | Replace with **Text diktieren**: Sprache *Englisch*, Zuhören beenden *Nach Pause* | Input variable: **Diktierter Text** | `en-es` |
| **ES→EN Tippen** | **Nach Eingabe fragen**, Frage `Español` | From **Spanisch** to **Englisch** | `es-en` |
| **ES→EN Sprechen** | **Text diktieren**: Sprache *Spanisch (Chile)* | Input **Diktierter Text**, from **Spanisch** to **Englisch** | `es-en` |

In the Sprechen variants, also replace **Angegebene Eingabe** with **Diktierter Text** in step 3.
The first variable after the direction is always what you entered, the second always the translation;
the app works out which side is Spanish from the direction.

## Put them on the lock screen

- **Lock Screen widget:** long-press the lock screen › Anpassen › Sperrbildschirm › tap the widget row ›
  Kurzbefehle › pick a shortcut. Up to four small widgets fit, one per shortcut.
- **Bottom-corner controls:** in the same Anpassen view, tap the − on a corner control, then + ›
  search "Kurzbefehl" › pick one.
- **Back Tap (works while locked):** Einstellungen › Bedienungshilfen › Tippen › Auf Rückseite tippen ›
  Doppeltippen › pick your most-used shortcut.

## Import into the app

1. App › **Import** › Translate log › **Choose translate-log.txt**.
2. In the file picker: Durchsuchen › iCloud Drive › Kurzbefehle › vocab-import › `translate-log.txt`.
3. Short lookups become suggestions in the inbox; lookups longer than eight words are skipped.
4. Accept the ones you want. The app then offers to enrich them with Claude: example sentence, gender, notes.

The app remembers the newest timestamp it imported. Next time, pick the same file again: only lines
added since then are imported, so you never need to clear the file. Words already in your collection
show up as "known" and stay unchecked.

The app also still accepts the older JSON-per-line format.
