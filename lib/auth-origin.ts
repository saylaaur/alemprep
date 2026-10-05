type AuthOriginEnvironment = {
  siteUrl?: string;
  vercelEnv?: string;
  vercelUrl?: string;
  vercelBranchUrl?: string;
};

function parseOrigin(value: string): string {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error('Invalid authentication origin');
  }
}

/** Keep PKCE initiation and callback on one explicitly registered app origin. */
export function resolveOAuthOrigin(requestOrigin: string | null, env: AuthOriginEnvironment): string {
  const siteOrigin = parseOrigin(env.siteUrl ?? 'http://localhost:3000');
  const allowed = new Set([siteOrigin]);
  if (env.vercelEnv === 'preview') {
    for (const hostname of [env.vercelUrl, env.vercelBranchUrl]) {
      if (hostname && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/i.test(hostname)) {
        allowed.add(parseOrigin(`https://${hostname}`));
      }
    }
    if (!requestOrigin) throw new Error('Invalid authentication origin');
  }
  const origin = requestOrigin ? parseOrigin(requestOrigin) : siteOrigin;
  if (!allowed.has(origin)) throw new Error('Invalid authentication origin');
  return origin;
}
