import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workflowsDirectory = resolve(process.cwd(), '.github/workflows');
const immutableRevision = /^[a-f0-9]{40}$/;

export type WorkflowSecurityReport = {
  workflows: string[];
  mutableActions: Array<{ workflow: string; action: string }>;
  pullRequestTargetWorkflows: string[];
  workflowsMissingReadOnlyContents: string[];
  workflowsWithWritePermissions: string[];
  hasPinnedGitleaksWorkflow: boolean;
};

export type WorkflowSourceSecurityReport = {
  mutableActions: Array<{ workflow: string; action: string }>;
  hasPullRequestTarget: boolean;
  hasTopLevelReadOnlyContents: boolean;
  writePermissionScopes: Array<{ workflow: string; scope: string }>;
  hasPinnedGitleaksAction: boolean;
};

function permissionWriteScopes(workflow: string, source: string): Array<{ workflow: string; scope: string }> {
  const lines = source.split('\n');
  const findings: Array<{ workflow: string; scope: string }> = [];
  for (let index = 0; index < lines.length; index++) {
    const header = lines[index].match(/^(\s*)permissions:\s*(\S.*)?$/);
    if (!header) continue;
    if (header[2] === 'write-all') findings.push({ workflow, scope: 'write-all' });
    const indentation = header[1].length;
    for (let next = index + 1; next < lines.length; next++) {
      const line = lines[next];
      if (!line.trim()) continue;
      const lineIndentation = line.match(/^\s*/)?.[0].length ?? 0;
      if (lineIndentation <= indentation) break;
      const permission = line.match(/^\s*([a-z-]+):\s*(\S+)\s*$/);
      if (permission?.[2] === 'write') findings.push({ workflow, scope: permission[1] });
    }
  }
  return findings;
}

export function inspectWorkflowSource(workflow: string, source: string): WorkflowSourceSecurityReport {
  const mutableActions: Array<{ workflow: string; action: string }> = [];
  for (const match of source.matchAll(/^\s*(?:-\s+)?uses:\s+([^@\s]+)@([^\s#]+)/gm)) {
    const [, name, revision] = match;
    if (!immutableRevision.test(revision)) mutableActions.push({ workflow, action: `${name}@${revision}` });
  }
  return {
    mutableActions,
    hasPullRequestTarget: /^\s*pull_request_target\s*:/m.test(source),
    hasTopLevelReadOnlyContents: /^permissions:\n\s+contents:\s+read\s*$/m.test(source),
    writePermissionScopes: permissionWriteScopes(workflow, source),
    hasPinnedGitleaksAction: /gitleaks\/gitleaks-action@[a-f0-9]{40}(?:\s|#|$)/.test(source),
  };
}

/** Static policy check: CI itself must not regain write permissions or mutable action tags. */
export async function inspectWorkflowSecurity(): Promise<WorkflowSecurityReport> {
  const workflows = (await readdir(workflowsDirectory)).filter(file => /\.ya?ml$/.test(file)).sort();
  const mutableActions: WorkflowSecurityReport['mutableActions'] = [];
  const pullRequestTargetWorkflows: string[] = [];
  const workflowsMissingReadOnlyContents: string[] = [];
  const workflowsWithWritePermissions: string[] = [];
  let hasPinnedGitleaksWorkflow = false;

  for (const workflow of workflows) {
    const source = await readFile(resolve(workflowsDirectory, workflow), 'utf8');
    const report = inspectWorkflowSource(workflow, source);
    mutableActions.push(...report.mutableActions);
    if (report.hasPullRequestTarget) pullRequestTargetWorkflows.push(workflow);
    if (!report.hasTopLevelReadOnlyContents) workflowsMissingReadOnlyContents.push(workflow);
    if (report.writePermissionScopes.length) workflowsWithWritePermissions.push(workflow);
    if (report.hasPinnedGitleaksAction) hasPinnedGitleaksWorkflow = true;
  }

  return { workflows, mutableActions, pullRequestTargetWorkflows, workflowsMissingReadOnlyContents, workflowsWithWritePermissions, hasPinnedGitleaksWorkflow };
}
