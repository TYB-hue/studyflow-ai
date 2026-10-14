import { z } from 'zod';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60000;
export const mimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];
export function validUpload(name: string, mime: string, size: number) {
  const ext = name.toLowerCase().split('.').pop();
  const expected: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    txt: 'text/plain',
  };
  return size > 0 && size <= MAX_FILE_BYTES && expected[ext || ''] === uploadMime(name, mime);
}
export function validSignature(bytes: Uint8Array, mime: string) {
  if (mime.includes('openxmlformats-officedocument'))
    return bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
  if (mime === 'text/plain') return !bytes.includes(0);
  if (mime === 'application/pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (mime === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return (
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  );
}
export function chunkPages(pages: { page: number; text: string }[], size = 1800, overlap = 200) {
  if (size <= overlap || overlap < 0) throw new Error('Invalid chunk sizes');
  return pages.flatMap((p) => {
    const chunks = [];
    for (let offset = 0; offset < p.text.length; offset += size - overlap) {
      const content = p.text.slice(offset, offset + size).trim();
      if (content) chunks.push({ page: p.page, content });
      if (offset + size >= p.text.length) break;
    }
    return chunks;
  });
}
export const questionSchema = z.object({
  question: z.string().min(1).max(2000),
  options: z.array(z.string().min(1).max(1000)).length(4),
  answer: z.number().int().min(0).max(3),
  explanation: z.string().min(1).max(3000),
});
export const quizSchema = z.object({ questions: z.array(questionSchema).min(3).max(10) });
export const cardSchema = z.object({
  cards: z
    .array(z.object({ front: z.string().min(1).max(2000), back: z.string().min(1).max(3000) }))
    .min(3)
    .max(12),
});
export const summarySchema = z.object({ summary: z.string().min(1).max(20000) });
export const chatSchema = z.object({
  answer: z.string().min(1).max(16000),
  citations: z.array(z.number().int().min(1)).max(6),
});
export function normalize(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (!norm || vector.some((v) => !Number.isFinite(v))) throw new Error('Invalid embedding');
  return vector.map((v) => v / norm);
}
export function safeNext(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : '/dashboard';
}

export function uploadMime(name: string, provided: string) {
  const ext = name.toLowerCase().split('.').pop();
  if (['', 'application/octet-stream', 'application/zip'].includes(provided)) {
    if (ext === 'docx')
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === 'pptx')
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return provided;
}
