import { describe, it, expect } from 'vitest';
import {
  chunkPages,
  validUpload,
  validSignature,
  normalize,
  safeNext,
  quizSchema,
  cardSchema,
} from '@/lib/core';
describe('document boundaries', () => {
  it('rejects oversized, empty and disguised uploads', () => {
    expect(validUpload('notes.pdf', 'application/pdf', 800)).toBe(true);
    expect(validUpload('payload.exe', 'application/pdf', 100)).toBe(false);
    expect(validUpload('notes.pdf', 'application/pdf', 26 * 1024 * 1024)).toBe(false);
    expect(validUpload('notes.txt', 'text/plain', 0)).toBe(false);
  });
  it('checks byte signatures', () => {
    expect(validSignature(new TextEncoder().encode('%PDF-1.7'), 'application/pdf')).toBe(true);
    expect(validSignature(new TextEncoder().encode('<script>'), 'application/pdf')).toBe(false);
    expect(validSignature(new Uint8Array([0, 1]), 'text/plain')).toBe(false);
  });
  it('preserves page attribution and overlapping context', () => {
    const chunks = chunkPages([
      { page: 3, text: 'a'.repeat(4000) },
      { page: 4, text: 'other page' },
    ]);
    expect(chunks.map((c) => c.page)).toEqual([3, 3, 3, 4]);
    expect(chunks[0].content.length).toBe(1800);
    expect(chunks[2].content.length).toBe(800);
    expect(() => chunkPages([], 10, 10)).toThrow();
  });
  it('normalizes vectors and rejects invalid provider output', () => {
    expect(normalize([3, 4])).toEqual([0.6, 0.8]);
    expect(() => normalize([0, 0])).toThrow();
    expect(() => normalize([NaN])).toThrow();
  });
});
describe('untrusted AI output and redirects', () => {
  it('rejects impossible quiz answers', () => {
    expect(
      quizSchema.safeParse({
        questions: Array(3).fill({
          question: 'Q',
          options: ['A', 'B', 'C', 'D'],
          answer: 4,
          explanation: 'E',
        }),
      }).success,
    ).toBe(false);
  });
  it('rejects empty flashcard content', () => {
    expect(cardSchema.safeParse({ cards: Array(3).fill({ front: '', back: 'A' }) }).success).toBe(
      false,
    );
  });
  it('blocks external and protocol-relative redirects', () => {
    expect(safeNext('https://evil.test')).toBe('/dashboard');
    expect(safeNext('//evil.test')).toBe('/dashboard');
    expect(safeNext('/\\evil.test')).toBe('/dashboard');
    expect(safeNext('/login?mode=update')).toBe('/login?mode=update');
  });
});
