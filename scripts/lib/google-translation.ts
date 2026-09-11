export type TranslationInput = { path: string; sourceText: string };
export type FetchLike = typeof fetch;

export class GoogleTranslationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GoogleTranslationError';
  }
}

export class GoogleTranslationProvider {
  constructor(private readonly config: {
    projectId: string;
    accessToken: () => Promise<string>;
    fetchImpl?: FetchLike;
  }) {}

  async translate(inputs: readonly TranslationInput[]): Promise<string[]> {
    if (!inputs.length) return [];
    const fetchImpl = this.config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(
        `https://translation.googleapis.com/v3/projects/${encodeURIComponent(this.config.projectId)}:translateText`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await this.config.accessToken()}`,
            'Content-Type': 'application/json; charset=utf-8',
            'x-goog-user-project': this.config.projectId,
          },
          body: JSON.stringify({ sourceLanguageCode: 'ru', targetLanguageCode: 'kk', mimeType: 'text/plain', contents: inputs.map(input => input.sourceText) }),
          signal: AbortSignal.timeout(20_000),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network failure';
      if ((error as { name?: string }).name === 'AbortError' || /timeout/i.test(message)) throw new GoogleTranslationError(408, 'request timeout');
      throw new GoogleTranslationError(503, `network failure: ${message}`);
    }
    if (!response.ok) throw new GoogleTranslationError(response.status, await response.text());
    const body = await response.json() as { translations?: Array<{ translatedText?: string }> };
    if (!body.translations || body.translations.length !== inputs.length || body.translations.some(item => typeof item.translatedText !== 'string')) {
      throw new GoogleTranslationError(502, `response count mismatch: expected ${inputs.length}, got ${body.translations?.length ?? 0}`);
    }
    return body.translations.map(item => item.translatedText!);
  }
}

function retryable(error: unknown): boolean {
  if (!(error instanceof GoogleTranslationError)) return false;
  if (error.status === 429) return !/quota|exhausted/i.test(error.message);
  return error.status === 408 || (error.status >= 500 && error.status <= 599);
}

/** Three total attempts: a network timeout after sending remains a checkpointed, possibly billed request. */
export async function retryTranslation<T>(
  operation: () => Promise<T>,
  random: () => number = Math.random,
  sleep: (milliseconds: number) => Promise<void> = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  onRetry: (attempt: number) => void = () => undefined,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!retryable(error) || attempt === 2) throw error;
      onRetry(attempt + 1);
      await sleep(200 * 2 ** attempt + Math.floor(random() * 100));
    }
  }
  throw new Error('unreachable');
}
