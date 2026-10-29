import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { archiveFiles, archiveSummary, indexCsv, safeName, sessionFolders, takenStamp, zipName, type IndexRow } from '../../src/lib/archive';
import { ExportCancelled, exportMeet, orderedLists } from '../../src/lib/export';
import type { SheetList } from '../../src/lib/sheet';

// Invented data only.
const sheets = (rows: [string, string, number, number][]) => rows.map(([event, squad, page, pages]) => ({ event, squad, page, pages }));
const GREEN: SheetList = { sessionId: 's1-green', name: 'Session 1', location: 'Green', discipline: 'MAG', sheets: sheets([['FX', 'A', 1, 1], ['PH', 'A', 1, 1]]) };
const ORANGE: SheetList = { sessionId: 's1-orange', name: 'Session 1', location: 'Orange', discipline: 'MAG', sheets: sheets([['FX', 'A', 1, 1]]) };
const PURPLE: SheetList = { sessionId: 's2-purple', name: 'Session 2', location: 'Purple', discipline: 'TNT', sheets: sheets([['TR', 'C', 2, 3], ['SY', 'Flight 1/2', 1, 1]]) };
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 24, h, m, 5));
const photo = (folder: string, h: number, m: number) => ({ path: `scorecards/t/${folder}/${h}${m}.jpg`, name: `${h}${m}.jpg`, at: at(h, m) });

describe('download-all names', () => {
  it('makes safe file names and readable times', () => {
    expect(safeName('Flight 1/2: "Novice"')).toBe('Flight 1 2 Novice');
    expect(safeName('  ')).toBe('Untitled');
    expect(takenStamp(at(9, 7))).toBe('2026-10-24 09.07.05 UTC');
    expect(takenStamp(null)).toBe('unknown time');
    expect(zipName('Test Nationals 2026')).toBe('Scorecard photos - Test Nationals 2026.zip');
  });

  it('gives each session its own folder, numbering a repeated title', () => {
    const twin = { ...GREEN, sessionId: 's1-green-b' };
    expect([...sessionFolders([GREEN, PURPLE, twin]).values()]).toEqual(['Session 1 - Green', 'Session 2 - Purple', 'Session 1 - Green (2)']);
  });

  it('names the newest photo after the sheet and earlier versions by when they were taken', () => {
    const rows: IndexRow[] = [
      { list: GREEN, entry: GREEN.sheets[0], photos: [photo('fx', 15, 30), photo('fx', 15, 20)] },
      { list: PURPLE, entry: PURPLE.sheets[0], photos: [photo('tr', 16, 0)] },
      { list: PURPLE, entry: PURPLE.sheets[1], photos: [photo('sy', 16, 5)] },
    ];
    expect(archiveFiles(rows, sessionFolders([GREEN, PURPLE])).map((f) => f.zipPath)).toEqual([
      'Session 1 - Green/Floor - Squad A.jpg',
      'Session 1 - Green/Floor - Squad A (earlier, 2026-10-24 15.20.05 UTC).jpg',
      'Session 2 - Purple/Trampoline - Squad C - Page 2.jpg',
      'Session 2 - Purple/Synchro Trampoline - Flight 1 2.jpg',
    ]);
  });

  it('lists every sheet in index.csv, with missing and failed photos marked', () => {
    const rows: IndexRow[] = [
      { list: GREEN, entry: GREEN.sheets[0], photos: [photo('fx', 15, 30), photo('fx', 15, 20)] },
      { list: GREEN, entry: GREEN.sheets[1], photos: [] },
      { list: PURPLE, entry: PURPLE.sheets[0], photos: [photo('tr', 16, 0)] },
    ];
    const failed = new Set([rows[2].photos[0].path]);
    const csv = indexCsv(rows, sessionFolders([GREEN, PURPLE]), failed);
    expect(csv.startsWith('﻿Session,Gym,Apparatus,Squad,Page,Photos,Newest taken,File,Note\r\n')).toBe(true);
    const lines = csv.trim().split('\r\n').slice(1);
    expect(lines).toEqual([
      'Session 1,Green,Floor,Squad A,1,2,2026-10-24 15.30.05 UTC,Session 1 - Green/Floor - Squad A.jpg,',
      'Session 1,Green,Pommel Horse,Squad A,1,0,,,No photo',
      'Session 2,Purple,Trampoline,Squad C,2 of 3,1,2026-10-24 16.00.05 UTC,,1 photo could not be downloaded',
    ]);
    expect(archiveSummary(rows, failed)).toEqual({ sheets: 3, withPhoto: 2, photos: 3, failed: 1 });
  });

  it('quotes CSV cells that hold commas or quotes', () => {
    const odd: SheetList = { ...GREEN, name: 'Session 1, "Day 2"' };
    const csv = indexCsv([{ list: odd, entry: odd.sheets[0], photos: [] }], sessionFolders([odd]));
    expect(csv).toContain('"Session 1, ""Day 2""",Green');
  });
});

describe('exportMeet', () => {
  const deps = (fail: string[] = []) => ({
    listPhotos: async (k: { sessionId: string; event: string }) => (k.event === 'FX' ? [photo(`${k.sessionId}-fx`, 15, 30)] : []),
    getPhoto: async (path: string) => {
      if (fail.includes(path)) throw new Error('network');
      return new Blob([`jpeg:${path}`]);
    },
  });

  it('orders sessions as the admin picker does', () => {
    expect(orderedLists([PURPLE, ORANGE, GREEN], ['Orange']).map((l) => l.sessionId)).toEqual(['s1-orange', 's1-green', 's2-purple']);
  });

  it('builds one zip holding every photo and index.csv, reporting progress', async () => {
    const seen: string[] = [];
    const res = await exportMeet('t', [GREEN, ORANGE], deps(), (p) => seen.push(`${p.k}:${p.done}/${p.total}`));
    const files = unzipSync(new Uint8Array(await res.blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(['Session 1 - Green/Floor - Squad A.jpg', 'Session 1 - Orange/Floor - Squad A.jpg', 'index.csv']);
    expect(strFromU8(files['Session 1 - Green/Floor - Squad A.jpg'])).toBe('jpeg:scorecards/t/s1-green-fx/1530.jpg');
    expect(strFromU8(files['index.csv'])).toContain('Pommel Horse,Squad A,1,0,,,No photo');
    expect(res).toMatchObject({ sheets: 3, withPhoto: 2, photos: 2, failed: 0 });
    expect(seen.at(-1)).toBe('downloading:2/2');
    expect(seen).toContain('listing:3/3');
  });

  it('keeps going when a photo fails, and says so', async () => {
    const res = await exportMeet('t', [GREEN, ORANGE], deps(['scorecards/t/s1-orange-fx/1530.jpg']), () => {});
    const files = unzipSync(new Uint8Array(await res.blob.arrayBuffer()));
    expect(Object.keys(files)).not.toContain('Session 1 - Orange/Floor - Squad A.jpg');
    expect(strFromU8(files['index.csv'])).toContain('1 photo could not be downloaded');
    expect(res.failed).toBe(1);
  });

  it('stops when cancelled', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(exportMeet('t', [GREEN], deps(), () => {}, ctl.signal)).rejects.toBeInstanceOf(ExportCancelled);
  });
});
