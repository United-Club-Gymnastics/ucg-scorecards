// Browser side of taking the photo: cut the frame out of the live camera picture (or take a photo the phone's own camera app
// made), scale it, read the QR code in it, and make the JPEG. The maths is in photo.ts.
import jsQR from 'jsqr';
import { JPEG_QUALITY, cropForFrame, fitLong, isLandscape, qrAttempts, type Rect } from './photo';

export interface Shot {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  /** The text of the QR code found in the photo, or null. */
  qrText: string | null;
}

export class PortraitPhotoError extends Error {
  constructor() {
    super('That photo is upright. Turn your phone sideways and take it again.');
  }
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Reads the QR code from the full-resolution source: the corner first (as captured, then enlarged), then the whole photo. */
function readQr(src: CanvasImageSource, w: number, h: number): string | null {
  for (const { region: r, w: tw, h: th } of qrAttempts(w, h)) {
    const c = canvas(tw, th);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, tw, th);
    const found = jsQR(ctx.getImageData(0, 0, tw, th).data, tw, th, { inversionAttempts: 'dontInvert' });
    if (found?.data) return found.data;
  }
  return null;
}

async function finish(src: CanvasImageSource, crop: Rect): Promise<Shot> {
  // Copy the crop at full resolution first: the QR is read from it, the JPEG is scaled down from it.
  const full = canvas(crop.w, crop.h);
  full.getContext('2d')!.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  const qrText = readQr(full, crop.w, crop.h);
  const size = fitLong(crop.w, crop.h);
  const out = canvas(size.w, size.h);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, size.w, size.h);
  const blob = await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the photo.'))), 'image/jpeg', JPEG_QUALITY));
  return { blob, url: URL.createObjectURL(blob), width: size.w, height: size.h, qrText };
}

/** The frame cut from the live camera picture, as the person sees it on screen. */
export function shotFromVideo(video: HTMLVideoElement, aspect: number): Promise<Shot> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!isLandscape(vw, vh)) return Promise.reject(new PortraitPhotoError());
  const crop = cropForFrame({ w: video.clientWidth, h: video.clientHeight }, { w: vw, h: vh }, aspect);
  return finish(video, crop);
}

/** A photo from the phone's own camera app (the fallback when the live camera is not available). Must be landscape. */
export async function shotFromFile(file: File): Promise<Shot> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (!isLandscape(bmp.width, bmp.height)) throw new PortraitPhotoError();
    return await finish(bmp, { x: 0, y: 0, w: bmp.width, h: bmp.height });
  } finally {
    bmp.close();
  }
}
