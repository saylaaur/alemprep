import { realpath } from 'node:fs/promises';
import { basename, dirname, resolve, relative } from 'node:path';

export type TranslationCommand = {
  manifest: string;
  output: string;
  checkpoint: string;
  execute: boolean;
  maxChars?: number;
  maxUsd?: number;
};

function required(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${flag} is required`);
  return value;
}

function positiveNumber(args: readonly string[], flag: string): number | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} must be a positive number`);
  return value;
}

export function parseTranslationCommand(args: readonly string[]): TranslationCommand {
  const execute = args.includes('--execute');
  const command = {
    manifest: required(args, '--manifest'),
    output: required(args, '--output'),
    checkpoint: args.includes('--checkpoint') ? required(args, '--checkpoint') : `${required(args, '--output')}.checkpoint.json`,
    execute,
    maxChars: positiveNumber(args, '--max-chars'),
    maxUsd: positiveNumber(args, '--max-usd'),
  };
  if (execute && command.maxChars === undefined) throw new Error('--execute requires --max-chars');
  if (execute && command.maxUsd === undefined) throw new Error('--execute requires --max-usd');
  return command;
}

function isInside(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !pathFromParent.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`));
}

async function canonicalize(candidate: string): Promise<string> {
  let unresolved = resolve(candidate);
  const missing: string[] = [];
  while (true) {
    try {
      const resolved = await realpath(unresolved);
      return resolve(resolved, ...missing.reverse());
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      const parent = dirname(unresolved);
      if (parent === unresolved) throw error;
      missing.push(basename(unresolved));
      unresolved = parent;
    }
  }
}

export async function requirePrivateArtifactPath(candidate: string, repositoryRoot: string): Promise<void> {
  const lexicalPath = resolve(candidate);
  const lexicalRepository = resolve(repositoryRoot);
  if (isInside(lexicalRepository, lexicalPath)) {
    throw new Error('translation artifacts must be written outside the repository');
  }
  const [path, repository] = await Promise.all([canonicalize(candidate), realpath(repositoryRoot)]);
  if (isInside(repository, path)) throw new Error('translation artifacts must be written outside the repository');
}
