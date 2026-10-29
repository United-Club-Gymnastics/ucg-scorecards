import { describe, expect, it } from 'vitest';
import { checkQr } from '../../src/lib/qr-check';
import { isRetryable, retryDelay } from '../../src/lib/retry';

const k = { meetId: 'testmeet-ab12', sessionId: 's1-green', event: 'FX', squad: 'A', page: 1 };
const link = (over: Partial<typeof k>) => {
  const x = { ...k, ...over };
  return `https://scorecards.unitedclubgymnastics.org/#/s/${x.meetId}/${x.sessionId}/${x.event}/${x.squad}/${x.page}`;
};

describe('QR in the photo', () => {
  it('matches the scanned sheet, names another one, or could not be read', () => {
    expect(checkQr(link({}), k)).toEqual({ kind: 'match' });
    expect(checkQr(link({ squad: 'B' }), k)).toEqual({ kind: 'other', found: { ...k, squad: 'B' } });
    expect(checkQr(link({ sessionId: 's2-green' }), k).kind).toBe('other');
    expect(checkQr(null, k)).toEqual({ kind: 'unread' });
    expect(checkQr('https://example.com/menu', k)).toEqual({ kind: 'unread' });
  });
});

describe('upload retries', () => {
  it('waits longer each time, up to 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(retryDelay)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('gives up only when trying again cannot help', () => {
    expect(isRetryable('storage/retry-limit-exceeded')).toBe(true);
    expect(isRetryable('storage/unknown')).toBe(true);
    expect(isRetryable('auth/network-request-failed')).toBe(true);
    expect(isRetryable(undefined)).toBe(true);
    expect(isRetryable('storage/unauthorized')).toBe(false);
    expect(isRetryable('storage/canceled')).toBe(false);
  });
});
