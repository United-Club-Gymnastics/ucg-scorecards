// Storage security rules, with the Firestore emulator for the cross-service reads (sheet lists, admins). Run with
// `npm run test:rules` (starts both emulators). Invented data only; the "photos" are a few bytes.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, listAll, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ucg-scorecards',
    storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8') },
    firestore: { rules: 'rules_version = "2"; service cloud.firestore { match /databases/{d}/documents { match /{x=**} { allow read, write: if false; } } }' },
  });
});
afterAll(() => env.cleanup());

const M = 'testmeet-ab12';
const S = 's1-purple';
const FILE = '20261024T153012Z-abc123.jpg';
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const JPEG = { contentType: 'image/jpeg' };
const path = (key: string, file = FILE, session = S, meet = M) => `scorecards/${meet}/${session}/${key}/${file}`;

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `meets/${M}/sheetLists/${S}`), { name: 'Session 1', location: 'Purple', discipline: 'TNT', sheets: [], keys: ['TR/A/1', 'TR/A/2', 'SY/Flight%201%2F2/1'] });
    await setDoc(doc(ctx.firestore(), 'admins/helper@gmail.com'), { added: true });
    await uploadBytes(ref(ctx.storage(), path('TR/A/1', '20261024T120000Z-seeded.jpg')), jpeg(), JPEG);
  });
});

const anon = (): FirebaseStorage => env.authenticatedContext('anon-1', { firebase: { sign_in_provider: 'anonymous' } }).storage();
const nobody = (): FirebaseStorage => env.unauthenticatedContext().storage();
const domainAdmin = (): FirebaseStorage => env.authenticatedContext('a', { email: 'Host@UnitedClubGymnastics.org', email_verified: true }).storage();
const listedAdmin = (): FirebaseStorage => env.authenticatedContext('h', { email: 'Helper@Gmail.com', email_verified: true }).storage();
const unverified = (): FirebaseStorage => env.authenticatedContext('u', { email: 'host@unitedclubgymnastics.org', email_verified: false }).storage();
const outsider = (): FirebaseStorage => env.authenticatedContext('o', { email: 'someone@gmail.com', email_verified: true }).storage();
const lookalike = (): FirebaseStorage => env.authenticatedContext('l', { email: 'x@unitedclubgymnastics.org.evil.com', email_verified: true }).storage();

describe('uploading a scorecard photo', () => {
  test('a signed-in phone (anonymous) can add a JPEG for a listed sheet, including an encoded synchro flight', async () => {
    await assertSucceeds(uploadBytes(ref(anon(), path('TR/A/2')), jpeg(), JPEG));
    await assertSucceeds(uploadBytes(ref(anon(), path('SY/Flight%201%2F2/1')), jpeg(), { ...JPEG, customMetadata: { qr: 'match' } }));
  });

  test('nobody signed out can upload', async () => {
    await assertFails(uploadBytes(ref(nobody(), path('TR/A/2')), jpeg(), JPEG));
  });

  test('a sheet, session or meet not in a sheet list is refused', async () => {
    await assertFails(uploadBytes(ref(anon(), path('TR/Z/1')), jpeg(), JPEG));
    await assertFails(uploadBytes(ref(anon(), path('TR/A/3')), jpeg(), JPEG));
    await assertFails(uploadBytes(ref(anon(), path('TR/A/1', FILE, 's9-nowhere')), jpeg(), JPEG));
    await assertFails(uploadBytes(ref(anon(), path('TR/A/1', FILE, S, 'other-meet')), jpeg(), JPEG));
    await assertFails(uploadBytes(ref(anon(), `scorecards/${M}/${S}/TR/A/${FILE}`), jpeg(), JPEG));
    await assertFails(uploadBytes(ref(anon(), `elsewhere/${FILE}`), jpeg(), JPEG));
  });

  test('only a JPEG with a time-stamped name, under 8 MB, with no extra metadata', async () => {
    await assertFails(uploadBytes(ref(anon(), path('TR/A/2')), jpeg(), { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(anon(), path('TR/A/2')), new TextEncoder().encode('<html>'), { contentType: 'text/html' }));
    await assertFails(uploadBytes(ref(anon(), path('TR/A/2', 'photo.jpg')), jpeg(), JPEG));
    await assertFails(uploadBytes(ref(anon(), path('TR/A/2', '20261024T153012Z-abc123.jpg.html')), jpeg(), JPEG));
    await assertFails(uploadBytes(ref(anon(), path('TR/A/2')), new Uint8Array(8 * 1024 * 1024), JPEG));
    await assertFails(uploadBytes(ref(anon(), path('TR/A/2')), jpeg(), { ...JPEG, customMetadata: { qr: 'match', note: 'x' } }));
  });

  test('a photo can never be overwritten, even by an admin', async () => {
    const seeded = path('TR/A/1', '20261024T120000Z-seeded.jpg');
    await assertFails(uploadBytes(ref(anon(), seeded), jpeg(), JPEG));
    await assertFails(uploadBytes(ref(domainAdmin(), seeded), jpeg(), JPEG));
  });

  test('the uploader cannot read, list or delete any photo', async () => {
    const seeded = path('TR/A/1', '20261024T120000Z-seeded.jpg');
    await assertFails(getBytes(ref(anon(), seeded)));
    await assertFails(listAll(ref(anon(), `scorecards/${M}/${S}/TR/A/1`)));
    await assertFails(deleteObject(ref(anon(), seeded)));
    await assertFails(getBytes(ref(nobody(), seeded)));
  });
});

describe('viewing photos', () => {
  const seeded = path('TR/A/1', '20261024T120000Z-seeded.jpg');

  test('admins (domain or listed) read, list and delete', async () => {
    await assertSucceeds(getBytes(ref(domainAdmin(), seeded)));
    await assertSucceeds(listAll(ref(domainAdmin(), `scorecards/${M}/${S}/TR/A/1`)));
    await assertSucceeds(listAll(ref(listedAdmin(), `scorecards/${M}/${S}`)));
    await assertSucceeds(getBytes(ref(listedAdmin(), seeded)));
    await assertSucceeds(deleteObject(ref(listedAdmin(), seeded)));
  });

  test('an unverified, outside or look-alike account cannot', async () => {
    for (const s of [unverified(), outsider(), lookalike()]) {
      await assertFails(getBytes(ref(s, seeded)));
      await assertFails(listAll(ref(s, `scorecards/${M}/${S}/TR/A/1`)));
      await assertFails(deleteObject(ref(s, seeded)));
    }
  });
});
