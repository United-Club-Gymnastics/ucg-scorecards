// Pure: a box blur of RGBA pixels (canvas ImageData), each direction in turn. Used once on the enlarged QR corner: a photo of
// a printed or on-screen code can carry fine stripes (moiré from a screen, paper texture) that stop the reader, and a light
// blur removes them without losing the code's squares.

/** Blurs `data` (w × h RGBA) in place with a (2r + 1)-pixel box; alpha is left alone. */
export function boxBlur(data: Uint8ClampedArray, w: number, h: number, r: number): void {
  if (r < 1 || w < 1 || h < 1) return;
  const line = new Float32Array(Math.max(w, h) * 3);
  const pass = (count: number, len: number, at: (i: number, j: number) => number) => {
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < len; j++) {
        const p = at(i, j);
        line[j * 3] = data[p]; line[j * 3 + 1] = data[p + 1]; line[j * 3 + 2] = data[p + 2];
      }
      for (let j = 0; j < len; j++) {
        let a = 0, b = 0, c = 0, n = 0;
        for (let k = Math.max(0, j - r); k <= Math.min(len - 1, j + r); k++) { a += line[k * 3]; b += line[k * 3 + 1]; c += line[k * 3 + 2]; n++; }
        const p = at(i, j);
        data[p] = a / n; data[p + 1] = b / n; data[p + 2] = c / n;
      }
    }
  };
  pass(h, w, (y, x) => (y * w + x) * 4);
  pass(w, h, (x, y) => (y * w + x) * 4);
}
