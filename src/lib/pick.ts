// Pure: the admin's Session → Gym → Apparatus → Squad → Page choices, from the meet's sheet lists.
import { sheetKeyOf, type SheetEntry, type SheetList } from './sheet';

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Session names in natural order (Session 2 before Session 10). */
export const sessionNames = (lists: SheetList[]): string[] => [...new Set(lists.map((l) => l.name))].sort(natural);

/** The gyms (locations) holding a session of that name: the meet's gym order first, then A–Z. */
export function gymsFor(lists: SheetList[], name: string, gymOrder: string[] = []): SheetList[] {
  const rank = (loc: string) => {
    const i = gymOrder.findIndex((g) => g.toLowerCase() === loc.toLowerCase());
    return i < 0 ? gymOrder.length : i;
  };
  return lists.filter((l) => l.name === name).sort((a, b) => rank(a.location) - rank(b.location) || natural(a.location, b.location));
}

/** Events in the order the session prints them. */
export const eventsOf = (list: SheetList): string[] => [...new Set(list.sheets.map((e) => e.event))];

/** Squads (or synchro flights) of one event, in print order. */
export const squadsOf = (list: SheetList, event: string): string[] => [...new Set(list.sheets.filter((e) => e.event === event).map((e) => e.squad))];

export const pagesOf = (list: SheetList, event: string, squad: string): SheetEntry[] => list.sheets.filter((e) => e.event === event && e.squad === squad);

export interface Coverage {
  total: number;
  done: number;
  /** Sheets with at least one photo, in print order. */
  have: SheetEntry[];
  /** Sheets with no photo yet, in print order. */
  missing: SheetEntry[];
}

/** How many of a session's sheets have a photo; `withPhotos` holds `<event>/<squad>/<page>` keys. */
export function coverage(list: SheetList, withPhotos: Set<string>): Coverage {
  const have = list.sheets.filter((e) => withPhotos.has(sheetKeyOf(e)));
  const missing = list.sheets.filter((e) => !withPhotos.has(sheetKeyOf(e)));
  return { total: list.sheets.length, done: have.length, have, missing };
}
