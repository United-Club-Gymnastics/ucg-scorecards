import { describe, expect, it } from 'vitest';
import { CARD_ASPECT, PORTRAIT_ASPECT, aspectFor, cropForFrame, fitLong, frameRect, isLandscape, qrRegions, viewRectToVideo } from '../../src/lib/photo';

describe('photo geometry', () => {
  it('only a wider-than-tall picture is landscape', () => {
    expect(isLandscape(1920, 1080)).toBe(true);
    expect(isLandscape(1080, 1920)).toBe(false);
    expect(isLandscape(1000, 1000)).toBe(false);
  });

  it('the frame is card-shaped, centred and inside the screen', () => {
    const f = frameRect(844, 390); // a phone held sideways
    expect(f.w / f.h).toBeCloseTo(CARD_ASPECT);
    expect(f.x).toBeGreaterThan(0);
    expect(f.y).toBeGreaterThan(0);
    expect(f.x * 2 + f.w).toBeCloseTo(844);
    expect(f.y * 2 + f.h).toBeCloseTo(390);
    const p = frameRect(844, 390, PORTRAIT_ASPECT);
    expect(p.w / p.h).toBeCloseTo(PORTRAIT_ASPECT);
    expect(aspectFor('SY')).toBe(PORTRAIT_ASPECT);
    expect(aspectFor('FX')).toBe(CARD_ASPECT);
  });

  it('maps the screen to camera pixels when the video covers the view', () => {
    // A 4:3 camera (4000×3000) covering a 16:9-ish screen 800×450: scale 0.2 by width; 600 px tall, 75 px cut top and bottom.
    const r = viewRectToVideo({ x: 0, y: 0, w: 800, h: 450 }, { w: 800, h: 450 }, { w: 4000, h: 3000 });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(375);
    expect(r.w).toBeCloseTo(4000);
    expect(r.h).toBeCloseTo(2250);
  });

  it('crops the frame plus a margin, kept inside the camera picture', () => {
    const view = { w: 800, h: 450 };
    const video = { w: 4000, h: 3000 };
    const c = cropForFrame(view, video);
    const f = viewRectToVideo(frameRect(800, 450), view, video);
    expect(c.x).toBeLessThan(f.x);
    expect(c.w).toBeGreaterThan(f.w);
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(4000);
    expect(c.y + c.h).toBeLessThanOrEqual(3000);
    expect(Number.isInteger(c.w) && Number.isInteger(c.h)).toBe(true);
  });

  it('scales the long side down to the limit, never up', () => {
    expect(fitLong(4000, 3000)).toEqual({ w: 2400, h: 1800 });
    expect(fitLong(1200, 900)).toEqual({ w: 1200, h: 900 });
    expect(fitLong(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
  });

  it('looks for the QR in the top-left corner first, then everywhere', () => {
    expect(qrRegions(2000, 1500)).toEqual([{ x: 0, y: 0, w: 700, h: 600 }, { x: 0, y: 0, w: 2000, h: 1500 }]);
  });
});
