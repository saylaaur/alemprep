/**
 * Step 0 — Photo preprocessing
 * Печатные фото пробников (HEIC, разворот книжки) → JPEG, готовые к транскрипции.
 *
 * Usage:
 *   npm run gen:prepare -- --dir <path> --out <path> [--split-columns]
 *
 * - HEIC/HEIF → JPEG через heic-convert (sharp/libvips на macOS не собран с поддержкой
 *   HEIC-декодирования — только читает метаданные, толкать пиксели не может).
 * - Даунскейл: длинная сторона до ~1600px (меньше — мелкий текст нечитаем, больше — лишние токены).
 * - --split-columns: режет разворот на левую/правую колонку по 52% ширины каждая
 *   (~4% нахлёст в середине, чтобы не срезать текст на границе колонки).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { computeColumnCrops, columnOutputNames, singleOutputName, isHeicFile, isSupportedPhoto } from './lib/photo-prep';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 88;

function expandPath(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function parseArgs(): { dir: string; out: string; splitColumns: boolean } {
  const args = process.argv.slice(2);
  let dir = '';
  let out = '';
  let splitColumns = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--out' && args[i + 1]) out = expandPath(args[++i]);
    if (args[i] === '--split-columns') splitColumns = true;
  }
  if (!dir || !out) {
    console.error('Usage: npm run gen:prepare -- --dir <path> --out <path> [--split-columns]');
    process.exit(1);
  }
  return { dir, out, splitColumns };
}

/** Decode any supported source photo (HEIC or already-JPEG/PNG/WebP) into an oriented JPEG buffer. */
async function decodeToOrientedJpeg(filePath: string): Promise<Buffer> {
  const raw = fs.readFileSync(filePath);
  const input = isHeicFile(filePath)
    ? Buffer.from(await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.95 }))
    : raw;
  return sharp(input).rotate().jpeg({ quality: 100 }).toBuffer();
}

async function writeDownscaled(source: sharp.Sharp, outPath: string): Promise<void> {
  await source
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outPath);
}

interface ProcessResult {
  file: string;
  outputs: number;
  error?: string;
}

async function processFile(
  filePath: string,
  filename: string,
  outDir: string,
  splitColumns: boolean,
): Promise<ProcessResult> {
  try {
    const oriented = await decodeToOrientedJpeg(filePath);

    if (!splitColumns) {
      const outPath = path.join(outDir, singleOutputName(filename));
      await writeDownscaled(sharp(oriented), outPath);
      return { file: filename, outputs: 1 };
    }

    const meta = await sharp(oriented).metadata();
    if (!meta.width || !meta.height) {
      return { file: filename, outputs: 0, error: 'no image dimensions' };
    }
    const { left, right } = computeColumnCrops(meta.width, meta.height);
    const { left: leftName, right: rightName } = columnOutputNames(filename);

    await writeDownscaled(sharp(oriented).extract(left), path.join(outDir, leftName));
    await writeDownscaled(sharp(oriented).extract(right), path.join(outDir, rightName));
    return { file: filename, outputs: 2 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { file: filename, outputs: 0, error: msg };
  }
}

async function main() {
  const { dir, out, splitColumns } = parseArgs();

  if (!fs.existsSync(dir)) {
    console.error(`\n❌  Directory not found: ${dir}\n`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter(isSupportedPhoto).sort();
  if (files.length === 0) {
    console.error(`\n❌  No supported image files found in: ${dir}\n`);
    process.exit(1);
  }

  fs.mkdirSync(out, { recursive: true });

  console.log(`\n📂  ${dir} → ${out}`);
  console.log(`📋  Processing ${files.length} photo(s)  [split-columns: ${splitColumns ? 'on' : 'off'}]\n`);

  let totalOutputs = 0;
  let failed = 0;

  for (const file of files) {
    process.stdout.write(`  ${file}  …  `);
    const result = await processFile(path.join(dir, file), file, out, splitColumns);
    if (result.error) {
      failed++;
      console.log(`❌  ${result.error}`);
    } else {
      totalOutputs += result.outputs;
      console.log(`✓  → ${result.outputs} file(s)`);
    }
  }

  console.log(`\n✅  ${files.length - failed} photo(s) processed → ${totalOutputs} image(s) written`);
  if (failed > 0) console.log(`⚠️  ${failed} photo(s) failed to convert`);
  console.log(`📄  Saved → ${out}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
