# Files copied from other UCG repos

Keep in sync by hand. Each file says where it came from in its first line.

| Here | From | Changed |
|---|---|---|
| `src/index.css` | ucg-lineups@3588187 `src/index.css` (itself from ucg-platform) | `.app-loading` added at the end |
| `src/components/Select.tsx`, `select.css` | ucg-lineups@3588187 | none |
| `src/lib/apparatus.ts` | ucg-lineups@3588187 `src/lib/apparatus.ts` (itself from ucg-platform) | none |
| `src/lib/sheet.ts` (`SheetKey`, `sheetPath`, `parseSheetUrl`) | ucg-lineups@3588187 `src/lib/pdf/sheet-qr.ts` | parser also accepts the router's `/s/…` path |
| `src/lib/firebase.ts` (config) | ucg-lineups `src/lib/firebase.ts` | Storage, anonymous sign-in, own emulator ports |
| `storage.rules` `isAdmin()` | ucg-lineups `firestore.rules` | `firestore.exists` for `admins/` |
| `tests/helpers/select.ts` | ucg-lineups@3588187 | none |
| `public/` icons, `robots.txt`, configs | ucg-lineups | `CNAME` |
