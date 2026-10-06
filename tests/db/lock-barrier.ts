import type { DbConnection } from './helpers';

const POLL_INTERVAL_MS = 25;
const TIMEOUT_MS = 2_000;

/** Waits until a query is demonstrably blocked on a relation lock. */
export async function waitForWaitingRelationLock(
  observer: DbConnection,
  backendPid: number,
  relationName: string,
): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const waiting = await observer.scalar<boolean>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_locks AS lock
         JOIN pg_class AS relation ON relation.oid = lock.relation
         JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
         WHERE lock.pid = $1
           AND NOT lock.granted
           AND namespace.nspname = 'public'
           AND relation.relname = $2
       )`,
      [backendPid, relationName],
    );
    if (waiting) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`timed out waiting for backend ${backendPid} to block on public.${relationName}`);
}

/** PostgreSQL represents a wait for another transaction's row lock this way. */
export async function waitForWaitingRowLock(observer: DbConnection, backendPid: number): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const waiting = await observer.scalar<boolean>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_locks
         WHERE pid = $1 AND NOT granted AND locktype = 'transactionid'
       )`,
      [backendPid],
    );
    if (waiting) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`timed out waiting for backend ${backendPid} to block on a row lock`);
}
