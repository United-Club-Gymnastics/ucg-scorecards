// "Download all photos for this meet": one zip with a folder per session, every version of every sheet's photo, and an
// index.csv of every printed sheet (with or without a photo). Done in the browser; a big meet can take a few minutes and needs
// as much free memory as the photos take, so it says how far it has got and can be cancelled.
import { useRef, useState } from 'react';
import type { SheetList } from '../lib/sheet';
import { zipName } from '../lib/archive';
import { getPhoto, listPhotos } from '../lib/store';
import type { ExportProgress, ExportResult } from '../lib/export';

type State =
  | { k: 'idle' }
  | { k: 'running'; progress: ExportProgress | null }
  | { k: 'done'; result: Omit<ExportResult, 'blob'> }
  | { k: 'cancelled' }
  | { k: 'error' };

interface Props {
  meetId: string;
  meetName: string;
  lists: SheetList[];
  gymOrder: string[];
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the save before letting go of the zip.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function DownloadAll({ meetId, meetName, lists, gymOrder }: Props) {
  const [state, setState] = useState<State>({ k: 'idle' });
  const abort = useRef<AbortController | null>(null);

  async function run() {
    const ctl = new AbortController();
    abort.current = ctl;
    setState({ k: 'running', progress: null });
    try {
      const { exportMeet, orderedLists, ExportCancelled } = await import('../lib/export');
      try {
        const { blob, ...result } = await exportMeet(meetId, orderedLists(lists, gymOrder), { listPhotos, getPhoto },
          (progress) => setState({ k: 'running', progress }), ctl.signal);
        save(blob, zipName(meetName || meetId));
        setState({ k: 'done', result });
      } catch (e) {
        setState(e instanceof ExportCancelled ? { k: 'cancelled' } : { k: 'error' });
      }
    } catch {
      setState({ k: 'error' });
    } finally {
      abort.current = null;
    }
  }

  const p = state.k === 'running' ? state.progress : null;
  const status = !p ? 'Starting…'
    : p.k === 'listing' ? `Finding photos: ${p.done} of ${plural(p.total, 'sheet')} checked…`
    : `Downloading photo ${p.done} of ${p.total}…`;
  const pct = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <div className="adm-export">
      {state.k !== 'running' ? (
        <button type="button" className="btn ghost small" disabled={lists.length === 0} onClick={() => void run()}>
          Download all photos for this meet (.zip)
        </button>
      ) : (
        <div className="adm-export-run">
          <p role="status">{status}</p>
          <progress max={100} value={p?.k === 'downloading' ? pct : undefined} aria-label="Download progress" />
          <button type="button" className="btn ghost small" onClick={() => abort.current?.abort()}>Cancel</button>
        </div>
      )}
      {state.k === 'done' && (
        <p className={`adm-banner ${state.result.failed > 0 ? 'warn' : 'ok'}`} role="status">
          Saved {plural(state.result.photos - state.result.failed, 'photo')}: {state.result.withPhoto} of {plural(state.result.sheets, 'sheet')} have a photo.
          {state.result.withPhoto < state.result.sheets && ` ${plural(state.result.sheets - state.result.withPhoto, 'sheet has', 'sheets have')} none yet.`}
          {state.result.failed > 0 && ` ${plural(state.result.failed, 'photo')} could not be downloaded (marked in index.csv): try again.`}
          {' '}index.csv in the zip lists every sheet.
        </p>
      )}
      {state.k === 'cancelled' && <p className="adm-banner warn" role="status">Cancelled. Nothing was saved.</p>}
      {state.k === 'error' && <p className="adm-banner err" role="alert">The download did not work. Check the connection and try again.</p>}
    </div>
  );
}
