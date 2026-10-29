// Pure: which sheet a QR link names, what to call it, and where its photos live.
// The link format and parseSheetUrl are copied from ucg-lineups@3588187 src/lib/pdf/sheet-qr.ts — keep in sync by hand
// (changed: only SheetKey, sheetPath and parseSheetUrl, which also accepts the router's `/s/…` path; the QR drawing is Lineups' alone). The sheet list shape is Lineups'
// src/lib/pdf/sheet-list.ts (meets/{meetId}/sheetLists/{sessionId}).
//   https://scorecards.unitedclubgymnastics.org/#/s/<meetId>/<sessionId>/<event>/<squad>/<page>
import { APPARATUS, type Discipline } from './apparatus';

export interface SheetKey {
  meetId: string;
  sessionId: string;
  event: string;
  squad: string;
  page: number;
}

const enc = (s: string) => encodeURIComponent(s);

/** The `<meetId>/<sessionId>/<event>/<squad>/<page>` path; each part URL-encoded. */
export const sheetPath = (k: SheetKey): string => [k.meetId, k.sessionId, k.event, k.squad, String(k.page)].map(enc).join('/');

/** Reads a sheet link (or just its path) back; null when it is not one. */
export function parseSheetUrl(text: string): SheetKey | null {
  const m = /(?:#\/s\/|^\/?s\/|^)([^/#?\s]+)\/([^/#?\s]+)\/([^/#?\s]+)\/([^/#?\s]+)\/(\d+)$/.exec(text.trim());
  if (!m) return null;
  try {
    const [meetId, sessionId, event, squad] = m.slice(1, 5).map(decodeURIComponent);
    const page = Number(m[5]);
    return page >= 1 ? { meetId, sessionId, event, squad, page } : null;
  } catch {
    return null;
  }
}

/** `<event>/<squad>/<page>`, encoded as in the link: a sheet list's `keys` entry, and the Storage folder under the session. */
export const sheetKeyOf = (e: { event: string; squad: string; page: number }): string => [e.event, e.squad, String(e.page)].map(enc).join('/');

export const sameSheet = (a: SheetKey, b: SheetKey): boolean =>
  a.meetId === b.meetId && a.sessionId === b.sessionId && a.event === b.event && a.squad === b.squad && a.page === b.page;

// --- sheet lists (written by Lineups' Exports screen) ---------------------------------------------------------------

export interface SheetEntry {
  event: string;
  squad: string;
  page: number;
  pages: number;
}

export interface SheetList {
  sessionId: string;
  name: string;
  location: string;
  discipline: Discipline;
  sheets: SheetEntry[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** A stored sheet list, tolerating anything malformed (a bad entry is dropped). */
export function parseSheetList(sessionId: string, raw: unknown): SheetList {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const disc = d.discipline === 'MAG' || d.discipline === 'WAG' || d.discipline === 'TNT' ? d.discipline : 'MAG';
  const sheets = (Array.isArray(d.sheets) ? d.sheets : []).flatMap((e): SheetEntry[] => {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const page = Number(x.page);
    if (!str(x.event) || !str(x.squad) || !(page >= 1)) return [];
    return [{ event: str(x.event), squad: str(x.squad), page, pages: Math.max(page, Number(x.pages) || page) }];
  });
  return { sessionId, name: str(d.name), location: str(d.location), discipline: disc, sheets };
}

export const findSheet = (list: SheetList, k: { event: string; squad: string; page: number }): SheetEntry | undefined =>
  list.sheets.find((e) => e.event === k.event && e.squad === k.squad && e.page === k.page);

// --- labels ---------------------------------------------------------------------------------------------------------

/** `Floor`, `Pommel Horse`, `Synchro Trampoline`; an unknown code as itself. */
export function eventName(discipline: Discipline, code: string): string {
  return (APPARATUS[discipline].find((a) => a.code === code) ?? Object.values(APPARATUS).flat().find((a) => a.code === code))?.name ?? code;
}

/** `Session 1 – Green`; just the name when there is no location. */
export const sessionTitle = (l: { name: string; location: string }): string => (l.location ? `${l.name} – ${l.location}` : l.name);

/** `Squad A`; a synchro flight by its name. */
export const squadLabel = (event: string, squad: string): string => (event === 'SY' ? squad : `Squad ${squad}`);

/** `Floor · Squad A`, `Trampoline · Squad C · page 2 of 3`. */
export function sheetLabel(discipline: Discipline, e: { event: string; squad: string; page: number; pages?: number }): string {
  const parts = [eventName(discipline, e.event), squadLabel(e.event, e.squad)];
  if ((e.pages ?? 1) > 1) parts.push(`page ${e.page} of ${e.pages}`);
  return parts.join(' · ');
}

/** A download name like `Session 1 - Green - Floor - Squad A.jpg` (characters a file name cannot hold removed). */
export function photoFileName(list: { name: string; location: string; discipline: Discipline }, e: { event: string; squad: string; page: number; pages?: number }): string {
  const parts = [list.name, list.location, eventName(list.discipline, e.event), squadLabel(e.event, e.squad)];
  if ((e.pages ?? 1) > 1) parts.push(`Page ${e.page}`);
  return `${parts.filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()}.jpg`;
}

// --- storage --------------------------------------------------------------------------------------------------------

/** `scorecards/<meetId>/<sessionId>/<event>/<squad>/<page>`: every photo of one sheet (each part encoded as in the link). */
export const sheetFolder = (k: SheetKey): string => `scorecards/${sheetPath(k)}`;

/** `20261028T153012Z-a1b2c3.jpg`: sorts by time, and two phones shooting the same second never collide. */
export function photoFileId(at: Date, random: () => number = Math.random): string {
  const t = at.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  let r = '';
  for (let i = 0; i < 6; i++) r += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)];
  return `${t}-${r}.jpg`;
}

/** When a photo was taken, from its file id; null when the name is not one. */
export function photoTime(fileName: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-[a-z0-9]{6}\.jpg$/.exec(fileName);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}
