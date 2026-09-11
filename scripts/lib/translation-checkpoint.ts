import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type TranslationCheckpointKey = {
  sourceId: string;
  sourceHash: string;
  locale: 'kk';
  provider: 'google-nmt';
  glossaryVersion: string;
  validatorVersion: string;
};

export type TranslationCheckpointEntry = TranslationCheckpointKey & {
  state: 'prepared' | 'sent' | 'received' | 'validated' | 'rejected';
  chars: number;
  translations?: string[];
  updatedAt: string;
};

export type TranslationCheckpoint = { version: 1; entries: TranslationCheckpointEntry[] };

const sameRequest = (entry: TranslationCheckpointEntry, key: TranslationCheckpointKey) =>
  entry.sourceId === key.sourceId && entry.sourceHash === key.sourceHash && entry.locale === key.locale &&
  entry.provider === key.provider && entry.glossaryVersion === key.glossaryVersion && entry.validatorVersion === key.validatorVersion;

export async function loadCheckpoint(file: string): Promise<TranslationCheckpoint> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as TranslationCheckpoint;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error('invalid checkpoint schema');
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: [] };
    throw error;
  }
}

export async function saveCheckpoint(file: string, checkpoint: TranslationCheckpoint): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

export function claimCheckpoint(
  checkpoint: TranslationCheckpoint,
  key: TranslationCheckpointKey,
): { action: 'prepare' } | { action: 'cache-hit'; translations: string[] } | { action: 'resume-required' } | { action: 'stale' } {
  const sameSource = checkpoint.entries.filter(entry => entry.sourceId === key.sourceId && entry.locale === key.locale && entry.provider === key.provider);
  const entry = sameSource.find(item => sameRequest(item, key));
  if (!entry) return sameSource.length ? { action: 'stale' } : { action: 'prepare' };
  if (entry.state === 'validated' && entry.translations) return { action: 'cache-hit', translations: entry.translations };
  if (entry.state === 'sent') return { action: 'resume-required' };
  return { action: 'prepare' };
}

function replace(checkpoint: TranslationCheckpoint, key: TranslationCheckpointKey, entry: TranslationCheckpointEntry): void {
  const index = checkpoint.entries.findIndex(item => sameRequest(item, key));
  if (index >= 0) checkpoint.entries[index] = entry;
  else checkpoint.entries.push(entry);
}

export function markCheckpointSent(checkpoint: TranslationCheckpoint, key: TranslationCheckpointKey, chars: number): void {
  replace(checkpoint, key, { ...key, state: 'sent', chars, updatedAt: new Date().toISOString() });
}

export function markCheckpointReceived(checkpoint: TranslationCheckpoint, key: TranslationCheckpointKey, translations: string[]): void {
  const prior = checkpoint.entries.find(entry => sameRequest(entry, key));
  if (!prior || prior.state !== 'sent') throw new Error('cannot receive an unclaimed translation');
  replace(checkpoint, key, { ...prior, state: 'received', translations, updatedAt: new Date().toISOString() });
}

export function markCheckpointValidated(checkpoint: TranslationCheckpoint, key: TranslationCheckpointKey): void {
  const prior = checkpoint.entries.find(entry => sameRequest(entry, key));
  if (prior?.state === 'validated' && prior.translations) return;
  if (!prior || prior.state !== 'received' || !prior.translations) throw new Error('cannot validate a missing translation');
  replace(checkpoint, key, { ...prior, state: 'validated', updatedAt: new Date().toISOString() });
}

export function markCheckpointRejected(checkpoint: TranslationCheckpoint, key: TranslationCheckpointKey): void {
  const prior = checkpoint.entries.find(entry => sameRequest(entry, key));
  if (!prior) throw new Error('cannot reject a missing translation');
  replace(checkpoint, key, { ...prior, state: 'rejected', updatedAt: new Date().toISOString() });
}
