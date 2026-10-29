import { describe, expect, it } from 'vitest';
import { eventName, findSheet, parseSheetList, parseSheetUrl, photoFileId, photoFileName, photoTime, sameSheet, sessionTitle, sheetFolder, sheetKeyOf, sheetLabel, sheetPath } from '../../src/lib/sheet';

// Invented data only.
const k = { meetId: 'testmeet-ab12', sessionId: 's1-green', event: 'FX', squad: 'A', page: 1 };

describe('sheet links (same format as ucg-lineups sheet-qr.ts)', () => {
  it('reads the printed link, the bare path and the router path', () => {
    expect(parseSheetUrl(`https://scorecards.unitedclubgymnastics.org/#/s/${sheetPath(k)}`)).toEqual(k);
    expect(parseSheetUrl(sheetPath(k))).toEqual(k);
    expect(parseSheetUrl(`/s/${sheetPath(k)}`)).toEqual(k);
  });

  it('decodes each part, so a synchro flight name with spaces or a slash survives', () => {
    const sy = { meetId: 'm', sessionId: 'tnt-s1--purple', event: 'SY', squad: 'Flight 1/2', page: 2 };
    expect(sheetPath(sy)).toBe('m/tnt-s1--purple/SY/Flight%201%2F2/2');
    expect(parseSheetUrl(`/s/${sheetPath(sy)}`)).toEqual(sy);
  });

  it('rejects anything else', () => {
    for (const t of ['', '/', '/s/a/b/c/d', '/s/a/b/c/d/0', 'https://example.com', '/s/a/b/c/%E0%A4%A/1']) expect(parseSheetUrl(t)).toBeNull();
  });

  it('keys and folders are encoded as in the link', () => {
    expect(sheetKeyOf({ event: 'SY', squad: 'Novice Pairs', page: 1 })).toBe('SY/Novice%20Pairs/1');
    expect(sheetFolder(k)).toBe('scorecards/testmeet-ab12/s1-green/FX/A/1');
    expect(sameSheet(k, { ...k })).toBe(true);
    expect(sameSheet(k, { ...k, page: 2 })).toBe(false);
  });
});

describe('sheet lists', () => {
  it('reads a stored list and drops malformed entries', () => {
    const l = parseSheetList('s1-green', {
      name: 'Session 1', location: 'Green', discipline: 'WAG',
      sheets: [{ event: 'VT', squad: 'A', page: 1, pages: 1 }, { event: '', squad: 'B', page: 1 }, { event: 'UB', squad: 'A', page: 0 }, null, { event: 'BB', squad: 'C', page: 2 }],
    });
    expect(l).toEqual({ sessionId: 's1-green', name: 'Session 1', location: 'Green', discipline: 'WAG', sheets: [{ event: 'VT', squad: 'A', page: 1, pages: 1 }, { event: 'BB', squad: 'C', page: 2, pages: 2 }] });
    expect(findSheet(l, { event: 'BB', squad: 'C', page: 2 })).toBeDefined();
    expect(findSheet(l, { event: 'BB', squad: 'C', page: 1 })).toBeUndefined();
    expect(parseSheetList('x', undefined)).toMatchObject({ name: '', discipline: 'MAG', sheets: [] });
  });
});

describe('labels', () => {
  it('names apparatus by discipline', () => {
    expect(eventName('MAG', 'PH')).toBe('Pommel Horse');
    expect(eventName('WAG', 'FX')).toBe('Floor');
    expect(eventName('TNT', 'SY')).toBe('Synchro Trampoline');
    expect(eventName('MAG', 'ZZ')).toBe('ZZ');
  });

  it('says which sheet it is', () => {
    expect(sessionTitle({ name: 'Session 1', location: 'Green' })).toBe('Session 1 – Green');
    expect(sessionTitle({ name: 'MAG Finals', location: '' })).toBe('MAG Finals');
    expect(sheetLabel('MAG', { event: 'FX', squad: 'A', page: 1, pages: 1 })).toBe('Floor · Squad A');
    expect(sheetLabel('TNT', { event: 'TR', squad: 'C', page: 2, pages: 3 })).toBe('Trampoline · Squad C · page 2 of 3');
    expect(sheetLabel('TNT', { event: 'SY', squad: 'Novice Pairs', page: 1, pages: 1 })).toBe('Synchro Trampoline · Novice Pairs');
  });

  it('makes a safe download name', () => {
    expect(photoFileName({ name: 'Session 1', location: 'Green', discipline: 'MAG' }, { event: 'FX', squad: 'A', page: 1, pages: 1 })).toBe('Session 1 - Green - Floor - Squad A.jpg');
    expect(photoFileName({ name: 'T&T Session 1', location: 'Purple', discipline: 'TNT' }, { event: 'SY', squad: 'Flight 1/2', page: 2, pages: 2 })).toBe('T&T Session 1 - Purple - Synchro Trampoline - Flight 1 2 - Page 2.jpg');
  });
});

describe('photo file ids', () => {
  it('sort by time and read back', () => {
    const at = new Date(Date.UTC(2026, 9, 24, 15, 30, 12, 345));
    const id = photoFileId(at, () => 0);
    expect(id).toBe('20261024T153012Z-aaaaaa.jpg');
    expect(photoTime(id)).toEqual(new Date(Date.UTC(2026, 9, 24, 15, 30, 12)));
    expect(photoFileId(new Date(at.getTime() + 1000), () => 0) > id).toBe(true);
    expect(photoTime('photo.jpg')).toBeNull();
    expect(photoFileId(at)).toMatch(/^20261024T153012Z-[a-z0-9]{6}\.jpg$/);
  });
});
