// Pure: the admin photo viewer's zoom. The scroll wheel zooms about the pointer (the spot under it stays put); dragging pans.
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;

export const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** The zoom after one wheel event: a notch (deltaY ≈ 100) is about ×1.16; up zooms in. Lines and pages count as pixels × 40. */
export function wheelZoom(zoom: number, deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 800 : deltaY;
  return clampZoom(zoom * Math.exp(-px * 0.0015));
}

/**
 * Where to scroll so the point under the pointer stays under it when the picture grows by `factor`. `scroll` is the box's
 * scroll offset and `pointer` the pointer's position in the box, both on one axis.
 */
export const anchoredScroll = (scroll: number, pointer: number, factor: number): number => Math.max(0, (scroll + pointer) * factor - pointer);
