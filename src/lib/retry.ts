// Pure: when to try an upload again on a poor signal. Waits grow 2 s, 4 s, 8 s … up to 30 s and never stop while the page is
// open; going back online tries at once (the page listens for it).

export const retryDelay = (attempt: number): number => Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt - 1));

/** Firebase Storage error codes that trying again cannot fix (rules said no, or the file is wrong). */
const FINAL = new Set(['storage/unauthorized', 'storage/unauthenticated', 'storage/invalid-argument', 'storage/canceled', 'storage/invalid-checksum']);

export const isRetryable = (code: string | undefined): boolean => !code || !FINAL.has(code);
