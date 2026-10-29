// One sheet's photos: the newest full width, zoom in to read handwriting, download, and the earlier versions (a re-shoot adds
// a version; nothing is overwritten). Admins may delete a version after confirming: it cannot be undone.
import { useEffect, useState } from 'react';
import { photoFileName, sessionTitle, sheetLabel, type SheetEntry, type SheetKey, type SheetList } from '../lib/sheet';
import { deletePhoto, listPhotos, photoUrl, type PhotoVersion } from '../lib/store';

const ZOOMS = [1, 1.5, 2, 3];
const when = (d: Date | null) => (d ? d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'unknown time');

type Load = { k: 'loading' } | { k: 'error' } | { k: 'ready'; versions: PhotoVersion[] };
type Url = { path: string; url: string } | { path: string; error: true };

interface Props {
  sheetKey: SheetKey;
  list: SheetList;
  entry: SheetEntry;
  onChanged: () => void;
}

export default function PhotoViewer({ sheetKey, list, entry, onChanged }: Props) {
  const [loaded, setLoaded] = useState<{ for: number; load: Load } | null>(null);
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<Url | null>(null);
  const [zoom, setZoom] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [deleteState, setDeleteState] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [reload, setReload] = useState(0);
  const title = `${sessionTitle(list)} · ${sheetLabel(list.discipline, entry)}`;

  useEffect(() => {
    let live = true;
    listPhotos(sheetKey).then(
      (versions) => { if (live) { setLoaded({ for: reload, load: { k: 'ready', versions } }); setIndex(0); } },
      () => live && setLoaded({ for: reload, load: { k: 'error' } }),
    );
    return () => { live = false; };
    // sheetKey is a new object each render; the parent keys this component by the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const load: Load = loaded?.for === reload ? loaded.load : { k: 'loading' };
  const versions = load.k === 'ready' ? load.versions : [];
  const current = versions[index];
  const path = current?.path ?? '';
  useEffect(() => {
    if (!path) return;
    let live = true;
    photoUrl(path).then((url) => live && setOpened({ path, url }), () => live && setOpened({ path, error: true }));
    return () => { live = false; };
  }, [path]);
  const shown = opened?.path === path ? opened : null;
  const url = shown && 'url' in shown ? shown.url : '';
  const urlError = !!shown && 'error' in shown;

  async function remove() {
    if (!current) return;
    setDeleteState('deleting');
    try {
      await deletePhoto(current.path);
      setConfirming(false);
      setDeleteState('idle');
      setReload((n) => n + 1);
      onChanged();
    } catch {
      setDeleteState('error');
    }
  }

  return (
    <section className="adm-card" aria-labelledby="adm-photo">
      <h2 id="adm-photo" className="display">{title}</h2>
      {load.k === 'loading' && <p role="status">Loading photos…</p>}
      {load.k === 'error' && <p className="adm-banner err" role="alert">Could not load the photos for this sheet. <button type="button" className="btn ghost small" onClick={() => setReload((n) => n + 1)}>Try again</button></p>}
      {load.k === 'ready' && versions.length === 0 && <p className="adm-banner warn" role="status">No photo yet for this sheet.</p>}

      {current && (
        <>
          <div className="adm-tools">
            <span>Taken {when(current.at)}{index === 0 && versions.length > 1 ? ' (newest)' : ''}</span>
            <div className="adm-zoom" role="group" aria-label="Zoom">
              {ZOOMS.map((z) => (
                <button key={z} type="button" className="btn ghost small" aria-pressed={zoom === z} onClick={() => setZoom(z)}>{z === 1 ? 'Fit' : `${z}×`}</button>
              ))}
            </div>
            {url && <a className="btn primary small" href={url} download={photoFileName(list, entry)}>Download</a>}
          </div>
          <div className="adm-photo-box" tabIndex={0} aria-label="Photo, scroll to pan when zoomed">
            {url ? (
              <img src={url} alt={`Scorecard photo: ${title}`} style={{ width: `${zoom * 100}%` }} onClick={() => setZoom(zoom === 1 ? 2 : 1)} />
            ) : urlError ? (
              <p className="adm-banner err" role="alert">Could not open this photo.</p>
            ) : (
              <p role="status">Opening photo…</p>
            )}
          </div>

          <div className="adm-actions">
            {!confirming ? (
              <button type="button" className="btn danger small" onClick={() => setConfirming(true)}>Delete this photo…</button>
            ) : (
              <div className="adm-banner err adm-confirm" role="alertdialog" aria-label="Confirm delete">
                <p>Delete the photo taken {when(current.at)}? This can’t be undone.</p>
                <button type="button" className="btn danger small" disabled={deleteState === 'deleting'} onClick={() => void remove()}>{deleteState === 'deleting' ? 'Deleting…' : 'Delete'}</button>
                <button type="button" className="btn ghost small" onClick={() => { setConfirming(false); setDeleteState('idle'); }}>Cancel</button>
                {deleteState === 'error' && <p role="alert">Could not delete it. Try again.</p>}
              </div>
            )}
          </div>

          {versions.length > 1 && (
            <>
              <h3>All versions ({versions.length})</h3>
              <ul className="adm-versions">
                {versions.map((v, i) => (
                  <li key={v.path}>
                    <button type="button" className="adm-chip" aria-current={i === index} onClick={() => { setIndex(i); setConfirming(false); }}>
                      {when(v.at)}{i === 0 ? ' · newest' : ''}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
