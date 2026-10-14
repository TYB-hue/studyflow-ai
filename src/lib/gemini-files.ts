import 'server-only';
import { ApiError } from '@/lib/api';
import { z } from 'zod';
const fileSchema = z.object({
  name: z.string().regex(/^files\/[a-zA-Z0-9_-]+$/),
  uri: z.url(),
  state: z.string().optional(),
});
export async function uploadGeminiFile(bytes: Buffer, mime: string, key: string) {
  const headers = { 'x-goog-api-key': key };
  const start = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mime,
    },
    body: JSON.stringify({ file: { display_name: 'StudyFlow temporary material' } }),
    signal: AbortSignal.timeout(30000),
  });
  const location = start.headers.get('x-goog-upload-url');
  if (!start.ok || !location)
    throw new ApiError('Gemini file upload could not start. Please try again.', 502);
  const target = new URL(location);
  if (target.protocol !== 'https:' || target.hostname !== 'generativelanguage.googleapis.com')
    throw new ApiError('Gemini returned an invalid upload endpoint.', 502);
  const response = await fetch(location, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': mime,
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new ApiError('Gemini file upload failed. Please try again.', 502);
  let file = fileSchema.parse((await response.json()).file);
  try {
    for (let attempt = 0; file.state === 'PROCESSING' && attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const state = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!state.ok) throw new ApiError('Unable to check Gemini file processing.', 502);
      file = fileSchema.parse(await state.json());
    }
    if (file.state === 'FAILED' || file.state === 'PROCESSING')
      throw new ApiError('Gemini could not prepare this file. Please retry.', 502);
    return file;
  } catch (error) {
    await deleteGeminiFile(file.name, key);
    throw error;
  }
}
export async function deleteGeminiFile(name: string, key: string) {
  if (!/^files\/[a-zA-Z0-9_-]+$/.test(name)) return;
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': key },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    /* Gemini also expires temporary files automatically. */
  }
}
