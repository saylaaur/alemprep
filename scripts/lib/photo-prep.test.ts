import { describe, it, expect } from 'vitest';
import {
  computeColumnCrops,
  columnOutputNames,
  singleOutputName,
  isHeicFile,
  isSupportedPhoto,
} from './photo-prep';

describe('computeColumnCrops', () => {
  it('splits an even width into two 52%-wide overlapping columns', () => {
    const { left, right } = computeColumnCrops(1000, 2000);
    expect(left).toEqual({ left: 0, top: 0, width: 520, height: 2000 });
    expect(right).toEqual({ left: 480, top: 0, width: 520, height: 2000 });
  });

  it('rounds a fractional column width for odd widths', () => {
    const { left, right } = computeColumnCrops(3024, 4032);
    // 3024 * 0.52 = 1572.48 → rounds to 1572
    expect(left).toEqual({ left: 0, top: 0, width: 1572, height: 4032 });
    expect(right).toEqual({ left: 1452, top: 0, width: 1572, height: 4032 });
  });

  it('accepts a custom fraction', () => {
    const { left, right } = computeColumnCrops(1000, 2000, 0.6);
    expect(left).toEqual({ left: 0, top: 0, width: 600, height: 2000 });
    expect(right).toEqual({ left: 400, top: 0, width: 600, height: 2000 });
  });

  it('throws for a fraction that would not overlap', () => {
    expect(() => computeColumnCrops(1000, 2000, 0.5)).toThrow();
  });

  it('throws for a fraction over 1', () => {
    expect(() => computeColumnCrops(1000, 2000, 1.1)).toThrow();
  });

  it('throws for non-positive dimensions', () => {
    expect(() => computeColumnCrops(0, 2000)).toThrow();
    expect(() => computeColumnCrops(1000, -1)).toThrow();
  });
});

describe('columnOutputNames', () => {
  it('appends _L/_R before the extension', () => {
    expect(columnOutputNames('IMG_9117.HEIC')).toEqual({
      left: 'IMG_9117_L.jpg',
      right: 'IMG_9117_R.jpg',
    });
  });

  it('normalizes any source extension to .jpg', () => {
    expect(columnOutputNames('scan.png')).toEqual({
      left: 'scan_L.jpg',
      right: 'scan_R.jpg',
    });
  });
});

describe('singleOutputName', () => {
  it('replaces the extension with .jpg', () => {
    expect(singleOutputName('IMG_9117.HEIC')).toBe('IMG_9117.jpg');
  });
});

describe('isHeicFile', () => {
  it('matches .heic and .HEIC', () => {
    expect(isHeicFile('a.heic')).toBe(true);
    expect(isHeicFile('a.HEIC')).toBe(true);
    expect(isHeicFile('a.heif')).toBe(true);
  });

  it('does not match jpg/png', () => {
    expect(isHeicFile('a.jpg')).toBe(false);
    expect(isHeicFile('a.png')).toBe(false);
  });
});

describe('isSupportedPhoto', () => {
  it('accepts heic, jpg, jpeg, png, webp', () => {
    for (const f of ['a.heic', 'a.HEIC', 'a.jpg', 'a.jpeg', 'a.png', 'a.webp']) {
      expect(isSupportedPhoto(f)).toBe(true);
    }
  });

  it('rejects other extensions', () => {
    for (const f of ['a.txt', 'a.pdf', '.DS_Store']) {
      expect(isSupportedPhoto(f)).toBe(false);
    }
  });
});
