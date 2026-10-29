// The live camera, full screen: the camera's whole picture (nothing cut off), with a card-shaped frame nearly filling it that
// the scorecard must fill. A landscape card needs the phone sideways: upright is refused with a "turn your phone" prompt (phones
// cannot be locked to landscape from a web page). The portrait synchro sheet may be shot either way. When the camera cannot be
// opened (no permission, an old browser) the phone's own camera app is offered instead.
import { useEffect, useRef, useState } from 'react';
import { frameRect, needsSideways } from '../lib/photo';
import { useLandscape } from './use-landscape';

interface Props {
  aspect: number;
  /** The sheet, shown along the top so the person knows what to shoot. */
  label: string;
  busy: boolean;
  onShoot: (video: HTMLVideoElement) => void;
  onCancel: () => void;
  onUseCameraApp: () => void;
}

type CamState = { k: 'starting' } | { k: 'live' } | { k: 'error'; message: string };

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The camera is blocked for this page. Allow camera access in your browser settings, or use your camera app instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  return 'The camera could not be opened.';
}

export default function CameraView({ aspect, label, busy, onShoot, onCancel, onUseCameraApp }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Not on plain http, and not in some in-app browsers.
  const canOpen = typeof navigator.mediaDevices?.getUserMedia === 'function';
  const [cam, setCam] = useState<CamState>(() => (canOpen ? { k: 'starting' } : { k: 'error', message: 'This browser cannot open the camera here.' }));
  const [view, setView] = useState({ w: 0, h: 0 });
  const [camSize, setCamSize] = useState({ w: 0, h: 0 });
  // Held the right way: sideways for a landscape card; either way for the portrait synchro sheet.
  const heldRight = useLandscape() || !needsSideways(aspect);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    if (!canOpen) return;
    navigator.mediaDevices
      // The sensor's own 4:3 shape at full size: a scorecard is nearly 4:3, so it can use almost every pixel (a 16:9 stream
      // would waste the sides and is often smaller).
      .getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4032 }, height: { ideal: 3024 }, aspectRatio: { ideal: 4 / 3 } } })
      .then(async (s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = s;
        const size = () => v.videoWidth > 0 && setCamSize({ w: v.videoWidth, h: v.videoHeight });
        v.addEventListener('loadedmetadata', size);
        v.addEventListener('resize', size);
        await v.play().catch(() => undefined);
        size();
        setCam({ k: 'live' });
      })
      .catch((e) => setCam({ k: 'error', message: cameraError(e) }));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [canOpen]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const f = frameRect(view, camSize.w > 0 ? camSize : view, aspect);
  const ready = cam.k === 'live' && heldRight && !busy;

  return (
    <div className="cam" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="cam-view" ref={boxRef}>
        <video ref={videoRef} className="cam-video" playsInline muted autoPlay aria-hidden="true" />
        {cam.k === 'live' && heldRight && view.w > 0 && camSize.w > 0 && (
          <div className="cam-frame" style={{ left: f.x, top: f.y, width: f.w, height: f.h }} aria-hidden="true">
            <span className="cam-corner tl" /><span className="cam-corner tr" /><span className="cam-corner bl" /><span className="cam-corner br" />
          </div>
        )}
        {heldRight && cam.k === 'live' && <p className="cam-hint">{label} · fill the frame with the whole {needsSideways(aspect) ? 'card' : 'sheet'}</p>}
      </div>

      {!heldRight && cam.k !== 'error' && (
        <div className="cam-turn" role="alert">
          <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
            <rect x="20" y="8" width="24" height="40" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M12 44 a22 22 0 0 0 22 14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M28 54 l6 4 -4 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="cam-turn-title">Turn your phone sideways</p>
          <p>Scorecard photos are taken in landscape.</p>
          <button type="button" className="btn ghost cam-light" onClick={onCancel}>Cancel</button>
        </div>
      )}

      {cam.k === 'starting' && heldRight && <p className="cam-status" role="status">Opening the camera…</p>}
      {cam.k === 'error' && (
        <div className="cam-turn" role="alert">
          <p className="cam-turn-title">Camera not available</p>
          <p>{cam.message}</p>
          <div className="cam-actions-row">
            <button type="button" className="btn primary" onClick={onUseCameraApp}>Use the camera app</button>
            <button type="button" className="btn ghost cam-light" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}

      {heldRight && cam.k !== 'error' && (
        <div className="cam-bar">
          <button type="button" className="btn ghost cam-light" onClick={onCancel}>Cancel</button>
          <button type="button" className="cam-shutter" disabled={!ready} onClick={() => videoRef.current && onShoot(videoRef.current)} aria-label="Take photo">
            <span aria-hidden="true" />
          </button>
          <button type="button" className="cam-link" onClick={onUseCameraApp}>Camera app</button>
        </div>
      )}
    </div>
  );
}
