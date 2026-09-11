/** Stable ordering belongs to the caller. Never turn a failed page into a partial success. */
export async function readAllPages<T>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  label: string,
): Promise<T[]> {
  const size = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await readPage(from, from + size - 1);
    if (error || data === null) throw new Error(`Could not load ${label}`);
    rows.push(...data);
    if (data.length < size) return rows;
  }
}
