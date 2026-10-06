import 'server-only';
import { createClient } from '../server';

/** Trusted practice must never load legacy question bodies into the RSC payload. */
export async function getTopicMetadata(slug: string) {
  const client = await createClient();
  const { data, error } = await client.from('topics').select('id, name_ru, name_kk, slug, subject_id').eq('slug', slug).maybeSingle();
  if (error) {
    console.error('Trusted topic metadata unavailable', { code: error.code });
    throw new Error('Could not load topic');
  }
  return data;
}
