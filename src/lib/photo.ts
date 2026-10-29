// Pure: the geometry of a scorecard photo. The whole camera picture is shown, fitted to the screen (object-fit: contain,
// nothing cut off); a frame the shape of a US Letter sheet nearly fills that picture, and the photo kept is that frame (plus a
// small margin) cut from the camera's full resolution, scaled so its long side is at most MAX_LONG. Showing the whole picture
// and filling most of it with the frame means the card uses as many of the camera's pixels as it can, and the person can hold
// the phone close (with `cover` and a smaller frame, a wide phone screen cut the picture and the card got about half of it).

export interface Rect { x: number; y: number; w: number; h: number }

/** A landscape US Letter sheet (11 × 8.5 in): every scorecard. */
export const CARD_ASPECT = 11 / 8.5;
/** A portrait one: the synchro sheet. The phone may be held either way for it (upright suits it best). */
export const PORTRAIT_ASPECT = 8.5 / 11;
export const aspectFor = (event: string): number => (event === 'SY' ? PORTRAIT_ASPECT : CARD_ASPECT);
/** The kept photo's long side (px): small enough to upload on a poor signal, sharp enough to read handwriting. */
export const MAX_LONG = 2400;
export const JPEG_QUALITY = 0.85;
/** The frame's share of the camera picture, and the margin kept around it in the photo (a fraction of the frame). */
const FRAME_W = 0.92;
const FRAME_H = 0.85; // leaves room below the frame for the one-line hint
const CROP_MARGIN = 0.04;

export const isLandscape = (w: number, h: number): boolean => w > h;

/** Whether the phone must be held sideways for this sheet: only for a landscape card; a portrait sheet may be shot either way. */
export const needsSideways = (aspect: number): boolean => aspect > 1;

interface Size { w: number; h: number }

/** Where the camera picture sits on screen when fitted whole into the view (object-fit: contain), centred. */
export function videoInView(view: Size, video: Size): Rect {
  const scale = Math.min(view.w / video.w, view.h / video.h);
  const w = video.w * scale;
  const h = video.h * scale;
  return { x: (view.w - w) / 2, y: (view.h - h) / 2, w, h };
}

/** The largest card-shaped box within the frame's share of `area`, centred in it. */
export function frameIn(area: Rect, aspect = CARD_ASPECT): Rect {
  const w = Math.min(area.w * FRAME_W, area.h * FRAME_H * aspect);
  const h = w / aspect;
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

/** The on-screen frame: within the camera picture as shown. */
export const frameRect = (view: Size, video: Size, aspect = CARD_ASPECT): Rect => frameIn(videoInView(view, video), aspect);

/** Where a rect on screen falls in the camera's own pixels (the picture fitted whole into the view). */
export function viewRectToVideo(r: Rect, view: Size, video: Size): Rect {
  const v = videoInView(view, video);
  const scale = v.w / video.w;
  return { x: (r.x - v.x) / scale, y: (r.y - v.y) / scale, w: r.w / scale, h: r.h / scale };
}

/** The part of the camera frame to keep: the on-screen frame plus a margin, inside the camera's picture, whole pixels. */
export function cropForFrame(view: Size, video: Size, aspect = CARD_ASPECT): Rect {
  const f = viewRectToVideo(frameRect(view, video, aspect), view, video);
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

export interface QrAttempt { region: Rect; w: number; h: number; /** Box-blur radius after scaling (0: none). */ blur: number }

/**
 * Where to look for the sheet's QR code and at what size, best first: the top-left corner where every sheet prints it, as
 * taken, then enlarged 2× (a small code has too few pixels per square for the reader until it is enlarged), then enlarged and
 * lightly blurred (removes fine stripes such as a screen's moiré), then the whole photo. Tuned on real test photos read at the
 * kept photo's size (long side MAX_LONG).
 */
export function qrAttempts(w: number, h: number): QrAttempt[] {
  const corner = { x: 0, y: 0, w: Math.round(w * 0.35), h: Math.round(h * 0.4) };
  const at = (region: Rect, scale: number, blur = 0): QrAttempt => ({ region, ...fitLong(region.w * scale, region.h * scale, QR_MAX), blur });
  const tries = [at(corner, 1), at(corner, 2), at(corner, 2, 2), at({ x: 0, y: 0, w, h }, 1)];
  // A corner already at the size limit gains nothing from the plain 2× try (the blurred one still may).
  return tries.filter((t, i) => i !== 1 || t.w > tries[0].w);
}
