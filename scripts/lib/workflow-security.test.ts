import { describe, expect, it } from 'vitest';
import { inspectWorkflowSecurity, inspectWorkflowSource } from './workflow-security';

describe('workflow security policy', () => {
  it('uses read-only permissions and immutable action revisions without pull_request_target', async () => {
    const report = await inspectWorkflowSecurity();

    expect(report.workflows).toHaveLength(2);
    expect(report.mutableActions).toEqual([]);
    expect(report.pullRequestTargetWorkflows).toEqual([]);
    expect(report.workflowsMissingReadOnlyContents).toEqual([]);
    expect(report.workflowsWithWritePermissions).toEqual([]);
    expect(report.hasPinnedGitleaksWorkflow).toBe(true);
  });

  it('rejects job-level write permissions and a named step with a mutable action tag', () => {
    const report = inspectWorkflowSource('unsafe.yml', `
permissions:
  contents: read
jobs:
  unsafe:
    permissions:
      contents: write
    steps:
      - name: Check out source
        uses: actions/checkout@v4
`);

    expect(report.mutableActions).toEqual([{ workflow: 'unsafe.yml', action: 'actions/checkout@v4' }]);
    expect(report.writePermissionScopes).toEqual([{ workflow: 'unsafe.yml', scope: 'contents' }]);
  });
});
