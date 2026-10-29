// Browser side of "download all photos for this meet": list every sheet's photos, download them a few at a time and stream
// them into one zip (stored, not compressed: JPEGs do not shrink), with index.csv. Loaded only when an admin asks for it, so
// fflate stays out of the main bundle. Names and the index are in archive.ts.
import { Zip, ZipPassThrough, strToU8 } from 'fflate';
import { archiveFiles, archiveSummary, indexCsv, sessionFolders, type ArchivePhoto, type IndexRow } from './archive';
import { gymsFor, sessionNames } from './pick';
import type { SheetKey, SheetList } from './sheet';

export interface ExportDeps {
  listPhotos: (k: SheetKey) => Promise<ArchivePhoto[]>;
  getPhoto: (path: string) => Promise<Blob>;
}

export type ExportProgress =
  | { k: 'listing'; done: number; total: number }
  | { k: 'downloading'; done: number; total: number };

export interface ExportResult {
  blob: Blob;
  sheets: number;
  withPhoto: number;
  photos: number;
  failed: number;
}

export class ExportCancelled extends Error {
  constructor() { super('Cancelled'); }
}

const LISTS_AT_ONCE = 8;
const PHOTOS_AT_ONCE = 4;

/** Runs `work` on every item, at most `limit` at a time; stops starting new ones once `signal` aborts. */
async function eachLimited<T>(items: T[], limit: number, signal: AbortSignal | undefined, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new ExportCancelled();
      await work(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

/** The meet's sessions in the admin's order: session name, then the meet's gym order. */
export function orderedLists(lists: SheetList[], gymOrder: string[]): SheetList[] {
  return sessionNames(lists).flatMap((name) => gymsFor(lists, name, gymOrder));
}

export async function exportMeet(
  meetId: string,
  lists: SheetList[],
  deps: ExportDeps,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const rows: IndexRow[] = lists.flatMap((list) => list.sheets.map((entry) => ({ list, entry, photos: [] as ArchivePhoto[] })));
  let listed = 0;
  onProgress({ k: 'listing', done: 0, total: rows.length });
  await eachLimited(rows, LISTS_AT_ONCE, signal, async (r) => {
    r.photos = await deps.listPhotos({ meetId, sessionId: r.list.sessionId, event: r.entry.event, squad: r.entry.squad, page: r.entry.page });
    onProgress({ k: 'listing', done: ++listed, total: rows.length });
  });

  const folders = sessionFolders(lists);
  const files = archiveFiles(rows, folders);
  const parts: BlobPart[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else parts.push(chunk as Uint8Array<ArrayBuffer>);
  });
  const add = (name: string, data: Uint8Array) => {
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(data, true);
  };

  const failed = new Set<string>();
  let done = 0;
  onProgress({ k: 'downloading', done: 0, total: files.length });
  await eachLimited(files, PHOTOS_AT_ONCE, signal, async (f) => {
    try {
      add(f.zipPath, new Uint8Array(await (await deps.getPhoto(f.path)).arrayBuffer()));
    } catch {
      failed.add(f.path);
    }
    onProgress({ k: 'downloading', done: ++done, total: files.length });
  });
  if (signal?.aborted) throw new ExportCancelled();

  add('index.csv', strToU8(indexCsv(rows, folders, failed)));
  zip.end();
  if (zipError) throw zipError;
  return { blob: new Blob(parts, { type: 'application/zip' }), ...archiveSummary(rows, failed) };
}
