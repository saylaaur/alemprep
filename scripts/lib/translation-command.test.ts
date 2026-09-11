import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseTranslationCommand, requirePrivateArtifactPath } from './translation-command';

describe('Google translation command safety', () => {
  it('defaults to dry-run and accepts no implicit execute path', () => {
    expect(parseTranslationCommand(['--manifest', '/private/input.json', '--output', '/private/output.json'])).toMatchObject({ execute: false });
  });

  it('requires an explicit output and caps for execute', () => {
    expect(() => parseTranslationCommand(['--manifest', '/private/input.json'])).toThrow('--output');
    expect(() => parseTranslationCommand(['--manifest', '/private/input.json', '--output', '/private/output.json', '--execute'])).toThrow('--max-chars');
    expect(parseTranslationCommand(['--manifest', '/private/input.json', '--output', '/private/output.json', '--execute', '--max-chars', '90', '--max-usd', '0.01'])).toMatchObject({ execute: true, maxChars: 90, maxUsd: 0.01 });
  });

  it('does not allow real translations or checkpoint files inside the repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'alemprep-translation-command-'));
    const repository = join(root, 'repo');
    await mkdir(repository, { recursive: true });
    try {
      await expect(requirePrivateArtifactPath(join(repository, 'scripts', 'translated', 'kk.json'), repository)).rejects.toThrow('outside the repository');
      await expect(requirePrivateArtifactPath(join(root, 'private', 'kk.json'), repository)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an external-looking path whose canonical parent is inside the repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'alemprep-translation-command-'));
    const repository = join(root, 'repo');
    const externalLink = join(root, 'external-link');
    await mkdir(join(repository, 'private-artifacts'), { recursive: true });
    await symlink(join(repository, 'private-artifacts'), externalLink);
    try {
      await expect(requirePrivateArtifactPath(join(externalLink, 'drafts.json'), repository)).rejects.toThrow('outside the repository');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
