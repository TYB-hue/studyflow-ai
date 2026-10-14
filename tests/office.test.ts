import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { extractOffice, DOCX_MIME, PPTX_MIME } from '@/lib/office';
import { validUpload, validSignature, uploadMime, MAX_FILE_BYTES } from '@/lib/core';
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
describe('Office uploads', () => {
  it('accepts Word and PowerPoint up to 25 MiB, rejecting larger files', () => {
    expect(validUpload('notes.docx', DOCX_MIME, MAX_FILE_BYTES)).toBe(true);
    expect(validUpload('slides.pptx', PPTX_MIME, MAX_FILE_BYTES)).toBe(true);
    expect(validUpload('notes.docx', DOCX_MIME, MAX_FILE_BYTES + 1)).toBe(false);
    expect(validUpload('notes.doc', DOCX_MIME, 100)).toBe(false);
    expect(validUpload('notes.docx', 'image/png', 100)).toBe(false);
  });
  it('handles browsers that label Office files as ZIP or provide no MIME', () => {
    expect(uploadMime('notes.docx', '')).toBe(DOCX_MIME);
    expect(validUpload('slides.pptx', 'application/zip', 100)).toBe(true);
  });
  it('extracts paragraphs and decodes XML entities', async () => {
    const bytes = fixture('lesson.docx');
    expect(validSignature(bytes, DOCX_MIME)).toBe(true);
    expect(await extractOffice(bytes, DOCX_MIME)).toEqual([
      { page: 1, text: 'Cells & energy\nMitochondria produce ATP.' },
    ]);
  });
  it('preserves slide order and original slide numbers', async () => {
    const pages = await extractOffice(fixture('lesson.pptx'), PPTX_MIME);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 10]);
    expect(pages[2].text).toContain('Slide 10');
  });
  it('rejects ZIP files disguised as the wrong Office type', async () => {
    await expect(extractOffice(fixture('lesson.docx'), PPTX_MIME)).rejects.toThrow(
      'does not match',
    );
  });
  it('rejects entity declarations and malformed ZIP files', async () => {
    await expect(extractOffice(fixture('unsafe.docx'), DOCX_MIME)).rejects.toThrow('Unsafe');
    await expect(extractOffice(Buffer.from('PK bad file'), DOCX_MIME)).rejects.toThrow('damaged');
  });
});
