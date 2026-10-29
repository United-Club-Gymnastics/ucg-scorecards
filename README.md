# UCG Scorecard Photos

`scorecards.unitedclubgymnastics.org` — photograph a finished scorecard from its QR code; admins view the photos by
Session / Gym / Apparatus / Squad. See `docs/spec.md` and `CLAUDE.md`.

```
npm ci
npm test            # unit + page tests
npm run test:rules  # Storage rules on the emulators (needs Java)
npm run build
```

## Going live (one-time, each step needs Julia's go-ahead)

1. Firebase console → **Upgrade `ucg-lineups` to Blaze** (Storage needs it; the free allowance covers this) and set a budget alert.
2. Console → **Storage → Get started** (bucket `ucg-lineups.firebasestorage.app`).
3. Console → **Authentication → Sign-in method → Anonymous: Enable**; **Settings → Authorized domains → add
   `scorecards.unitedclubgymnastics.org`**.
4. Merge ucg-lineups' sheet-list PR, deploy its rules: `npx firebase deploy --only firestore:rules` (in ucg-lineups), and open
   Exports once per meet so each session's sheet list is saved.
5. Here: `npx firebase deploy --only storage --project ucg-lineups` (the CLI asks to let Storage read Firestore for the
   rules: accept).
6. Retention: `gcloud storage buckets update gs://ucg-lineups.firebasestorage.app --lifecycle-file=storage-lifecycle.json`.
7. DNS: CNAME `scorecards` → `united-club-gymnastics.github.io`; then repo Settings → Pages → custom domain + Enforce HTTPS.
