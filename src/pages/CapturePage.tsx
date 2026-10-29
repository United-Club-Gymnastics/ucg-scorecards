// Scanning a scorecard's QR opens this page on that sheet: it says which sheet it is, opens the camera held sideways, shows the
// photo to keep or retake, and uploads it, retrying on a poor signal until it lands. No login (an anonymous account); the
// Storage rules accept a photo only for a sheet in the session's sheet list.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PortraitPhotoError, shotFromFile, shotFromVideo, type Shot } from '../lib/capture';
import { ensureUploader } from '../lib/firebase';
import { aspectFor, needsSideways } from '../lib/photo';
import { checkQr, type QrCheck } from '../lib/qr-check';
import { isRetryable, retryDelay } from '../lib/retry';
import { findSheet, parseSheetUrl, photoFileId, photoFileName, sessionTitle, sheetFolder, sheetLabel, type SheetEntry, type SheetKey, type SheetList } from '../lib/sheet';
import { loadMeetSettings, loadSheetList, startUpload } from '../lib/store';
import CameraView from './CameraView';
import './capture.css';

type Sheet = { key: SheetKey; list: SheetList; entry: SheetEntry; meetName: string };
type Load = { k: 'loading' } | { k: 'bad'; title: string; text: string } | { k: 'ready'; sheet: Sheet };

type Step =
  | { k: 'start' }
  | { k: 'camera' }
  | { k: 'review'; shot: Shot; check: QrCheck }
  | { k: 'uploading'; shot: Shot; progress: number; attempt: number; since: number; waiting: number | null }
  | { k: 'done'; shot: Shot; at: Date }
  | { k: 'failed'; shot: Shot; text: string; qr: QrCheck['kind'] };

const NOT_FOUND = { title: 'We can’t find this scorecard', text: 'Check you scanned the code printed on a scorecard from this meet. If it still doesn’t work, ask the head scoring table.' };

export default function CapturePage() {
  const { pathname } = useLocation();
  const key = parseSheetUrl(pathname);
  const [result, setResult] = useState<{ for: string; load: Load } | null>(null);
  const load: Load = !key ? { k: 'bad', ...NOT_FOUND } : result?.for === pathname ? result.load : { k: 'loading' };

  useEffect(() => {
    if (!key) return;
    let live = true;
    const done = (l: Load) => live && setResult({ for: pathname, load: l });
    Promise.all([loadSheetList(key.meetId, key.sessionId), loadMeetSettings(key.meetId).then((m) => m.meetName, () => '')])
      .then(([list, meetName]) => {
        const entry = list && findSheet(list, key);
        done(list && entry ? { k: 'ready', sheet: { key, list, entry, meetName } } : { k: 'bad', ...NOT_FOUND });
      })
      .catch(() => done({ k: 'bad', title: 'Couldn’t load this scorecard', text: 'Check your signal and reload the page.' }));
    return () => { live = false; };
    // The path names the sheet; key is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (load.k === 'loading') return <main className="cap"><p role="status" className="cap-muted">Loading the scorecard…</p></main>;
  if (load.k === 'bad') {
    return (
      <main className="cap">
        <section className="cap-card" role="alert">
          <h1 className="display cap-h">{load.title}</h1>
          <p>{load.text}</p>
          <button type="button" className="btn ghost" onClick={() => window.location.reload()}>Reload</button>
        </section>
      </main>
    );
  }
  return <Capture key={pathname} sheet={load.sheet} />;
}

function Capture({ sheet }: { sheet: Sheet }) {
  const { key, list, entry } = sheet;
  const label = sheetLabel(list.discipline, entry);
  const [step, setStep] = useState<Step>({ k: 'start' });
  const [shotError, setShotError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<() => void>(() => undefined);

  useEffect(() => () => cancelRef.current(), []);

  // Leaving while a photo is still on its way loses it: ask first.
  const pending = step.k === 'uploading';
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  const review = (shot: Shot) => setStep({ k: 'review', shot, check: checkQr(shot.qrText, key) });
  const failShot = (e: unknown) => setShotError(e instanceof PortraitPhotoError ? e.message : 'Couldn’t take the photo. Try again.');

  async function shoot(video: HTMLVideoElement) {
    setBusy(true);
    setShotError('');
    try { review(await shotFromVideo(video, aspectFor(key.event))); } catch (e) { failShot(e); setStep({ k: 'start' }); } finally { setBusy(false); }
  }

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setShotError('');
    setBusy(true);
    try { review(await shotFromFile(file, aspectFor(key.event))); } catch (e) { failShot(e); setStep({ k: 'start' }); } finally { setBusy(false); }
  }

  function retake(shot?: Shot) {
    if (shot) URL.revokeObjectURL(shot.url);
    setShotError('');
    setStep({ k: 'camera' });
  }

  const upload = useCallback((shot: Shot, qr: QrCheck['kind']) => {
    let attempt = 0;
    let timer: number | undefined;
    let cancelTask: (() => void) | undefined;
    let stopped = false;
    const onOnline = () => { if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; void go(); } };
    const cleanup = () => { window.removeEventListener('online', onOnline); if (timer !== undefined) window.clearTimeout(timer); };
    cancelRef.current = () => { stopped = true; cleanup(); cancelTask?.(); };
    window.addEventListener('online', onOnline);

    async function go() {
      attempt += 1;
      const since = Date.now();
      setStep({ k: 'uploading', shot, progress: 0, attempt, since, waiting: null });
      try {
        await ensureUploader();
        // A new name each try: if an earlier try did land, this one adds a copy rather than being refused as an overwrite.
        const task = startUpload(`${sheetFolder(key)}/${photoFileId(new Date())}`, shot.blob, { fileName: photoFileName(list, entry), qr });
        cancelTask = () => task.cancel();
        task.on('state_changed', (s) => {
          if (!stopped) setStep({ k: 'uploading', shot, progress: s.totalBytes ? s.bytesTransferred / s.totalBytes : 0, attempt, since, waiting: null });
        });
        await task;
        if (stopped) return;
        cleanup();
        setStep({ k: 'done', shot, at: new Date() });
      } catch (e) {
        if (stopped) return;
        const code = (e as { code?: string }).code;
        if (!isRetryable(code)) {
          cleanup();
          setStep({ k: 'failed', shot, qr, text: code === 'storage/unauthorized' ? 'The photo was refused: this scorecard is not open for photos. Ask the head scoring table.' : 'The photo could not be uploaded.' });
          return;
        }
        const wait = retryDelay(attempt);
        setStep({ k: 'uploading', shot, progress: 0, attempt, since: Date.now(), waiting: Date.now() + wait });
        timer = window.setTimeout(() => { timer = undefined; void go(); }, wait);
      }
    }
    void go();
  }, [key, list, entry]);

  return (
    <main className="cap">
      <header className="cap-sheet">
        {sheet.meetName && <p className="cap-meet">{sheet.meetName}</p>}
        <h1 className="display cap-h">{sessionTitle(list)}</h1>
        <p className="cap-label">{label}</p>
      </header>

      {shotError && <div className="cap-banner err" role="alert">{shotError}</div>}

      {step.k === 'start' && (
        <section className="cap-card">
          {needsSideways(aspectFor(key.event))
            ? <p>Take a photo of this finished scorecard. Hold your phone <b>sideways</b> and fit the whole card inside the frame.</p>
            : <p>Take a photo of this finished score sheet. Hold your phone <b>upright</b> and fit the whole sheet inside the frame.</p>}
          <button type="button" className="btn primary cap-big" onClick={() => setStep({ k: 'camera' })} disabled={busy}>Take photo</button>
        </section>
      )}

      {step.k === 'camera' && (
        <CameraView
          aspect={aspectFor(key.event)}
          label={label}
          busy={busy}
          onShoot={(v) => void shoot(v)}
          onCancel={() => setStep({ k: 'start' })}
          onUseCameraApp={() => fileRef.current?.click()}
        />
      )}

      {step.k === 'review' && (
        <section className="cap-card cap-review">
          <img className="cap-photo" src={step.shot.url} alt={`Photo of ${sessionTitle(list)}, ${label}`} />
          <div>
            <h2 className="cap-h2">Is the whole scorecard sharp and readable?</h2>
            <QrNote check={step.check} list={list} expected={key} />
            <div className="cap-actions">
              <button type="button" className="btn ghost" onClick={() => retake(step.shot)}>Retake</button>
              <button type="button" className="btn primary" onClick={() => upload(step.shot, step.check.kind)}>Use photo</button>
            </div>
          </div>
        </section>
      )}

      {step.k === 'uploading' && <Uploading step={step} />}

      {step.k === 'done' && (
        <section className="cap-card cap-done" role="status">
          <p className="cap-done-title"><span aria-hidden="true">✓ </span>Photo uploaded</p>
          <p>Saved for {sessionTitle(list)} · {label} at {step.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. You can close this page.</p>
          <button type="button" className="btn ghost" onClick={() => retake(step.shot)}>Take it again</button>
        </section>
      )}

      {step.k === 'failed' && (
        <section className="cap-card" role="alert">
          <p className="cap-fail-title">Not uploaded</p>
          <p>{step.text}</p>
          <div className="cap-actions">
            <button type="button" className="btn ghost" onClick={() => retake(step.shot)}>Retake</button>
            <button type="button" className="btn primary" onClick={() => upload(step.shot, step.qr)}>Try again</button>
          </div>
        </section>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="cap-file"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void fromFile(f); }}
      />
    </main>
  );
}

function QrNote({ check, list, expected }: { check: QrCheck; list: SheetList; expected: SheetKey }) {
  if (check.kind === 'match') return <p className="cap-qr ok"><span aria-hidden="true">✓ </span>The code on the card matches this scorecard.</p>;
  if (check.kind === 'unread') return <p className="cap-qr">We couldn’t read the code on the card. Make sure the whole card is in the photo and in focus.</p>;
  const f = check.found;
  const same = f.meetId === expected.meetId && f.sessionId === expected.sessionId;
  const entry = same ? findSheet(list, f) : undefined;
  const what = entry ? sheetLabel(list.discipline, entry) : 'a scorecard from another session';
  return (
    <div className="cap-banner warn" role="alert">
      <b>This looks like a different scorecard</b> ({what}). You scanned {sheetLabel(list.discipline, findSheet(list, expected) ?? { ...expected, pages: 1 })}. Retake, or scan the code on the card you are photographing.
    </div>
  );
}

function Uploading({ step }: { step: Extract<Step, { k: 'uploading' }> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  const pct = Math.round(step.progress * 100);
  // Nothing sent for a while (the SDK is quietly retrying), or an earlier try failed: say so rather than sit at 0%.
  const stuck = step.progress === 0 && (step.attempt > 1 || now - step.since > 8000);
  return (
    <section className="cap-card" aria-live="polite">
      <img className="cap-photo dim" src={step.shot.url} alt="" />
      {step.waiting === null ? (
        <>
          <p className="cap-up-title">{stuck ? 'Weak signal — still trying…' : `Uploading… ${pct}%`}</p>
          <div className="cap-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Upload progress"><span style={{ width: `${pct}%` }} /></div>
          {stuck && <p className="cap-muted">Your photo is kept on this phone until it uploads{step.attempt > 1 ? ` (try ${step.attempt})` : ''}. Keep this page open.</p>}
        </>
      ) : (
        <>
          <p className="cap-up-title">Weak signal — trying again in {Math.max(1, Math.ceil((step.waiting - now) / 1000))} s</p>
          <p className="cap-muted">Your photo is kept on this phone until it uploads. Keep this page open; it will send as soon as the signal is back.</p>
        </>
      )}
    </section>
  );
}
