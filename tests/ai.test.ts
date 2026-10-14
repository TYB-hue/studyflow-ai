import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/api', () => ({
  ApiError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
import { embed, extract, groq } from '@/lib/ai';
import { summarySchema } from '@/lib/core';
beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubEnv('GROQ_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('provider integrations', () => {
  it('uses document embedding task and requests 768 dimensions', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: Array(768).fill(1) } }),
    });
    vi.stubGlobal('fetch', fetcher);
    const vector = await embed('biology', 'RETRIEVAL_DOCUMENT');
    expect(vector.length).toBe(768);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.outputDimensionality).toBe(768);
    expect(body.taskType).toBe('RETRIEVAL_DOCUMENT');
    expect(Math.sqrt(vector.reduce((s, v) => s + v * v, 0))).toBeCloseTo(1);
  });
  it('rejects embedding dimension mismatch', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ embedding: { values: [1, 2] } }) }),
    );
    await expect(embed('x', 'RETRIEVAL_QUERY')).rejects.toThrow();
  });
  it('sends binary files to Gemini and preserves extracted pages', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify({ pages: [{ page: 7, text: 'ATP' }] }) }] },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetcher);
    expect(await extract(Buffer.from('%PDF-'), 'application/pdf')).toEqual([
      { page: 7, text: 'ATP' },
    ]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).contents[0].parts[1].inlineData.mimeType).toBe(
      'application/pdf',
    );
  });
  it('does not silently substitute demo content on AI failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(groq('summarize', 'notes', summarySchema)).rejects.toThrow('rate-limited');
  });
  it('validates Groq structured output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"summary":"ATP supplies energy. (p. 1)"}' } }],
        }),
      }),
    );
    expect((await groq('summary', 'source', summarySchema)).summary).toContain('ATP');
  });
});
describe('large Gemini file transport', () => {
  it('uploads large binary inputs separately and cleans up temporary files', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(async (url: string, options: { method?: string }) => {
        if (url.includes('/upload/v1beta/files'))
          return {
            ok: true,
            headers: new Headers({
              'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/session',
            }),
          };
        if (url.endsWith('/upload/session'))
          return {
            ok: true,
            json: async () => ({
              file: {
                name: 'files/test123',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/test123',
                state: 'ACTIVE',
              },
            }),
          };
        if (options.method === 'DELETE') return { ok: true };
        return {
          ok: true,
          json: async () => ({
            candidates: [
              { content: { parts: [{ text: '{"pages":[{"page":1,"text":"Cells use ATP."}]}' }] } },
            ],
          }),
        };
      });
    vi.stubGlobal('fetch', fetcher);
    const pages = await extract(Buffer.alloc(11 * 1024 * 1024), 'application/pdf');
    expect(pages[0].text).toContain('ATP');
    const generation = fetcher.mock.calls.find(([url]) => url.includes(':generateContent'))!;
    expect(JSON.parse(generation[1].body).contents[0].parts[1].fileData.fileUri).toContain(
      'files/test123',
    );
    expect(fetcher.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(true);
  });
});
describe('processing and free-tier regressions', () => {
  it('skips empty and whitespace PDF pages without renumbering the others', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      pages: [
                        { page: 1, text: '' },
                        { page: 2, text: 'ATP' },
                        { page: 60, text: '  ' },
                        { page: 61, text: 'Energy' },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }),
    );
    expect(await extract(Buffer.from('%PDF-'), 'application/pdf')).toEqual([
      { page: 2, text: 'ATP' },
      { page: 61, text: 'Energy' },
    ]);
  });
  it('gives a readable error for a completely blank PDF', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"pages":[{"page":1,"text":""}]}' }] } }],
          }),
        }),
    );
    await expect(extract(Buffer.from('%PDF-'), 'application/pdf')).rejects.toThrow(
      'No readable text',
    );
  });
  it('honors short retry delays and retries transient rate limits once', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '0' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"summary":"ATP"}' } }] }),
      });
    vi.stubGlobal('fetch', fetcher);
    expect((await groq('summary', 'source', summarySchema)).summary).toBe('ATP');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).max_completion_tokens).toBe(2500);
  });
  it('returns an actionable provider rate limit without waiting a full minute', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, headers: new Headers({ 'retry-after': '60' }) });
    vi.stubGlobal('fetch', fetcher);
    await expect(groq('summary', 'source', summarySchema)).rejects.toMatchObject({
      status: 429,
      message: 'Groq is rate-limited. Wait about 60 seconds, then retry.',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
