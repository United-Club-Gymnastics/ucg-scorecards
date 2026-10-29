# UCG Scorecard Photos

Phone app at `scorecards.unitedclubgymnastics.org`. The QR printed on every UCG Lineups scorecard opens it on that sheet; a
volunteer photographs the finished card (landscape, inside an on-screen frame) and it uploads. Admins pick Session → Gym →
Apparatus → Squad (→ Page) to view, zoom and download it. **Read `docs/spec.md` before changing behaviour.**

React + TypeScript + Vite on GitHub Pages. Firebase project **`ucg-lineups`** (shared with Lineups): Firestore (read only from
here: meets, `sheetLists`, `admins`), Storage (`scorecards/…`), Auth (anonymous for phones, Google for admins). Push to `main`
runs tests and deploys the site. **`storage.rules` is deployed by hand, only with Julia's go-ahead.** `firestore.rules` lives in
ucg-lineups and is never deployed from here (`firebase.json` has no `firestore` key on purpose).

## Where things live

| What | Where |
|---|---|
| Decisions | `docs/spec.md` |
| Files copied from ucg-lineups | `docs/provenance.md` |
| Pure logic (links, labels, geometry, QR check, retry, picks) | `src/lib/` (`capture.ts`, `store.ts`, `firebase.ts` touch the browser/Firebase) |
| Screens | `src/pages/` |
| Security | `storage.rules` (+ `tests/rules/`) |

## Working style

Same as ucg-lineups (see its CLAUDE.md): two equal owners (Julia, Nate); verify → merge to `main` → push without asking,
**except** anything touching access control, secrets or `storage.rules` (PR + review + Julia's OK). Live rules deploys, bucket
settings (lifecycle) and DNS need Julia's explicit go-ahead each time. Never force-push `main`. No background task chips.
Sessions are titled `JS: …` / `NS: …`.

**Public repo:** never commit real athlete data or real photos (`.gitignore` blocks `*.jpg`). Tests use invented data.

## Verification (before every commit)

`npm run build`, `npx eslint <touched files>`, `npm test` (plus a test for any new pure logic), and `npm run test:rules` when
`storage.rules` changes (needs Java: `export PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH`). Report the commands and output.
WCAG AA contrast on every colour pairing; check pages at 375 / 768 / 1280 px and a phone held sideways (844 × 390).

Local try-out: `npm run emulators` (own ports 8282 / 9098 / 9198, so it can run beside Lineups), `npm run seed:emu`, then
`npm run dev:emu`. A fake card for the camera: `node scripts/qr-matrix.mjs <link> | python3 scripts/test-card.py out.jpg "label"`.
