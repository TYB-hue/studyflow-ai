import { describe, it, expect, vi, beforeEach } from 'vitest';
const mock = vi.hoisted(() => ({ insert: vi.fn(), signed: vi.fn(), consume: vi.fn() }));
vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  authorize: async () => ({
    user: { id: '11111111-1111-4111-8111-111111111111' },
    db: {
      storage: { from: () => ({ createSignedUploadUrl: mock.signed }) },
      from: () => ({ insert: mock.insert }),
    },
  }),
  consume: mock.consume,
  readJson: (request: Request) => request.json(),
  fail: (error: Error & { status?: number }) =>
    Response.json({ error: error.message }, { status: error.status || 500 }),
}));
import { POST } from '@/app/api/uploads/route';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GEMINI_API_KEY', 'test');
  mock.signed.mockResolvedValue({ data: { token: 'upload-only-test-token' }, error: null });
  mock.insert.mockResolvedValue({ error: null });
});
const request = (size: number, mime = 'application/pdf') =>
  new Request('http://study.test/api/uploads', {
    method: 'POST',
    body: JSON.stringify({ name: 'lesson.pdf', mime, size, subject: 'Biology' }),
  });
describe('direct private upload preparation', () => {
  it('prepares a 25 MiB upload with an owner-scoped path, not a public URL', async () => {
    const response = await POST(request(25 * 1024 * 1024));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.path).toMatch(/^11111111-1111-4111-8111-111111111111\//);
    expect(body.token).toBe('upload-only-test-token');
    expect(body.signedUrl).toBeUndefined();
    expect(mock.consume).toHaveBeenCalledOnce();
    expect(mock.insert.mock.calls[0][0].user_id).toBe('11111111-1111-4111-8111-111111111111');
  });
  it('rejects oversized metadata before signing or consuming a quota', async () => {
    expect((await POST(request(25 * 1024 * 1024 + 1))).status).toBe(400);
    expect(mock.signed).not.toHaveBeenCalled();
    expect(mock.consume).not.toHaveBeenCalled();
  });
  it('rejects filename/MIME mismatch before signing', async () => {
    expect((await POST(request(100, 'image/png'))).status).toBe(400);
    expect(mock.signed).not.toHaveBeenCalled();
  });
});
