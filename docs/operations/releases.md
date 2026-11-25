# Releases and recovery

`main` is the production source branch. Release changes through a pull request and verify the deployment tied to the merged commit.

1. Run the [local checks](../development/setup.md#checks) and wait for the Verify and Security workflows. Use a test account for preview checks and synthetic data for automated tests.
2. Check that environment variables are set on the intended target. Keep privileged keys on the server. Set the site origin and allow the precise OAuth callback for each approved deployment.
3. For database changes, append a migration and check it on local synthetic data. Reconcile the hosted schema and migration records before applying changes to an existing database. Use the [read-only release query](../../supabase/pilot/check-release.sql) for schema and privilege evidence.
4. Check the production commit and repeat the critical learner and teacher flows after deployment. Confirm saved answers survive reload and teacher reports stay class-scoped.
5. If the release needs an app rollback, choose a verified deployment that is compatible with the current database. For a database recovery, check backups and practise a restore in an isolated environment before restoring any production data.

Earlier hosted schema changes were applied through the SQL Editor. Check the actual hosted objects alongside the migration ledger before using a linked CLI push. Record a Management API migration's hosted version alongside the equivalent repository filenames so an operator can reconcile them without replaying SQL.

Keep database dumps, credential values, and school records in private storage. Retain the release commit, check results, deployment identity, and restore evidence in the operator record.
