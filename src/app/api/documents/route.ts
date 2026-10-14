import { NextResponse } from 'next/server';
import { authorize, consume, fail, ApiError, boundedBody } from '@/lib/api';
import { MAX_FILE_BYTES, validUpload, validSignature, uploadMime } from '@/lib/core';
import { processDocument } from '@/lib/processing';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    const { db, user } = await authorize(request);
    const length = Number(request.headers.get('content-length'));
    if (length > MAX_FILE_BYTES + 65536) throw new ApiError('Maximum upload size is 25 MB.', 413);
    if (!process.env.GEMINI_API_KEY)
      throw new ApiError('Gemini is not configured. Set GEMINI_API_KEY on the server.', 503);
    const payload = await boundedBody(request, MAX_FILE_BYTES + 65536);
    const form = await new Response(payload, {
      headers: { 'Content-Type': request.headers.get('content-type') || '' },
    }).formData();
    const file = form.get('file');
    if (!(file instanceof File) || !validUpload(file.name, file.type, file.size))
      throw new ApiError('Upload a PDF, DOCX, PPTX, TXT, PNG, JPEG or WebP file, up to 25 MB.');
    const mime = uploadMime(file.name, file.type);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!validSignature(bytes, mime)) throw new ApiError('File content does not match its type.');
    const subject =
      String(form.get('subject') || 'General')
        .trim()
        .slice(0, 80) || 'General';
    await consume(db, 'upload');
    const id = crypto.randomUUID();
    const path = `${user.id}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)}`;
    const { error: storageError } = await db.storage
      .from('study-materials')
      .upload(path, bytes, { contentType: mime });
    if (storageError) throw storageError;
    const { error } = await db.from('documents').insert({
      id,
      user_id: user.id,
      title: file.name.slice(0, 180),
      subject,
      storage_path: path,
      mime_type: mime,
      size_bytes: file.size,
    });
    if (error) {
      await db.storage.from('study-materials').remove([path]);
      throw error;
    }
    try {
      await processDocument(db, { id, user_id: user.id, mime_type: mime }, bytes);
    } catch {
      return NextResponse.json(
        {
          id,
          status: 'failed',
          error: 'File saved, but processing failed. Open it to see the error and retry.',
        },
        { status: 202 },
      );
    }
    return NextResponse.json({ id, status: 'ready' }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
