import { describe, expect, it } from 'vitest';
import { coverage, eventsOf, gymsFor, pagesOf, sessionNames, squadsOf } from '../../src/lib/pick';
import type { SheetList } from '../../src/lib/sheet';

const s = (sessionId: string, name: string, location: string, sheets: [string, string, number, number][]): SheetList => ({
  sessionId, name, location, discipline: 'TNT', sheets: sheets.map(([event, squad, page, pages]) => ({ event, squad, page, pages })),
});
const lists = [
  s('s10-green', 'Session 10', 'Green', []),
  s('s2-orange', 'Session 2', 'Orange', [['TR', 'A', 1, 2], ['TR', 'A', 2, 2], ['TR', 'C', 1, 1], ['DM', 'B', 1, 1], ['SY', 'Flight 1', 1, 1]]),
  s('s2-green', 'Session 2', 'Green', []),
  s('s2-dupont', 'Session 2', 'Dupont', []),
];

describe('admin picks', () => {
  it('session names in natural order', () => {
    expect(sessionNames(lists)).toEqual(['Session 2', 'Session 10']);
  });

  it('gyms in the meet\'s order, then A–Z', () => {
    expect(gymsFor(lists, 'Session 2', ['Green', 'Orange']).map((l) => l.location)).toEqual(['Green', 'Orange', 'Dupont']);
    expect(gymsFor(lists, 'Session 2').map((l) => l.location)).toEqual(['Dupont', 'Green', 'Orange']);
  });

  it('events, squads and pages in print order', () => {
    const l = lists[1];
    expect(eventsOf(l)).toEqual(['TR', 'DM', 'SY']);
    expect(squadsOf(l, 'TR')).toEqual(['A', 'C']);
    expect(pagesOf(l, 'TR', 'A').map((e) => e.page)).toEqual([1, 2]);
  });

  it('counts which sheets have a photo', () => {
    const c = coverage(lists[1], new Set(['TR/A/1', 'SY/Flight%201/1']));
    expect(c).toMatchObject({ total: 5, done: 2 });
    expect(c.missing.map((e) => `${e.event}${e.squad}${e.page}`)).toEqual(['TRA2', 'TRC1', 'DMB1']);
  });
});
