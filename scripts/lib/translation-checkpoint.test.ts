import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  claimCheckpoint,
  loadCheckpoint,
  markCheckpointReceived,
  markCheckpointSent,
  markCheckpointValidated,
  saveCheckpoint,
} from './translation-checkpoint';

const key = {
  sourceId: 'Q1', sourceHash: 'hash-v1', locale: 'kk' as const,
  provider: 'google-nmt' as const, glossaryVersion: 'v1', validatorVersion: 'v1',
};

describe('translation checkpoint', () => {
  it('makes a sent request resume-required instead of sending a potentially charged request again', async () => {
    const checkpoint = await loadCheckpoint(join(await mkdtemp(join(tmpdir(), 'alemprep-checkpoint-')), 'checkpoint.json'));
    expect(claimCheckpoint(checkpoint, key)).toEqual({ action: 'prepare' });
    markCheckpointSent(checkpoint, key, 123);
    expect(claimCheckpoint(checkpoint, key)).toEqual({ action: 'resume-required' });
  });

  it('uses a validated matching source as a cache hit but marks a changed source stale', async () => {
    const checkpoint = await loadCheckpoint(join(await mkdtemp(join(tmpdir(), 'alemprep-checkpoint-')), 'checkpoint.json'));
    markCheckpointSent(checkpoint, key, 123);
    markCheckpointReceived(checkpoint, key, ['аударма']);
    markCheckpointValidated(checkpoint, key);
    expect(claimCheckpoint(checkpoint, key)).toEqual({ action: 'cache-hit', translations: ['аударма'] });
    expect(() => markCheckpointValidated(checkpoint, key)).not.toThrow();
    expect(claimCheckpoint(checkpoint, { ...key, sourceHash: 'hash-v2' })).toEqual({ action: 'stale' });
  });

  it('writes JSON atomically without source text or credentials in a temporary filename', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alemprep-checkpoint-'));
    const file = join(directory, 'checkpoint.json');
    const checkpoint = await loadCheckpoint(file);
    markCheckpointSent(checkpoint, key, 5);
    await saveCheckpoint(file, checkpoint);
    const stored = await readFile(file, 'utf8');
    expect(JSON.parse(stored).entries[0]).toMatchObject({ state: 'sent', chars: 5 });
  });
});
