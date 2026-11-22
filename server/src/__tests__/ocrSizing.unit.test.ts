import { ocrTargetWidth } from '../services/ocrService';

const MAX = 2_000_000;
const pixels = (w: number, h: number) => {
  const tw = ocrTargetWidth(w, h, MAX);
  return { tw, area: tw * (h * tw / w) };
};

describe('OCR image sizing', () => {
  test('a landscape camera photo keeps the old 1600 px width', () => {
    expect(ocrTargetWidth(4000, 3000, MAX)).toBe(1600);
    expect(ocrTargetWidth(1920, 1080, MAX)).toBe(1600);
  });

  test('small images are still enlarged to 1600 px wide when that stays within the pixel budget', () => {
    expect(ocrTargetWidth(480, 300, MAX)).toBe(1600);
  });

  test.each([[1080, 2400], [3000, 4000], [300, 900], [1200, 5000]])(
    'tall or portrait %ix%i is scaled down so OCR work stays within the budget', (w, h) => {
      const { tw, area } = pixels(w, h);
      expect(area).toBeLessThanOrEqual(MAX * 1.01);
      expect(tw).toBeLessThan(1600);
      expect(tw).toBeGreaterThan(0);
    });

  test('a portrait image costs about the same as a landscape camera shot, not three times as much', () => {
    const landscape = pixels(4000, 3000).area;
    expect(pixels(1080, 2400).area).toBeLessThanOrEqual(landscape * 1.1);
    expect(pixels(3000, 4000).area).toBeLessThanOrEqual(landscape * 1.1);
  });

  test('missing dimensions fall back to the default width instead of throwing', () => {
    expect(ocrTargetWidth(0, 0, MAX)).toBe(1600);
  });
});
