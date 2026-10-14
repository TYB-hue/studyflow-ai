import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorize, consume, readJson, fail, ApiError } from '@/lib/api';
import { validUpload, uploadMime, MAX_FILE_BYTES } from '@/lib/core';
const input = z.object({
  name: z.string().min(1).max(180),
  mime: z.string().max(150),
  size: z.number().int().min(1).max(MAX_FILE_BYTES),
  subject: z.string().trim().min(1).max(80).default('General'),
});
export async function POST(request: Request) {
  try {
    const { db, user } = await authorize(request);
    const parsed = input.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError('Choose a supported file up to 25 MB.');
    const file = parsed.data;
    if (!validUpload(file.name, file.mime, file.size))
      throw new ApiError('Upload PDF, DOCX, PPTX, TXT, PNG, JPEG or WebP, up to 25 MB.');
    if (!process.env.GEMINI_API_KEY)
      throw new ApiError('Gemini is not configured on the server.', 503);
    await consume(db, 'upload');
    const id = crypto.randomUUID();
    const path = `${user.id}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)}`;
    const { data, error } = await db.storage.from('study-materials').createSignedUploadUrl(path);
    if (error || !data)
      throw new ApiError(
        'Unable to prepare private upload. Check the Supabase bucket and policies.',
        503,
      );
    const { error: insertError } = await db
      .from('documents')
      .insert({
        id,
        user_id: user.id,
        title: file.name,
        subject: file.subject,
        storage_path: path,
        mime_type: uploadMime(file.name, file.mime),
        size_bytes: file.size,
        status: 'failed',
        error: 'The upload has not completed. Upload this file again or remove this entry.',
      });
    if (insertError) throw insertError;
    return NextResponse.json(
      { id, path, token: data.token, mime: uploadMime(file.name, file.mime) },
      { status: 201 },
    );
  } catch (error) {
    return fail(error);
  }
}
