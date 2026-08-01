import * as path from 'path';

export interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Fraction of the page width each column crop covers; >0.5 gives the overlap. */
export const DEFAULT_COLUMN_FRACTION = 0.52;

/**
 * Splits a book-spread page into a left/right column crop, overlapping in the
 * middle so text isn't cut off at the seam.
 */
export function computeColumnCrops(
  width: number,
  height: number,
  fraction: number = DEFAULT_COLUMN_FRACTION,
): { left: CropRegion; right: CropRegion } {
  if (width <= 0 || height <= 0) {
    throw new Error(`invalid dimensions: ${width}x${height}`);
  }
  if (fraction <= 0.5 || fraction > 1) {
    throw new Error(`fraction must be in (0.5, 1], got ${fraction}`);
  }

  const colWidth = Math.round(width * fraction);
  const rightLeft = width - colWidth;

  return {
    left: { left: 0, top: 0, width: colWidth, height },
    right: { left: rightLeft, top: 0, width: colWidth, height },
  };
}

const HEIC_EXT_RE = /\.(heic|heif)$/i;
const SUPPORTED_EXT_RE = /\.(heic|heif|jpe?g|png|webp)$/i;

export function isHeicFile(filename: string): boolean {
  return HEIC_EXT_RE.test(filename);
}

export function isSupportedPhoto(filename: string): boolean {
  return SUPPORTED_EXT_RE.test(filename);
}

function stripExt(filename: string): string {
  const ext = path.extname(filename);
  return ext ? filename.slice(0, -ext.length) : filename;
}

export function singleOutputName(filename: string): string {
  return `${stripExt(filename)}.jpg`;
}

export function columnOutputNames(filename: string): { left: string; right: string } {
  const stem = stripExt(filename);
  return { left: `${stem}_L.jpg`, right: `${stem}_R.jpg` };
}
