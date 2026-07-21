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
  let orderBy: { column: string; ascending: boolean } | null = null;
  let limitTo: number | null = null;
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
    let result = table_.filter(match).map((row) => ({ ...row }));
    if (orderBy) {
      const { column, ascending } = orderBy;
      result = [...result].sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        if (av === bv) return 0;
        const cmp = av! > bv! ? 1 : -1;
        return ascending ? cmp : -cmp;
      });
    }
    if (limitTo != null) result = result.slice(0, limitTo);
    return { data: result, error: null };
  };

  const api = {
    select: () => api,
    insert: (p: Row | Row[]) => ((op = 'insert'), (payload = p), api),
    update: (p: Row) => ((op = 'update'), (payload = p), api),
    delete: () => ((op = 'delete'), api),
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    in: (c: string, v: unknown[]) => (ins.push([c, v]), api),
    is: (c: string, v: unknown) => (iss.push([c, v]), api),
    order: (column: string, opts?: { ascending?: boolean }) => (
      (orderBy = { column, ascending: opts?.ascending ?? true }), api
    ),
    limit: (n: number) => ((limitTo = n), api),
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

/** YYYY-MM-DD в UTC — тот же базис, что CURRENT_DATE в Postgres (см. 0017_ai_global_usage.sql). */
function utcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type AiGlobalUsageRow = { usage_date: string; request_count: number; input_tokens: number; output_tokens: number };

/**
 * Мок ровно двух SECURITY DEFINER функций из 0017_ai_global_usage.sql — не
 * общий SQL-движок, только то, что реально вызывает askAssistant.
 */
const rpcHandlers: Record<string, (state: InMemoryState, args: Record<string, unknown>) => unknown> = {
  get_ai_global_usage_count: (state) => {
    const rows = (state.store.ai_global_usage ??= []) as unknown as AiGlobalUsageRow[];
    const row = rows.find((r) => r.usage_date === utcDateStr());
    return row?.request_count ?? 0;
  },
  increment_ai_global_usage: (state, args) => {
    const pInput = Number(args.p_input);
    const pOutput = Number(args.p_output);
    const rows = (state.store.ai_global_usage ??= []) as unknown as AiGlobalUsageRow[];
    const today = utcDateStr();
    const row = rows.find((r) => r.usage_date === today);
    if (row) {
      row.request_count += 1;
      row.input_tokens += pInput;
      row.output_tokens += pOutput;
    } else {
      rows.push({ usage_date: today, request_count: 1, input_tokens: pInput, output_tokens: pOutput });
    }
    return null;
  },
};

/** Клиент вида Supabase server client: auth.getUser() + from(table) + rpc(fn). */
export function makeClient(state: InMemoryState, userId = 'U1') {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: string) => builder(state, table),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      const handler = rpcHandlers[fn];
      if (!handler) throw new Error(`in-memory-db mock: неизвестная RPC-функция "${fn}"`);
      return { data: handler(state, args), error: null };
    },
  };
}
