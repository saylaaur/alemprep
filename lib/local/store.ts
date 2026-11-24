import 'server-only';

import { cookies } from 'next/headers';
import { decodeState, encodeState, LOCAL_COOKIE, type LocalState } from './state';

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Читать можно везде (страницы, server actions). */
export async function readLocalState(): Promise<LocalState> {
  const jar = await cookies();
  return decodeState(jar.get(LOCAL_COOKIE)?.value);
}

/** Писать — только из server actions и route handlers (так устроен Next). */
export async function writeLocalState(state: LocalState): Promise<void> {
  const jar = await cookies();
  jar.set(LOCAL_COOKIE, encodeState(state), {
    path: '/',
    maxAge: ONE_YEAR,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Прочитать, изменить, записать. */
export async function updateLocalState(change: (state: LocalState) => LocalState): Promise<LocalState> {
  const next = change(await readLocalState());
  await writeLocalState(next);
  return next;
}
