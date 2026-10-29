// Pure: does the QR code read from a photo name the sheet the person scanned? A warning only, never a block: the code may be
// out of focus or cut off, and the person can still upload.
import { parseSheetUrl, sameSheet, type SheetKey } from './sheet';

export type QrCheck =
  | { kind: 'match' }
  | { kind: 'other'; found: SheetKey }
  | { kind: 'unread' };

/** `text` is what the QR decoder found in the photo, or null when it found no code. */
export function checkQr(text: string | null, expected: SheetKey): QrCheck {
  const found = text ? parseSheetUrl(text) : null;
  if (!found) return { kind: 'unread' };
  return sameSheet(found, expected) ? { kind: 'match' } : { kind: 'other', found };
}
