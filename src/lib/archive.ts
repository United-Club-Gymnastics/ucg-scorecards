// Pure: what goes in a meet's "download all photos" zip and what each file is called. One folder per session (in the admin's
// Session → Gym order), the newest photo of each sheet under the sheet's own name, earlier versions with the time taken, and
// an index.csv listing every printed sheet (with or without a photo) for the record.
import { eventName, photoFileName, sessionTitle, squadLabel, type SheetEntry, type SheetList } from './sheet';
import type { Discipline } from './apparatus';

export interface ArchivePhoto { path: string; name: string; at: Date | null }

export interface ArchiveFile {
  /** Path inside the zip, e.g. `Session 1 - Green/Floor - Squad A.jpg`. */
  zipPath: string;
  /** The Storage path to download. */
  path: string;
}

export interface IndexRow {
  list: SheetList;
  entry: SheetEntry;
  /** Newest first. */
  photos: ArchivePhoto[];
}

/** Characters a file or folder name cannot hold on Windows or macOS become spaces. */
export const safeName = (s: string): string => s.replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';

/** `2026-10-28 15.30.12 UTC`: when a photo was taken, in a form a file name can hold. */
export function takenStamp(at: Date | null): string {
  if (!at) return 'unknown time';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${at.getUTCFullYear()}-${p(at.getUTCMonth() + 1)}-${p(at.getUTCDate())} ${p(at.getUTCHours())}.${p(at.getUTCMinutes())}.${p(at.getUTCSeconds())} UTC`;
}

/** The zip's own name: `Scorecard photos - Test Nationals.zip`. */
export const zipName = (meetName: string): string => `Scorecard photos - ${safeName(meetName)}.zip`;

/** One folder per session; two sessions with the same title (it should not happen) get `(2)`, `(3)`. */
export function sessionFolders(lists: SheetList[]): Map<string, string> {
  const used = new Map<string, number>();
  const out = new Map<string, string>();
  for (const l of lists) {
    const base = safeName(sessionTitle(l).replace(/ – /g, ' - '));
    const n = (used.get(base.toLowerCase()) ?? 0) + 1;
    used.set(base.toLowerCase(), n);
    out.set(l.sessionId, n === 1 ? base : `${base} (${n})`);
  }
  return out;
}

/** The sheet's own file name without the session part: `Floor - Squad A.jpg`, `Trampoline - Squad C - Page 2.jpg`. */
export function sheetFileName(discipline: Discipline, e: SheetEntry): string {
  return photoFileName({ name: '', location: '', discipline }, e);
}

/** Every photo to put in the zip. The newest version of a sheet takes the plain name; earlier ones add when they were taken. */
export function archiveFiles(rows: IndexRow[], folders: Map<string, string>): ArchiveFile[] {
  return rows.flatMap(({ list, entry, photos }) => {
    const folder = folders.get(list.sessionId) ?? safeName(list.sessionId);
    const base = sheetFileName(list.discipline, entry).replace(/\.jpg$/, '');
    return photos.map((p, i) => ({
      zipPath: `${folder}/${i === 0 ? base : `${base} (earlier, ${takenStamp(p.at)})`}.jpg`,
      path: p.path,
    }));
  });
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * index.csv: one row per printed sheet, in print order. `failed` holds the Storage paths that could not be downloaded, so the
 * record says which photos exist but are not in this zip.
 */
export function indexCsv(rows: IndexRow[], folders: Map<string, string>, failed: Set<string> = new Set()): string {
  const head = ['Session', 'Gym', 'Apparatus', 'Squad', 'Page', 'Photos', 'Newest taken', 'File', 'Note'];
  const files = new Map(archiveFiles(rows, folders).map((f) => [f.path, f.zipPath]));
  const body = rows.map(({ list, entry, photos }) => {
    const newest = photos[0];
    const missed = photos.filter((p) => failed.has(p.path)).length;
    const note = photos.length === 0 ? 'No photo' : missed > 0 ? `${missed} photo${missed === 1 ? '' : 's'} could not be downloaded` : '';
    return [
      list.name, list.location, eventName(list.discipline, entry.event), squadLabel(entry.event, entry.squad),
      entry.pages > 1 ? `${entry.page} of ${entry.pages}` : entry.page, photos.length,
      newest ? takenStamp(newest.at) : '', newest && !failed.has(newest.path) ? files.get(newest.path) ?? '' : '', note,
    ];
  });
  // A byte-order mark so Excel reads the en dashes and accents as UTF-8.
  return '﻿' + [head, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Totals for the "done" message. */
export function archiveSummary(rows: IndexRow[], failed: Set<string>): { sheets: number; withPhoto: number; photos: number; failed: number } {
  const photos = rows.reduce((n, r) => n + r.photos.length, 0);
  return { sheets: rows.length, withPhoto: rows.filter((r) => r.photos.length > 0).length, photos, failed: failed.size };
}
