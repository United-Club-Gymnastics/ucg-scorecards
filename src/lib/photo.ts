// Pure: the geometry of a scorecard photo. The camera view fills the screen (object-fit: cover); a frame the shape of a
// landscape US Letter sheet sits in it, and the photo kept is that frame (plus a small margin) cut from the camera's full
// resolution, scaled so its long side is at most MAX_LONG.

export interface Rect { x: number; y: number; w: number; h: number }

/** A landscape US Letter sheet (11 × 8.5 in): every scorecard. */
export const CARD_ASPECT = 11 / 8.5;
/** A portrait one: the synchro sheet. The phone is still held sideways; the frame is just upright. */
export const PORTRAIT_ASPECT = 8.5 / 11;
export const aspectFor = (event: string): number => (event === 'SY' ? PORTRAIT_ASPECT : CARD_ASPECT);
/** The kept photo's long side (px): small enough to upload on a poor signal, sharp enough to read handwriting. */
export const MAX_LONG = 2400;
export const JPEG_QUALITY = 0.85;
/** The frame's share of the screen, and the margin kept around it in the photo (a fraction of the frame). */
const FRAME_W = 0.84;
const FRAME_H = 0.76;
const CROP_MARGIN = 0.04;

export const isLandscape = (w: number, h: number): boolean => w > h;

/** The on-screen frame: the largest card-shaped box within the share of the screen, centred. */
export function frameRect(viewW: number, viewH: number, aspect = CARD_ASPECT): Rect {
  const w = Math.min(viewW * FRAME_W, viewH * FRAME_H * aspect);
  const h = w / aspect;
  return { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h };
}

/** Where a rect on screen falls in the camera's own pixels, when the video covers the view (object-fit: cover). */
export function viewRectToVideo(r: Rect, view: { w: number; h: number }, video: { w: number; h: number }): Rect {
  const scale = Math.max(view.w / video.w, view.h / video.h);
  const ox = (view.w - video.w * scale) / 2;
  const oy = (view.h - video.h * scale) / 2;
  return { x: (r.x - ox) / scale, y: (r.y - oy) / scale, w: r.w / scale, h: r.h / scale };
}

/** The part of the camera frame to keep: the on-screen frame plus a margin, inside the camera's picture, whole pixels. */
export function cropForFrame(view: { w: number; h: number }, video: { w: number; h: number }, aspect = CARD_ASPECT): Rect {
  const f = viewRectToVideo(frameRect(view.w, view.h, aspect), view, video);
  const mx = f.w * CROP_MARGIN;
  const my = f.h * CROP_MARGIN;
  const x0 = Math.max(0, Math.floor(f.x - mx));
  const y0 = Math.max(0, Math.floor(f.y - my));
  const x1 = Math.min(video.w, Math.ceil(f.x + f.w + mx));
  const y1 = Math.min(video.h, Math.ceil(f.y + f.h + my));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The size to draw a w × h picture at so its long side is at most `max` (never enlarged). */
export function fitLong(w: number, h: number, max = MAX_LONG): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

/** The largest picture handed to the QR reader, long side (an attempt larger than this is scaled to fit). */
export const QR_MAX = 2000;

export interface QrAttempt { region: Rect; w: number; h: number }

/**
 * Where to look for the sheet's QR code and at what size, best first: the top-left corner where every sheet prints it, as
 * captured and then enlarged 2× (a phone's live camera often gives only ~1900 px across, which leaves the printed code at ~2 px
 * per module: too few for the reader until it is enlarged), then the whole photo.
 */
export function qrAttempts(w: number, h: number): QrAttempt[] {
  const corner = { x: 0, y: 0, w: Math.round(w * 0.35), h: Math.round(h * 0.4) };
  const at = (region: Rect, scale: number): QrAttempt => ({ region, ...fitLong(region.w * scale, region.h * scale, QR_MAX) });
  const tries = [at(corner, 1), at(corner, 2), at({ x: 0, y: 0, w, h }, 1)];
  // A corner already at the size limit gains nothing from the 2× try.
  return tries.filter((t, i) => i !== 1 || t.w > tries[0].w);
}
