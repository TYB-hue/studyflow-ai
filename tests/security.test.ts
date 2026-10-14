import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  supabase: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
import { authorize, consume, readJson, boundedBody } from '@/lib/api';
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
describe('API security boundaries', () => {
  it('accepts a canonical origin when Next uses an internal hostname', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://study.test');
    expect(
      (
        await authorize(
          new Request('http://localhost:3000/api/study', {
            method: 'POST',
            headers: { origin: 'https://study.test' },
          }),
        )
      ).user.id,
    ).toBe('user-1');
  });

  it('rejects missing and cross-origin requests before authentication', async () => {
    await expect(
      authorize(new Request('https://study.test/api/study', { method: 'POST' })),
    ).rejects.toThrow('origin');
    await expect(
      authorize(
        new Request('https://study.test/api/study', {
          method: 'POST',
          headers: { origin: 'https://evil.test' },
        }),
      ),
    ).rejects.toThrow('origin');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated requests using verified user identity', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(
      authorize(
        new Request('https://study.test/api/study', {
          method: 'POST',
          headers: { origin: 'https://study.test' },
        }),
      ),
    ).rejects.toThrow('sign in');
  });
  it('allows same-origin authenticated requests', async () => {
    expect(
      (
        await authorize(
          new Request('https://study.test/api/study', {
            method: 'POST',
            headers: { origin: 'https://study.test' },
          }),
        )
      ).user.id,
    ).toBe('user-1');
  });
  it('fails closed when quota checks fail', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('DB') });
    const { db } = await authorize(new Request('https://study.test/api', { method: 'GET' }));
    await expect(consume(db, 'ai')).rejects.toThrow('Unable to check usage');
  });
  it('bounds bodies without relying on Content-Length', async () => {
    await expect(
      boundedBody(
        new Request('https://study.test/api', { method: 'POST', body: 'a'.repeat(30) }),
        20,
      ),
    ).rejects.toThrow('too large');
    await expect(
      readJson(new Request('https://study.test/api', { method: 'POST', body: 'not json' })),
    ).rejects.toThrow('Invalid JSON');
  });
});
