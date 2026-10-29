// Dev only: fill the LOCAL emulators (npm run emulators) with an invented meet and sheet lists, so the app can be tried with
// `npm run dev:emu`. Never points at the real project: it refuses unless the emulator hosts below answer.
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from 'firebase/firestore';

const app = initializeApp({ projectId: 'ucg-lineups', apiKey: 'demo' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8282);

const M = 'demo-nationals';
const art = (events, squads) => events.flatMap((event) => squads.map((squad) => ({ event, squad, page: 1, pages: 1 })));
const keyOf = (e) => [e.event, e.squad, String(e.page)].map(encodeURIComponent).join('/');
const list = (name, location, discipline, sheets) => ({ name, location, discipline, sheets, keys: sheets.map(keyOf) });

const lists = {
  's1-green': list('Session 1', 'Green', 'MAG', art(['FX', 'PH', 'SR', 'VT', 'PB', 'HB'], ['A', 'B', 'C'])),
  's1-orange': list('Session 1', 'Orange', 'WAG', art(['VT', 'UB', 'BB', 'FX'], ['A', 'B', 'C', 'D'])),
  's2-green': list('Session 2', 'Green', 'WAG', art(['VT', 'UB', 'BB', 'FX'], ['A', 'B'])),
  's1-purple': list('Session 1', 'Purple', 'TNT', [
    { event: 'TR', squad: 'A', page: 1, pages: 2 }, { event: 'TR', squad: 'A', page: 2, pages: 2 }, { event: 'TR', squad: 'C', page: 1, pages: 1 },
    { event: 'DM', squad: 'B', page: 1, pages: 1 }, { event: 'TU', squad: 'A', page: 1, pages: 1 },
    { event: 'SY', squad: 'Novice Pairs', page: 1, pages: 1 },
  ]),
};

await setDoc(doc(db, `meets/${M}`), { name: 'Demo Nationals (invented)', createdAt: Date.now() });
await setDoc(doc(db, `meets/${M}/settings/meet`), { meetName: 'Demo Nationals (invented)', gymOrder: ['Green', 'Orange', 'Purple'] });
for (const [id, l] of Object.entries(lists)) await setDoc(doc(db, `meets/${M}/sheetLists/${id}`), l);
console.log(`Seeded meets/${M} with ${Object.keys(lists).length} sheet lists. Try http://localhost:5180/#/s/${M}/s1-green/FX/A/1`);
process.exit(0);
