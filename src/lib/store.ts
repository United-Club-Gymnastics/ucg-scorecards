// Firestore and Storage access. Reads: a session's sheet list (public get), the meet's public settings, and for admins the
// meets and every session's sheet list. Writes: one photo per upload (create only), and admins delete a photo.
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import { deleteObject, getBlob, getDownloadURL, list, ref, uploadBytesResumable, type UploadTask } from 'firebase/storage';
import { db, storage } from './firebase';
import { parseSheetList, photoTime, sheetFolder, type SheetKey, type SheetList } from './sheet';

export async function loadSheetList(meetId: string, sessionId: string): Promise<SheetList | null> {
  const snap = await getDoc(doc(db, 'meets', meetId, 'sheetLists', sessionId));
  return snap.exists() ? parseSheetList(sessionId, snap.data()) : null;
}

/** The meet's public settings: its name ('' when unknown) and gym order (for the admin's Gym choice). */
export async function loadMeetSettings(meetId: string): Promise<{ meetName: string; gymOrder: string[] }> {
  const snap = await getDoc(doc(db, 'meets', meetId, 'settings', 'meet'));
  const d = snap.exists() ? snap.data() : {};
  const gymOrder = Array.isArray(d.gymOrder) ? d.gymOrder.filter((g: unknown): g is string => typeof g === 'string') : [];
  return { meetName: typeof d.meetName === 'string' ? d.meetName : '', gymOrder };
}

export interface MeetRow { id: string; name: string; createdAt: number }

/** Admins: the meets that are not archived, newest first. */
export async function loadMeets(): Promise<MeetRow[]> {
  const snap = await getDocs(collection(db, 'meets'));
  return snap.docs
    .filter((d) => d.data().archived !== true)
    .map((d) => {
      const x = d.data();
      const at = x.createdAt;
      const createdAt = typeof at === 'number' ? at : at && typeof at.toMillis === 'function' ? at.toMillis() : 0;
      return { id: d.id, name: typeof x.name === 'string' && x.name ? x.name : d.id, createdAt };
    })
    .sort((a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name));
}

/** Admins: every session's sheet list in the meet. */
export async function loadSheetLists(meetId: string): Promise<SheetList[]> {
  const snap = await getDocs(collection(db, 'meets', meetId, 'sheetLists'));
  return snap.docs.map((d) => parseSheetList(d.id, d.data()));
}

/** Admins: whether this signed-in account is listed in admins/{email} (domain accounts need not be). */
export async function isListedAdmin(email: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'admins', email.toLowerCase()))).exists();
  } catch {
    return false;
  }
}

export function startUpload(path: string, blob: Blob, meta: { fileName: string; qr: string }): UploadTask {
  return uploadBytesResumable(ref(storage, path), blob, {
    contentType: 'image/jpeg',
    // A plain link to the photo then downloads it under a readable name (an <img> ignores this).
    contentDisposition: `attachment; filename="${meta.fileName.replace(/"/g, '')}"`,
    customMetadata: { qr: meta.qr },
  });
}

export interface PhotoVersion { path: string; name: string; at: Date | null }

/** Admins: every photo of one sheet, newest first. */
export async function listPhotos(k: SheetKey): Promise<PhotoVersion[]> {
  const res = await list(ref(storage, sheetFolder(k)), { maxResults: 100 });
  return res.items
    .map((it) => ({ path: it.fullPath, name: it.name, at: photoTime(it.name) }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Admins: which sheet folders of a session hold at least one photo (keys `<event>/<squad>/<page>`, encoded). */
export async function sheetsWithPhotos(meetId: string, sessionId: string, keys: string[]): Promise<Set<string>> {
  const base = `scorecards/${encodeURIComponent(meetId)}/${encodeURIComponent(sessionId)}`;
  const found = new Set<string>();
  await Promise.all(keys.map(async (key) => {
    const res = await list(ref(storage, `${base}/${key}`), { maxResults: 1 });
    if (res.items.length > 0) found.add(key);
  }));
  return found;
}

export const photoUrl = (path: string): Promise<string> => getDownloadURL(ref(storage, path));
/** Admins: one photo's bytes (for the download-all zip). */
export const getPhoto = (path: string): Promise<Blob> => getBlob(ref(storage, path));
export const deletePhoto = (path: string): Promise<void> => deleteObject(ref(storage, path));
