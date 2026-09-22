# Vocab

Personal Spanish (Chile) vocabulary trainer: FSRS spaced repetition with binary self-grading,
and automated card creation from photos, pasted text, subtitle text, a lock-screen translate log,
and the Claude app. Installed as a home-screen web app on iPhone; wrapped natively later.

Product decisions: `SPEC.md`. Technical plan: `PLAN.md`. Code seams for later platforms: `ARCHITECTURE.md`.

## Prerequisites (Windows)

- Node 24 LTS via [fnm](https://github.com/Schniz/fnm): `winget install Schniz.fnm`, then in the repo `fnm use` (reads `.node-version`).
  Add `fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression` to your PowerShell profile so it switches automatically.
- pnpm via corepack (bundled with Node): `corepack enable`. The exact version is pinned in `package.json`.

## Develop

```powershell
pnpm install
pnpm dev          # http://localhost:5173, also on your LAN for the phone (camera/mic need HTTPS; use the deployed URL for those)
pnpm test         # unit tests (vitest)
pnpm typecheck
pnpm build        # typecheck + production build into dist/
```

Reference data is committed under `public/data/` and `public/seed/`. To rebuild from the upstream sources:

```powershell
node scripts/build-verbs.ts        # Jehle verb table -> public/data/verbs.json
node scripts/build-frequency.ts    # OpenSubtitles frequency list -> public/data/frequency.json
node scripts/make-icons.mjs        # PWA icons
```

## Native app "¡A la luna!" (phase 2, TestFlight)

The same code runs in a Capacitor 8 wrapper. `ios/` is generated and committed; builds, signing and TestFlight
uploads happen on GitHub Actions (`.github/workflows/ios.yml`, `fastlane/`), never on Windows. Plan, milestones and
the deferred-items tracker: `PLAN-NATIVE.md`. Native code layout and hand edits: `ios/README.md`.

- After changing plugins or the web build: `pnpm vite build && pnpm exec cap sync ios` locally to check that
  `ios/App/CapApp-SPM/Package.swift` still resolves; CI runs the same steps.
- Trigger a build: push to `main` (paths under `src/`, `ios/`, …) or Actions → iOS → Run workflow. Tick
  `force_match` after changing capabilities on the App ID.
- Install: TestFlight app on the phone, internal testing group.

## Web app (phase 1, frozen)

Deploy on demand only: Actions → CI → Run workflow with `deploy_web`, or locally `pnpm run deploy` (bare `pnpm deploy`
is a different pnpm built-in). The URL is `https://vocab-app.pages.dev`. Migration to the native app: Settings →
Export backup in the web app, Settings → Import backup (Replace) in the native app.

## First run on the phone

1. Settings → Claude API: paste your Anthropic key. Optional: OpenAI key for the microphone in Translate.
2. Settings → Audio → Voice: pick Francisca (es-CL) if listed; download it under iOS Settings → Accessibility → Spoken Content → Voices → Spanish.
3. Settings → Device checks → confirm voices, camera and storage persistence.
4. Lock screen → Customise → add the "Translate" widgets and put a Translate control in a bottom corner.
5. Settings → iCloud Drive: check the folder "A la luna" appears in Files after the first background.

## Costs

Drafting runs on Claude Opus 5 at low effort by default; switch to Sonnet 5 in Settings if the monthly meter matters.
A textbook page is roughly $0.12 on Opus 5, a translate lookup about a cent. The daily spend warning defaults to $1 (hard stop at $2).

## Attribution

- FSRS via [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (MIT)
- Frequency list: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC BY-SA 4.0)
- Conjugations: [Fred Jehle Spanish Verb Database](https://github.com/ghidinelli/fred-jehle-spanish-verbs), compiled by ghidinelli (CC BY-NC-SA 3.0, personal use)
