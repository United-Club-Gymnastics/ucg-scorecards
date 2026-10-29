import { describe, expect, it } from 'vitest';
import { boxBlur } from '../../src/lib/blur';

const px = (vals: number[]) => new Uint8ClampedArray(vals.flatMap((v) => [v, v, v, 255]));
const grey = (d: Uint8ClampedArray) => Array.from({ length: d.length / 4 }, (_, i) => d[i * 4]);

describe('box blur', () => {
  it('averages each pixel with its neighbours across, then down, leaving alpha alone', () => {
    const d = px([0, 0, 255, 0, 0]);
    boxBlur(d, 5, 1, 1);
    expect(grey(d)).toEqual([0, 85, 85, 85, 0]);
    expect(d[3]).toBe(255);
    const col = px([0, 0, 255, 0, 0]);
    boxBlur(col, 1, 5, 1);
    expect(grey(col)).toEqual([0, 85, 85, 85, 0]);
  });

  it('keeps edges to the pixels that exist, and leaves a flat picture flat', () => {
    const d = px([90, 30]);
    boxBlur(d, 2, 1, 2);
    expect(grey(d)).toEqual([60, 60]);
    const flat = px(Array(12).fill(140));
    boxBlur(flat, 4, 3, 2);
    expect(grey(flat)).toEqual(Array(12).fill(140));
  });

  it('does nothing with a radius below 1', () => {
    const d = px([0, 255]);
    boxBlur(d, 2, 1, 0);
    expect(grey(d)).toEqual([0, 255]);
  });
});
