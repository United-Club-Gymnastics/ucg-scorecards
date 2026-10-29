import { describe, expect, it } from 'vitest';
import { CARD_ASPECT, PORTRAIT_ASPECT, aspectFor, cropForFrame, fitLong, frameRect, isLandscape, needsSideways, qrAttempts, videoInView, viewRectToVideo } from '../../src/lib/photo';

describe('photo geometry', () => {
  it('only a wider-than-tall picture is landscape', () => {
    expect(isLandscape(1920, 1080)).toBe(true);
    expect(isLandscape(1080, 1920)).toBe(false);
    expect(isLandscape(1000, 1000)).toBe(false);
  });

  it('shows the whole camera picture and puts a card-shaped frame nearly filling it', () => {
    // A 4:3 camera (4032×3024) on a phone held sideways (844×390 view): fitted by height, 520 px wide, centred.
    const view = { w: 844, h: 390 };
    const cam = { w: 4032, h: 3024 };
    const v = videoInView(view, cam);
    for (const [k, n] of Object.entries({ x: 162, y: 0, w: 520, h: 390 })) expect(v[k as keyof typeof v]).toBeCloseTo(n);
    const f = frameRect(view, cam);
    expect(f.w / f.h).toBeCloseTo(CARD_ASPECT);
    expect(f.x).toBeGreaterThan(162);
    expect(f.x + f.w).toBeLessThan(162 + 520);
    expect(f.x * 2 + f.w).toBeCloseTo(844);
    // A card is a little narrower than 4:3, so its height is what limits it: 85% of the picture.
    expect(f.h / 390).toBeCloseTo(0.85);
    const p = frameRect(view, cam, PORTRAIT_ASPECT);
    expect(p.w / p.h).toBeCloseTo(PORTRAIT_ASPECT);
    expect(p.h / 390).toBeCloseTo(0.85);
    expect(aspectFor('SY')).toBe(PORTRAIT_ASPECT);
    expect(aspectFor('FX')).toBe(CARD_ASPECT);
  });

  it('only a landscape card needs the phone sideways; the synchro sheet may be shot upright', () => {
    expect(needsSideways(CARD_ASPECT)).toBe(true);
    expect(needsSideways(aspectFor('SY'))).toBe(false);
  });

  it('frames the synchro sheet when the phone is held upright (a 3:4 camera picture)', () => {
    const view = { w: 390, h: 740 };
    const cam = { w: 3024, h: 4032 };
    const f = frameRect(view, cam, PORTRAIT_ASPECT);
    expect(f.w / f.h).toBeCloseTo(PORTRAIT_ASPECT);
    const c = cropForFrame(view, cam, PORTRAIT_ASPECT);
    // Upright, the sheet gets most of the picture: far more than inside a sideways view.
    expect(c.h).toBeGreaterThan(3400);
    expect(cropForFrame({ w: 844, h: 390 }, { w: 4032, h: 3024 }, PORTRAIT_ASPECT).h).toBeLessThan(c.h);
  });

  it('maps the screen to camera pixels', () => {
    // A 16:9 camera (1920×1080) in an 844×390 view: fitted by height (scale 390/1080), 693 px wide, 75.5 px either side.
    const view = { w: 844, h: 390 };
    const cam = { w: 1920, h: 1080 };
    const v = videoInView(view, cam);
    const r = viewRectToVideo(v, view, cam);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(0);
    expect(r.w).toBeCloseTo(1920);
    expect(r.h).toBeCloseTo(1080);
  });

  it('the card gets most of the camera picture', () => {
    const c = cropForFrame({ w: 844, h: 390 }, { w: 4032, h: 3024 });
    // Frame 85% of the height plus the margin each side: ~3024 × 0.85 × 1.08 tall, ~3600 wide.
    expect(c.h).toBeGreaterThan(2750);
    expect(c.w).toBeGreaterThan(3500);
    const f = cropForFrame({ w: 844, h: 390 }, { w: 1920, h: 1080 });
    expect(f.h / 1080).toBeGreaterThan(0.9); // 85% plus the margin
  });

  it('crops the frame plus a margin, kept inside the camera picture', () => {
    const view = { w: 800, h: 450 };
    const video = { w: 4000, h: 3000 };
    const c = cropForFrame(view, video);
    const f = viewRectToVideo(frameRect(view, video), view, video);
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

  it('looks for the QR in the top-left corner, then the corner enlarged 2×, then everywhere', () => {
    const corner = { x: 0, y: 0, w: 532, h: 474 };
    expect(qrAttempts(1520, 1185)).toEqual([
      { region: corner, w: 532, h: 474 },
      { region: corner, w: 1064, h: 948 },
      { region: { x: 0, y: 0, w: 1520, h: 1185 }, w: 1520, h: 1185 },
    ]);
  });

  it('caps each try at the reader size limit, and skips the 2× try when it would not be bigger', () => {
    const big = qrAttempts(4000, 3000);
    expect(big.map((t) => [t.w, t.h])).toEqual([[1400, 1200], [2000, 1714], [2000, 1500]]);
    expect(qrAttempts(12000, 9000).map((t) => [t.w, t.h])).toEqual([[2000, 1714], [2000, 1500]]);
  });
});
