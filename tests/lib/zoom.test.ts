import { describe, expect, it } from 'vitest';
import { ZOOM_MAX, anchoredScroll, clampZoom, wheelZoom } from '../../src/lib/zoom';

describe('photo zoom', () => {
  it('wheel up zooms in, down zooms out, within Fit and the maximum', () => {
    expect(wheelZoom(1, -100)).toBeCloseTo(1.162, 3);
    expect(wheelZoom(2, 100)).toBeCloseTo(1.721, 3);
    expect(wheelZoom(1, 500)).toBe(1);
    expect(wheelZoom(4.9, -1000)).toBe(ZOOM_MAX);
    expect(clampZoom(0.3)).toBe(1);
  });

  it('counts line and page wheel steps as pixels', () => {
    expect(wheelZoom(1, -3, 1)).toBeCloseTo(wheelZoom(1, -120), 6);
    expect(wheelZoom(1, -1, 2)).toBeCloseTo(Math.exp(1.2), 6);
  });

  it('keeps the spot under the pointer in place', () => {
    // Pointer 100 px into a box scrolled 300 px: content point 400 doubles to 800, so scroll to 700.
    expect(anchoredScroll(300, 100, 2)).toBe(700);
    expect(anchoredScroll(0, 50, 0.5)).toBe(0);
  });
});
