# Scorecard photo app: spec

Julia's decisions (2026-10-28) are marked ✔.

## 1. Stack and hosting
- ✔ New repo `United-Club-Gymnastics/ucg-scorecards`, GitHub Pages at `scorecards.unitedclubgymnastics.org` (Pages allows one
  domain per repo, so not a second Lineups site).
- ✔ Firebase project `ucg-lineups` reused: meets, sheet lists and admins are already there.

## 2. The link (printed by Lineups)
`https://scorecards.unitedclubgymnastics.org/#/s/<meetId>/<sessionId>/<event>/<squad>/<page>`. Every part URL-encoded; event is
an apparatus code, TR/DM/TU, or SY (squad = synchro flight name); page is 1-based within that squad's list for that event.
Format and parser are copied from Lineups `src/lib/pdf/sheet-qr.ts`.

## 3. Sheet lists (written by Lineups)
✔ Lineups' Exports screen saves `meets/{meetId}/sheetLists/{sessionId}` = `{ name, location, discipline, sheets: [{ event,
squad, page, pages }], keys: ['<event>/<squad>/<page>'] }` (public **get**, no list; admin write; no athlete data). The phone
reads it to name the sheet; Storage rules accept a photo only for a listed key; admins see which sheets have no photo.
A session's list exists once someone has opened Exports in Lineups after its squads were saved.

## 4. Photo flow (phone)
- Scanning opens the sheet and names it: meet, `Session 1 – Green`, `Floor · Squad A` (T&T: `· page 2 of 3`). An unknown link
  or a sheet not in the list: "We can't find this scorecard".
- Take photo → the back camera, full screen. For a landscape scorecard the phone must be held **sideways**: upright shows
  "Turn your phone sideways" (a web page cannot lock rotation). The portrait synchro sheet may be shot either way; its page
  says to hold the phone **upright**, and upright the controls sit along the bottom. The camera is asked for its sensor's own 4:3 picture at full size and the whole picture
  is shown (nothing cut off). A frame the shape of the sheet (landscape Letter; the portrait synchro sheet gets an upright
  frame inside the landscape view) fills 85% of its height and shows where the card goes. The kept photo is that frame plus a 4% margin, from the
  camera's full resolution, scaled to at most 2400 px on the long side, JPEG 85%.
- No camera access (blocked, old browser): "Use the camera app" (the phone's own camera); a photo taller than wide is refused,
  except for the synchro sheet.
- Review: Retake / Use photo. The QR in the photo is read (jsQR: the top-left corner, then that corner enlarged 2×, then the whole photo): ✓ matches, a warning naming the other
  sheet, or "couldn't read the code" — never a block.
- Upload: progress; on a weak signal "Weak signal — still trying…", the photo is kept in the page, retries back off
  2 s → 30 s forever while the page is open and go at once when the phone is back online; leaving mid-upload asks first.
  Refused by the rules: "Not uploaded" with the reason. Success: "✓ Photo uploaded … at 3:12 PM".

## 5. Storage
✔ Firebase Storage, `scorecards/<meetId>/<sessionId>/<event>/<squad>/<page>/<yyyymmddThhmmssZ>-<6 chars>.jpg` (parts encoded
as in the link). JPEG only, under 8 MB, metadata only `qr` (match / other / unread). Never overwritten: a re-shoot is a new
version; each upload try gets a new name. The file carries `Content-Disposition: attachment; filename="Session 1 - Green -
Floor - Squad A.jpg"` so the admin's Download link saves it under that name.

## 6. Who can do what
- ✔ Upload: anyone with the QR link, no login (Firebase anonymous sign-in), only for listed sheets. App Check (reCAPTCHA) may
  be added later; rules cannot rate-limit, so the sheet-list check and size limit are the guard.
- ✔ View, list, delete: admins only — a verified @unitedclubgymnastics.org account or `admins/{email}` (same as Lineups).
- ✔ Retention: 18 months, then a bucket lifecycle rule deletes them (`storage-lifecycle.json`). Admins can delete a single
  version after confirming.

## 7. Admin view
Sign in with Google. Meet (newest first, remembered per browser) → Session (natural order) → Gym (the meet's gym order) →
Apparatus (print order) → Squad / Flight → Page (only when more than one). Shows the newest photo: Fit / 1.5× / 2× / 3× zoom
(click toggles), Download, Delete…, and every version. Below: "N of M sheets have a photo" and a **No photo yet** list that
opens a sheet when chosen, with a **Has a photo** list above it. Over the photo the scroll wheel zooms (1×–5×, about the
pointer) and dragging with the left or middle button pans; a click without a drag toggles Fit / 2×.

**Download all photos for this meet (.zip)** (under the pickers), for keeping a record before the 18-month auto-delete: built in
the browser (`src/lib/export.ts`, names in `src/lib/archive.ts`). One folder per session (`Session 1 - Green`), in picker
order; the newest photo of a sheet is `Floor - Squad A.jpg`, earlier versions `Floor - Squad A (earlier, 2026-10-24 15.20.00
UTC).jpg`. `index.csv` lists every printed sheet: session, gym, apparatus, squad, page, photo count, newest time, file, and a
note (`No photo`, or how many photos could not be downloaded). A failed photo does not stop the rest. Shows progress and can be
cancelled. Holds the whole zip in memory, so use a laptop for a big meet.
