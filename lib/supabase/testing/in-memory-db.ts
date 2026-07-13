/**
 * Общий in-memory «Supabase»-мок для тестов server actions: поддерживает
 * ровно те цепочки (select/insert/update/delete + eq/in/is + maybeSingle/then),
 * которые реально используются в lib/supabase/*.ts. Не эмулирует Supabase
 * целиком — только то, что нужно тестам.
 */

export type Row = Record<string, unknown>;
export type Store = Record<string, Row[]>;
export type FailPoint = { table: string; op: 'delete' | 'insert' | 'update' | 'select'; message: string };

/** Общее состояние между моком './server' и телом теста (обычно живёт в vi.hoisted). */
export type InMemoryState = { store: Store; failOnce: FailPoint | null };

function builder(state: InMemoryState, table: string) {
  let op: 'delete' | 'select' | 'insert' | 'update' = 'select';
  let payload: Row | Row[] | null = null;
  const eqs: Array<[string, unknown]> = [];
  const ins: Array<[string, unknown[]]> = [];
  const iss: Array<[string, unknown]> = [];
  const rows = (): Row[] => (state.store[table] ??= []);

  const match = (r: Row) =>
    eqs.every(([c, v]) => r[c] === v) &&
    ins.every(([c, vs]) => vs.includes(r[c])) &&
    iss.every(([c, v]) => (v === null ? r[c] == null : r[c] === v));

  const run = (): { data: Row[]; error: { message: string } | null } => {
    if (state.failOnce?.table === table && state.failOnce.op === op) {
      const message = state.failOnce.message;
      state.failOnce = null;
      return { data: [], error: { message } };
    }
    const table_ = rows();
    if (op === 'insert') {
      const arr = Array.isArray(payload) ? payload : payload ? [payload] : [];
      // Симуляция схемы: attempts.given_answer — JSONB NOT NULL.
      if (table === 'attempts' && arr.some((row) => row.given_answer == null)) {
        return {
          data: [],
          error: { message: 'null value in column "given_answer" of relation "attempts" violates not-null constraint' },
        };
      }
      const inserted = arr.map((row, i) => ({ id: row.id ?? `${table}-${table_.length + i + 1}`, ...row }));
      for (const row of inserted) table_.push({ ...row });
      return { data: inserted.map((row) => ({ ...row })), error: null };
    }
    if (op === 'update') {
      const updated: Row[] = [];
      for (const r of table_) if (match(r)) { Object.assign(r, payload); updated.push(r); }
      return { data: updated.map((row) => ({ ...row })), error: null };
    }
    if (op === 'delete') {
      const deleted = table_.filter(match);
      state.store[table] = table_.filter((row) => !match(row));
      return { data: deleted.map((row) => ({ ...row })), error: null };
    }
    return { data: table_.filter(match).map((row) => ({ ...row })), error: null };
  };

  const api = {
    select: () => api,
    insert: (p: Row | Row[]) => ((op = 'insert'), (payload = p), api),
    update: (p: Row) => ((op = 'update'), (payload = p), api),
    delete: () => ((op = 'delete'), api),
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    in: (c: string, v: unknown[]) => (ins.push([c, v]), api),
    is: (c: string, v: unknown) => (iss.push([c, v]), api),
    maybeSingle: () => {
      const { data, error } = run();
      return Promise.resolve({ data: data[0] ?? null, error });
    },
    single: () => api.maybeSingle(),
    then: <T>(
      onF: (v: { data: Row[]; error: { message: string } | null }) => T,
      onR?: (e: unknown) => T
    ) => Promise.resolve(run()).then(onF, onR),
  };
  return api;
}

/** Клиент вида Supabase server client: auth.getUser() + from(table). */
export function makeClient(state: InMemoryState, userId = 'U1') {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => builder(state, table),
  };
}
